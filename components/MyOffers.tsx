"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useOrdersBy } from "@/hooks/useSeaportOrders";
import { useSeaportTrade } from "@/hooks/useSeaportTrade";
import type { SeaportOrder } from "@/hooks/useSeaportOrders";
import { formatSoso } from "@/lib/format";
import { whenExpires } from "@/components/Offers";
import { Soso } from "@/components/Soso";
import "@/styles/activity.css";

/**
 * The bids this wallet has standing, and the way to take them back.
 *
 * ---
 *
 * **A live offer was reachable only through the piece it names.** Withdrawing
 * one meant remembering which token it was on, finding that token, and
 * scrolling to the offers list — and the case where somebody most wants to
 * withdraw is exactly the case where that is hardest: you bid on a listed
 * piece, somebody else bought it first, and now it is not in your portfolio,
 * not in your holdings and not anywhere you would think to look. The bid is
 * still live, the WSOSO behind it is still committed, and the only trace is a
 * line in a history panel saying "Offered" six hours ago.
 *
 * "Your trades" cannot solve it, because it is history: those rows are events
 * that happened, and an event cannot be cancelled. This is the other thing —
 * the orders that are still standing — and it is a list of controls rather
 * than a record.
 *
 * **The money is the headline.** WSOSO behind a standing bid stays in the
 * bidder's own wallet, which is the point of the design and also why it is
 * invisible: nothing looks missing. The total at the top is what cannot be
 * spent until these are withdrawn or taken.
 *
 * Renders nothing when there are no standing bids.
 */
export function MyOffers({ address }: { address: `0x${string}` | undefined }) {
  const { offers, isLoading } = useOrdersBy(address);

  const committed = useMemo(
    () => offers.reduce((total, o) => total + o.priceWei, 0n),
    [offers],
  );

  if (address === undefined) return null;
  if (isLoading && offers.length === 0) return null;
  if (offers.length === 0) return null;

  return (
    <div className="act-panel act-panel-standalone">
      <div className="act-head">
        <p className="act-title">Your offers</p>
        <span className="act-count">
          <Soso size={12} unit="WSOSO">
            {formatSoso(committed)}
          </Soso>{" "}
          committed
        </span>
      </div>

      <ul className="act-list">
        {offers.map((o) => (
          <OfferRow key={o.hash} order={o} />
        ))}
      </ul>

      <p className="act-note">
        Withdrawing frees the WSOSO behind a bid. Until then it stays in your wallet but
        cannot be spent twice.
      </p>
    </div>
  );
}

/**
 * One standing bid.
 *
 * Its own component because `useSeaportTrade` is scoped to a collection and a
 * wallet can hold bids across several — a hook cannot be called in a loop, so
 * the loop calls a component instead.
 */
function OfferRow({ order }: { order: SeaportOrder }) {
  const trade = useSeaportTrade(order.collection);

  /** A collection-wide bid names no token; it is an offer on any piece. */
  const piece =
    order.tokenId === undefined ? "Any piece" : `#${order.tokenId.toString()}`;

  return (
    <li className="act-row act-row-offer">
      <span className="act-kind act-kind-flat">Offered</span>

      {order.tokenId === undefined ? (
        <span className="act-token act-token-any">{piece}</span>
      ) : (
        <Link className="act-token" href={`/token/${order.collection}/${order.tokenId}`}>
          {piece}
        </Link>
      )}

      <span className="act-price">
        <Soso size={15} unit="WSOSO">
          {formatSoso(order.priceWei)}
        </Soso>
      </span>

      <span className="act-when">{whenExpires(order.endTime)}</span>

      <button
        type="button"
        className="btn btn-sm act-withdraw"
        disabled={trade.busy}
        onClick={() => trade.cancelOrder(order)}
      >
        {trade.busy ? "Withdrawing…" : "Withdraw"}
      </button>
    </li>
  );
}
