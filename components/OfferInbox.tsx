"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Art } from "@/components/Art";
import { Soso } from "@/components/Soso";
import { TxResult } from "@/components/TxResult";
import { whenExpires } from "@/components/Offers";
import { useAllOffers, offerKey, type OfferSummary } from "@/hooks/useAllOffers";
import { useTrade } from "@/hooks/useTrade";
import { formatSoso, shortAddress } from "@/lib/format";
import "./OfferInbox.css";

/**
 * Every offer standing on something the connected wallet owns, in one place.
 *
 * Offers are keyed by token in the contract, and the only place the app ever
 * showed one with an Accept beside it was that token's own page. That is fine
 * when you know which piece was bid on and unusable when you do not: a
 * collection of one design in five editions is five identical pictures, and
 * the offer sits on exactly one of them. The owner of that one is not told, and
 * the other four holders find an Accept button that is not theirs to press.
 *
 * So the question this answers is the one an owner actually has — "has anyone
 * bid on anything of mine?" — rather than "what has been bid on this token?".
 *
 * It costs nothing extra to ask: `useAllOffers` is a single marketplace-wide
 * query with a constant key, already being made by every card in the grid
 * below, so React Query hands this the same cached result.
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
  offer: OfferSummary;
}

export function OfferInbox({ holdings, onChange }: { holdings: Held[]; onChange: () => void }) {
  const offers = useAllOffers();

  const rows = useMemo<Row[]>(() => {
    const found: Row[] = [];
    for (const token of holdings) {
      const offer = offers.get(offerKey(token.collection, token.id));
      if (offer !== undefined) found.push({ token, offer });
    }
    // Best money first — the reason anyone opens this.
    return found.sort((a, b) => (b.offer.best > a.offer.best ? 1 : b.offer.best < a.offer.best ? -1 : 0));
  }, [holdings, offers]);

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
          <InboxRow key={offerKey(r.token.collection, r.token.id)} row={r} onChange={onChange} />
        ))}
      </ul>
    </div>
  );
}

/**
 * One offer, with the button that takes it.
 *
 * A row rather than a loop body because accepting needs `useTrade`, and that
 * hook is scoped to a single collection â€” holdings can span several, and a
 * hook cannot be called per iteration.
 */
function InboxRow({ row, onChange }: { row: Row; onChange: () => void }) {
  const { token, offer } = row;
  const trade = useTrade(token.collection);

  // On the receipt, never on the click â€” see the note in TokenView.
  useEffect(() => {
    if (trade.isSuccess) {
      onChange();
      void trade.refetchApproval();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.isSuccess, trade.hash]);

  /**
   * The marketplace cannot move the piece without this, so `acceptOffer`
   * reverts without it. Asking here, in the same row, is the difference
   * between two deliberate transactions and one unexplained wallet error.
   */
  const mustApprove = trade.needsApproval;

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
        <Soso size={16} unit="WSOSO">
          {formatSoso(offer.best)}
        </Soso>
        <span className="inbox-meta">
          {offer.count > 1 ? `best of ${offer.count} Â· ` : ""}
          from {shortAddress(offer.bidder, 4)} Â· {whenExpires(offer.expiry)}
        </span>
      </span>

      <span className="inbox-act">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={trade.busy}
          /* The price on screen is the floor: a bidder can overwrite their own
             offer downward, and the contract refuses rather than settling at
             the lower number. */
          onClick={() =>
            mustApprove ? trade.approve() : trade.acceptOffer(token.id, offer.bidder, offer.best)
          }
        >
          {trade.busy ? "Workingâ€¦" : mustApprove ? "Approve first" : "Accept"}
        </button>
        {mustApprove ? (
          <span className="inbox-fine">One approval per collection, then accept.</span>
        ) : null}
      </span>

      <TxResult
        hash={trade.hash}
        confirming={trade.confirming}
        success={trade.isSuccess}
        error={trade.error}
        successLabel="Sold"
      />
    </li>
  );
}
