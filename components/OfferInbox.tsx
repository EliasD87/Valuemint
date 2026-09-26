"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { Hex } from "viem";
import { boundsOf, fetchTokenCriteria, rootKey, tokenCriteriaKey, traitLabel } from "@/hooks/useCriteria";
import Link from "next/link";
import { Art } from "@/components/Art";
import { Soso } from "@/components/Soso";
import { TxResult } from "@/components/TxResult";
import { whenExpires } from "@/components/Offers";
import { useAccount } from "wagmi";
import { useOwnOfferExposure, useSeaportOrders, type SeaportOrder } from "@/hooks/useSeaportOrders";
import { useSeaportFill, useSeaportTrade } from "@/hooks/useSeaportTrade";
import { FillBlocked } from "@/components/FillBlocked";
import { useCanPayFeeInWsoso } from "@/hooks/useWsoso";
import { formatSoso } from "@/lib/format";
import { AddressLink } from "@/components/AddressLink";
import { currencyLabel, fulfillerOutlay } from "@/lib/seaport";
import { deployment } from "@/config/contracts";
import "./OfferInbox.css";

/**
 * Every offer standing on something the connected wallet owns, in one place.
 *
 * The question this answers is the one an owner actually has - "has anyone bid
 * on anything of mine?" - rather than "what has been bid on this token?". A
 * collection of one design in five editions is five identical pictures, and a
 * bid sits on exactly one of them; the holder of that one was never told, and
 * the other four found an Accept button that was not theirs to press.
 *
 * Collection-wide offers now land here too. Under the old contract they could
 * not: an offer named one token id and only that token's holder could take it,
 * which is exactly the complaint that started this rebuild. A Seaport criteria
 * offer names none, so it appears against whichever piece the owner actually
 * holds - and each offer gets one row, not one per matching piece.
 *
 * It costs nothing extra to ask. `useSeaportOrders` is one marketplace-wide scan
 * with a constant key, already made by every card in the grid below, so React
 * Query hands this the same cached result.
 */

/** The part of a holding this needs; deliberately not the whole token type. */
export interface Held {
  collection: `0x${string}`;
  collectionName: string;
  id: bigint;
  design?: string;
  image?: string;
}

interface Row {
  token: Held;
  offer: SeaportOrder;
  /** A trait offer's name, and this piece's proof into its set. */
  trait?: string;
  proof?: Hex[];
}

/** A sale made from this inbox, kept after its row is gone. */
interface Sold {
  hash: `0x${string}`;
  piece: string;
  price: bigint;
  currency: `0x${string}`;
}

/** An accept that could not happen — the offer was taken or withdrawn first. */
interface Gone {
  key: string;
  piece: string;
  say: string;
}

