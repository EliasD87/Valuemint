"use client";

import { useEffect, useMemo } from "react";
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
}

export function OfferInbox({ holdings, onChange }: { holdings: Held[]; onChange: () => void }) {
  const { orders } = useSeaportOrders();

  const rows = useMemo<Row[]>(() => {
    const found = new Map<string, Row>();

    for (const offer of orders) {
      if (offer.kind !== "offer") continue;

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

    // Best money first - the reason anyone opens this.
    return [...found.values()].sort((a, b) =>
      b.offer.priceWei > a.offer.priceWei ? 1 : b.offer.priceWei < a.offer.priceWei ? -1 : 0,
    );
  }, [holdings, orders]);

  if (rows.length === 0) return null;

  return (
    <div className="inbox card">
      <div className="inbox-head">
        <p className="eyebrow">Offers you can take</p>
        <span className="inbox-count">
          {rows.length === 1 ? "1 live offer" : `${rows.length} live offers`}
        </span>
      </div>

      <ul className="inbox-list">
        {rows.map((r) => (
          <InboxRow key={r.offer.hash} row={r} onChange={onChange} />
        ))}
      </ul>
    </div>
  );
}

/**
 * One offer, with the button that takes it.
 *
 * A row rather than a loop body because accepting needs hooks scoped to a single
 * collection, and holdings can span several.
 */
function InboxRow({ row, onChange }: { row: Row; onChange: () => void }) {
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
    if (trade.isSuccess || fill.isSuccess || feeAllowance.isSuccess) {
      onChange();
      void trade.refetchApproval();
      feeAllowance.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash, fill.isSuccess, fill.hash, feeAllowance.isSuccess]);

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
          {offer.tokenId === undefined ? "for any piece · " : ""}
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
            else fill.acceptOffer(offer, token.id);
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
