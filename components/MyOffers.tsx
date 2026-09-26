"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useOrdersBy } from "@/hooks/useSeaportOrders";
import { useSeaportTrade } from "@/hooks/useSeaportTrade";
import { boundsOf, rootKey, traitLabel, useCriteriaSets } from "@/hooks/useCriteria";
import { useAllCollections } from "@/hooks/useAllCollections";
import type { SeaportOrder } from "@/hooks/useSeaportOrders";
import { formatSosoFixed, shortAddress } from "@/lib/format";
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
export function MyOffers({
  address,
  bare = false,
  own = true,
}: {
  address: `0x${string}` | undefined;
  /**
   * The viewer made these bids. False on somebody else's /address page: the
   * list is still worth seeing — what a collector is bidding on — but only the
   * maker can withdraw a Seaport order, so the column of buttons goes.
   */
  own?: boolean;
  /**
   * Render only the list, for a panel that owns the frame and the title.
   *
   * Standalone, an empty list renders nothing — there is nothing to say and no
   * reason to take up the column. Inside a switch it has to answer: the reader
   * pressed "Offers" and is owed "you have none", not a blank.
   */
  bare?: boolean;
}) {
  const { offers, isLoading } = useOrdersBy(address);

  const committed = useMemo(
    () => offers.reduce((total, o) => total + o.priceWei, 0n),
    [offers],
  );

  const { collections } = useAllCollections();
  const nameFor = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of collections) names.set(c.address.toLowerCase(), c.name);
    return (a: string) => names.get(a.toLowerCase()) ?? shortAddress(a as `0x${string}`, 4);
  }, [collections]);

  if (address === undefined) return null;

  if (offers.length === 0) {
    if (!bare) return null;
    return (
      <p className="act-note">
        {isLoading
          ? `Reading ${own ? "your" : "this wallet's"} offers from the chain…`
          : own
            ? "No standing offers. Anything you bid on shows here until it is taken, expires or you withdraw it."
            : "No standing offers from this wallet."}
      </p>
    );
  }

  const summary = (
    <>
      <Soso size={12} unit="WSOSO">
        {formatSosoFixed(committed)}
      </Soso>{" "}
      committed
    </>
  );

  /* The same table as the trades beside it, so switching tabs changes the
     rows and not the shape. The sentence that used to follow it explained
     what "Withdraw" does; the button and the committed total say it. */
  const body = (
    <div className="tr-scroll">
      <table className="tr-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="tr-num">
              Offer
            </th>
            {own ? (
              <th scope="col">
                <span className="tr-sr">Action</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {offers.map((o) => (
            <OfferRow key={o.hash} order={o} name={nameFor(o.collection)} own={own} />
          ))}
        </tbody>
      </table>
    </div>
  );

  if (bare) {
    return (
      <>
        <p className="act-summary">{summary}</p>
        {body}
      </>
    );
  }

  return (
    <div className="act-panel act-panel-standalone">
      <div className="act-head">
        <p className="act-title">Your offers</p>
        <span className="act-count">{summary}</span>
      </div>
      {body}
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
function OfferRow({ order, name, own }: { order: SeaportOrder; name: string; own: boolean }) {
  const trade = useSeaportTrade(order.collection);

  /**
   * A collection-wide bid names no token: any piece. A trait bid names none
   * either, and is named by its set — or, where the site no longer recognises
   * the root, as a trait offer plainly, so its maker can still find and cancel
   * it. It is never called "Any piece".
   */
  const isTrait = order.criteria !== undefined && order.criteria !== 0n;
  const { byRoot } = useCriteriaSets(isTrait ? order.collection : undefined, boundsOf([order]));
  const set = isTrait ? byRoot.get(rootKey(order.criteria!)) : undefined;
  const piece =
    order.tokenId !== undefined
      ? `#${order.tokenId.toString()}`
      : isTrait
        ? set === undefined
          ? "Trait offer"
          : traitLabel(set)
        : "Any piece";

  /* Two lines, the same shape as a trade row: the piece over its collection,
     the amount over how long it has left. */
  const item = (
    <>
      <b>{piece}</b>
      <span className="tr-l2 tr-coll">{name}</span>
    </>
  );

  return (
    <tr>
      <td className="tr-item">
        {order.tokenId === undefined ? (
          <span className="tr-stack" title={name}>
            {item}
          </span>
        ) : (
          <Link className="tr-stack" href={`/token/${order.collection}/${order.tokenId}`} title={name}>
            {item}
          </Link>
        )}
      </td>

      <td className="tr-num">
        <span className="tr-price">
          <Soso size={13} unit="WSOSO">
            {formatSosoFixed(order.priceWei)}
          </Soso>
        </span>
        <span className="tr-l2">{whenExpires(order.endTime)}</span>
      </td>

      {own ? (
        <td className="tr-act">
          <button
            type="button"
            className="btn btn-sm act-withdraw"
            disabled={trade.busy}
            onClick={() => trade.cancelOrder(order)}
          >
            {trade.busy ? "Withdrawing…" : "Withdraw"}
          </button>
        </td>
      ) : null}
    </tr>
  );
}