export function OfferInbox({ holdings, onChange }: { holdings: Held[]; onChange: () => void }) {
  const { orders, traitOffers } = useSeaportOrders();

  /**
   * Accepting sells the piece, the piece leaves the wallet, and its row — and
   * the "Sold" beside the button — went with it on the next refresh. The
   * seller saw nothing at all. The note lives here instead, above the rows.
   */
  const [sold, setSold] = useState<Sold[]>([]);
  const onSold = useCallback(
    (s: Sold) => setSold((all) => (all.some((x) => x.hash === s.hash) ? all : [s, ...all])),
    [],
  );

  /**
   * The same for an accept that found the offer gone. The check refuses, the
   * book is re-read, the offer is no longer live — and the row carrying the
   * explanation disappeared with it, so the holder saw their button vanish and
   * nothing else.
   */
  const [gone, setGone] = useState<Gone[]>([]);
  const onGone = useCallback(
    (g: Gone) => setGone((all) => (all.some((x) => x.key === g.key) ? all : [g, ...all].slice(0, 3))),
    [],
  );
  const { address } = useAccount();

  /**
   * Your own bids are not offers you can take. A collection or trait offer
   * matches any piece you hold in that collection — including when you made
   * it — and listed here it read as money waiting for you.
   */
  const isMine = (o: SeaportOrder) => address !== undefined && o.maker.toLowerCase() === address.toLowerCase();

  /**
   * Trait offers need the server to say which held pieces are in each set, and
   * the proof for each. Asked only for pieces in collections that have a trait
   * offer standing, one cached request per piece.
   */
  const traitCollections = useMemo(
    () => new Set(traitOffers.filter((o) => o.fillable).map((o) => o.collection.toLowerCase())),
    [traitOffers],
  );
  const candidates = useMemo(
    () => holdings.filter((h) => traitCollections.has(h.collection.toLowerCase())),
    [holdings, traitCollections],
  );
  /** Per collection, the snapshots its standing trait offers were made at. */
  const boundsByCollection = useMemo(() => {
    const by = new Map<string, bigint[]>();
    for (const c of traitCollections) {
      by.set(c, boundsOf(traitOffers.filter((o) => o.fillable && o.collection.toLowerCase() === c)));
    }
    return by;
  }, [traitOffers, traitCollections]);
  const memberships = useQueries({
    queries: candidates.map((h) => {
      const bounds = boundsByCollection.get(h.collection.toLowerCase());
      return {
        queryKey: tokenCriteriaKey(h.collection, h.id, bounds),
        staleTime: 5 * 60_000,
        queryFn: () => fetchTokenCriteria(h.collection, h.id, bounds),
      };
    }),
  });

  const rows = useMemo<Row[]>(() => {
    const found = new Map<string, Row>();

    for (const offer of orders) {
      if (offer.kind !== "offer" || isMine(offer)) continue;

      /**
       * The piece this offer would be settled with. A bid naming a token needs
       * that exact one; a collection bid takes any, so the first held piece in
       * that collection stands for it.
       *
       * Keyed by order hash so one offer is one row. Listing a collection-wide
       * bid against every matching piece would report one offer as five.
       */
      const match = holdings.find(
        (h) =>
          h.collection.toLowerCase() === offer.collection.toLowerCase() &&
          (offer.tokenId === undefined || offer.tokenId === h.id),
      );
      if (match === undefined) continue;

      found.set(offer.hash, { token: match, offer });
    }

    /**
     * A trait offer takes only a held piece the server places in its set,
     * sent with that piece's proof. A piece outside the set is never offered
     * here — and Seaport would refuse it if it were.
     */
    for (const offer of traitOffers) {
      if (!offer.fillable || offer.criteria === undefined || isMine(offer)) continue;
      const key = rootKey(offer.criteria);
      for (let i = 0; i < candidates.length; i++) {
        const h = candidates[i]!;
        if (h.collection.toLowerCase() !== offer.collection.toLowerCase()) continue;
        const m = memberships[i]?.data?.find((x) => rootKey(x.root) === key);
        if (m === undefined) continue;
        found.set(offer.hash, { token: h, offer, trait: traitLabel(m), proof: m.proof });
        break;
      }
    }

    // Best money first - the reason anyone opens this.
    return [...found.values()].sort((a, b) =>
      b.offer.priceWei > a.offer.priceWei ? 1 : b.offer.priceWei < a.offer.priceWei ? -1 : 0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isMine reads only `address`
  }, [holdings, orders, traitOffers, candidates, memberships, address]);

  if (rows.length === 0 && sold.length === 0 && gone.length === 0) return null;

  return (
    <div className="inbox card">
      <div className="inbox-head">
        <p className="eyebrow">Offers you can take</p>
        <span className="inbox-count">
          {rows.length === 0 ? "No live offers" : rows.length === 1 ? "1 live offer" : `${rows.length} live offers`}
        </span>
      </div>

      {sold.map((s) => (
        <p key={s.hash} className="txr txr-good">
          Sold {s.piece} for{" "}
          <Soso size={13} unit={currencyLabel(s.currency)}>
            {formatSoso(s.price)}
          </Soso>
          . It is in your balance above as WSOSO, which unwraps to SOSO one for one.{" "}
          <a href={`${deployment.explorer}/tx/${s.hash}`} target="_blank" rel="noreferrer noopener">
            View transaction
          </a>
        </p>
      ))}

      {gone.map((g) => (
        <div key={g.key} className="fill-blocked" role="status" aria-live="polite">
          <p>
            <b>{g.piece}:</b> {g.say}
          </p>
        </div>
      ))}

      {rows.length === 0 ? null : (
        <ul className="inbox-list">
          {rows.map((r) => (
            <InboxRow key={r.offer.hash} row={r} onChange={onChange} onSold={onSold} onGone={onGone} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One offer, with the button that takes it.
 *
 * A row rather than a loop body because accepting needs hooks scoped to a single
 * collection, and holdings can span several.
 */
function InboxRow({
  row,
  onChange,
  onSold,
  onGone,
}: {
  row: Row;
  onChange: () => void;
  onSold: (s: Sold) => void;
  onGone: (g: Gone) => void;
}) {
  const { token, offer } = row;
  const trade = useSeaportTrade(token.collection);
  const fill = useSeaportFill();
  const { address } = useAccount();
  /** Exact allowances: cover the fee without revoking cover for our own bids. */
  const ownBids = useOwnOfferExposure(address, deployment.wsoso as `0x${string}`);

  /**
   * Two permissions, and the second is easy to miss.
   *
   * Seaport cannot move the piece without the collection approval. It also pays
   * the bid to the holder and pulls the marketplace fee straight back out in
   * WSOSO, so the holder needs an allowance for a token they never have to hold.
   * The previous marketplace took its cut from the money in flight and never
   * asked, so this one fails as a bare wallet revert when it is skipped.
   */
  // Read from the order, not from FEE_BPS - a third-party bid may charge more.
  const feeAllowance = useCanPayFeeInWsoso(fulfillerOutlay(offer.params), ownBids);

  useEffect(() => {
    if (fill.isSuccess && fill.hash !== undefined) {
      onSold({
        hash: fill.hash,
        piece: `${token.design ?? token.collectionName} #${token.id.toString()}`,
        price: offer.priceWei,
        currency: offer.currency,
      });
    }
    if (trade.isSuccess || fill.isSuccess || feeAllowance.isSuccess) {
      onChange();
      void trade.refetchApproval();
      feeAllowance.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash, fill.isSuccess, fill.hash, feeAllowance.isSuccess]);

  /* Refused before sending, or beaten to it on chain: tell the inbox, which outlives this row. */
  useEffect(() => {
    const piece = `${token.design ?? token.collectionName} #${token.id.toString()}`;
    if (fill.blocked !== undefined) onGone({ key: `${offer.hash}:blocked`, piece, say: fill.blocked.say });
    else if (fill.reverted && fill.error !== null) onGone({ key: `${offer.hash}:reverted`, piece, say: fill.error.message });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill.blocked, fill.reverted]);

  const mustApprove = trade.needsApproval;
  const mustAllowFee = !mustApprove && feeAllowance.needsAllowance;
  const busy = trade.busy || fill.busy || feeAllowance.busy;

  return (
    <li className="inbox-row">
      <Link className="inbox-piece" href={`/token/${token.collection}/${token.id}`}>
        <span className="inbox-thumb">
          {token.image !== undefined ? (
            <Art src={token.image} alt="" sizes="56px" />
          ) : (
            <span className="inbox-thumb-empty" aria-hidden="true" />
          )}
        </span>
        <span className="inbox-names">
          <b>
            {token.design ?? token.collectionName} <span className="dim">#{token.id.toString()}</span>
          </b>
          <span className="inbox-coll">{token.collectionName}</span>
        </span>
      </Link>

      <span className="inbox-offer">
        <Soso size={16} unit={currencyLabel(offer.currency)}>
          {formatSoso(offer.priceWei)}
        </Soso>
        <span className="inbox-meta">
          {row.trait !== undefined ? `for ${row.trait} · ` : offer.tokenId === undefined ? "for any piece · " : ""}
          from <AddressLink address={offer.maker} chars={4} /> · {whenExpires(offer.endTime)}
        </span>
      </span>

      <span className="inbox-act">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          /**
           * No price floor is passed. A Seaport order is immutable — a bidder
           * cannot lower an offer in place, only cancel it and make a different
           * one with a different hash. The previous marketplace needed a
           * `minPrice` guard precisely because its offers could be overwritten
           * downward in the block before an accept landed.
           */
          onClick={() => {
            if (mustApprove) trade.approve();
            else if (mustAllowFee) feeAllowance.allow();
            else fill.acceptOffer(offer, token.id, row.proof);
          }}
        >
          {busy
            ? "Working…"
            : mustApprove
              ? "Approve, then accept"
              : mustAllowFee
                ? "Allow fee, then accept"
                : "Accept offer"}
        </button>
        {mustApprove ? (
          <span className="inbox-fine">One approval per collection, then accept.</span>
        ) : mustAllowFee ? (
          <span className="inbox-fine">The fee is taken in WSOSO from what you are paid.</span>
        ) : null}
      </span>

      {/*
        An offer withdrawn while this row sat on screen is the likeliest way an
        Accept here fails, and this inbox is where somebody sits looking at a
        list of them. Refusing in silence left a button that appeared to do
        nothing at all.
      */}
      <FillBlocked blocked={fill.blocked} />

      <TxResult
        hash={fill.hash ?? trade.hash}
        confirming={fill.confirming || trade.confirming}
        success={fill.isSuccess || trade.isSuccess}
        error={fill.error ?? trade.error ?? feeAllowance.error}
        successLabel="Sold"
      />
    </li>
  );
}
