"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatEther } from "viem";
import { useOrdersBy } from "@/hooks/useSeaportOrders";
import { useSeaportTrade } from "@/hooks/useSeaportTrade";
import { boundsOf, rootKey, traitLabel, useCriteriaSets, type TraitSetSummary } from "@/hooks/useCriteria";
import { boundOfSalt } from "@/lib/criteria";
import { CYBEREATOR } from "@/lib/cybereator";
import { OPENED_ZONE } from "@/lib/seaport";
import { OfferForm, useCollectionOfferTarget } from "@/components/OfferForm";
import "@/components/OfferDialog.css";
import "@/components/CollectionOffers.css";
import { useAllCollections } from "@/hooks/useAllCollections";
import type { SeaportOrder } from "@/hooks/useSeaportOrders";
import { formatSosoFixed, shortAddress } from "@/lib/format";
import { whenExpires } from "@/components/Offers";
import { Soso } from "@/components/Soso";
import { remainingPieces } from "@/lib/seaport";
import { useT } from "@/lib/i18n";
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
  const t = useT();

  const committed = useMemo(
    /* A batch offer commits its price for every piece it still wants. */
    () => offers.reduce((total, o) => total + o.priceWei * remainingPieces(o), 0n),
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
        {t(
          isLoading
            ? own
              ? "Reading your offers from the chain…"
              : "Reading this wallet's offers from the chain…"
            : own
              ? "No standing offers. Anything you bid on shows here until it is taken, expires or you withdraw it."
              : "No standing offers from this wallet.",
        )}
      </p>
    );
  }

  const summary = (
    <>
      <Soso size={12} unit="WSOSO">
        {formatSosoFixed(committed)}
      </Soso>{" "}
      {t("committed")}
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
            <th scope="col">{t("Item")}</th>
            <th scope="col" className="tr-num">
              {t("Offer")}
            </th>
            {own ? (
              <th scope="col">
                <span className="tr-sr">{t("Action")}</span>
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
        <p className="act-title">{t("Your offers")}</p>
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
  const t = useT();

  /**
   * A collection-wide bid names no token: any piece. A trait bid names none
   * either, and is named by its set — or, where the site no longer recognises
   * the root, as a trait offer plainly, so its maker can still find and cancel
   * it. It is never called "Any piece".
   */
  const isTrait = order.criteria !== undefined && order.criteria !== 0n;
  const { byRoot, bound: currentBound, sets: currentSets } = useCriteriaSets(
    isTrait ? order.collection : undefined,
    boundsOf([order]),
  );
  const set = isTrait ? byRoot.get(rootKey(order.criteria!)) : undefined;

  /*
    A Cybereator trait offer is a fixed list: the pieces opened when it was
    placed (2026-11-13). Holders of pieces opened since see it nowhere and
    asked why, so its maker is told how far behind it is, and can update it:
    the same trait over everything opened now, or "Any opened" for Any.
  */
  const offerBound = isTrait ? boundOfSalt(order.params.salt) : undefined;
  const behind =
    order.collection.toLowerCase() === CYBEREATOR &&
    set !== undefined &&
    offerBound !== undefined &&
    currentBound !== undefined &&
    currentBound > offerBound
      ? currentBound - offerBound
      : 0n;
  const [updating, setUpdating] = useState(false);
  const piece =
    order.tokenId !== undefined
      ? `#${order.tokenId.toString()}`
      : isTrait
        ? set === undefined
          ? t("Trait offer")
          : traitLabel(set)
        : t(order.sealedOnly === true ? "Unopened" : order.openedOnly === true ? "Any opened" : "Any piece");

  /* Two lines, the same shape as a trade row: the piece over its collection,
     the amount over how long it has left. */
  const item = (
    <>
      <b>{piece}</b>
      <span className="tr-l2 tr-coll">{name}</span>
      {behind > 0n ? (
        <span className="tr-l2">
          {t("Covers the first {bound} opened · {behind} opened since can't accept it", {
            bound: offerBound!.toString(),
            behind: behind.toString(),
          })}
        </span>
      ) : null}
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
          <Link className="tr-stack" href={`/token/${order.collection}/${order.tokenId}`} prefetch={false} title={name}>
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
        <span className="tr-l2">
          {/* A batch offer is priced each: "×5" until something is sold into it, then how many are left.
              Kept short — this column is narrow, and a long line here squeezes the piece's name. */}
          {order.amount > 1n
            ? remainingPieces(order) === order.amount
              ? `×${order.amount.toString()} · `
              : t("{left} of {total} left · ", {
                  left: remainingPieces(order).toString(),
                  total: order.amount.toString(),
                })
            : ""}
          {whenExpires(order.endTime, t)}
        </span>
      </td>

      {own ? (
        <td className="tr-act">
          {behind > 0n ? (
            <button
              type="button"
              className="btn btn-sm btn-primary act-withdraw"
              disabled={trade.busy}
              onClick={() => setUpdating(true)}
            >
              {t("Update")}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm act-withdraw"
            disabled={trade.busy}
            onClick={() => trade.cancelOrder(order)}
          >
            {trade.busy ? t("Withdrawing…") : t("Withdraw")}
          </button>
          {updating && set !== undefined && currentBound !== undefined ? (
            <UpdateOffer
              order={order}
              set={set}
              currentSets={currentSets}
              currentBound={currentBound}
              onPlaced={() => {
                setUpdating(false);
                /* The new offer is on chain; now take the old one down. */
                trade.cancelOrder(order);
              }}
              onClose={() => setUpdating(false)}
            />
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

/**
 * Re-place a Cybereator trait offer over everything opened now.
 *
 * The new offer goes up first, through the ordinary offer form (same price
 * each, same pieces still wanted), so the bidder is never left without a bid
 * and the form's own wrap and allowance steps apply. Only once it is placed is
 * the old one withdrawn: a second wallet prompt. "Rarity: Any" becomes "Any
 * opened", which never falls behind again.
 */
function UpdateOffer({
  order,
  set,
  currentSets,
  currentBound,
  onPlaced,
  onClose,
}: {
  order: SeaportOrder;
  set: TraitSetSummary;
  currentSets: TraitSetSummary[];
  currentBound: bigint;
  onPlaced: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const isAny = set.traitType === "Rarity" && set.value === "Any";
  const guard: false | "opened" = isAny && OPENED_ZONE !== undefined ? "opened" : false;
  const fresh = guard === false ? currentSets.find((s) => s.traitType === set.traitType && s.value === set.value) : undefined;
  const trait =
    fresh === undefined
      ? undefined
      : { root: fresh.root, label: traitLabel(fresh), count: fresh.count, bound: currentBound };
  const target = useCollectionOfferTarget(order.collection, trait, guard);
  const usable = guard !== false || trait !== undefined;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <>
      <div className="od-scrim" onClick={onClose} aria-hidden="true" />
      <div className="od" role="dialog" aria-modal="true" aria-label={t("Update this offer")}>
        <div className="od-head">
          <div>
            <p className="od-kicker">{t("Update this offer")}</p>
            <h2>{guard === "opened" ? t("Any opened") : traitLabel(set)}</h2>
          </div>
          <button type="button" className="od-close" aria-label={t("Close")} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="od-body">
          <p className="co-pick-note">
            {guard === "opened"
              ? t("Places a new Any opened offer, which every opened piece can accept, including ones opened later. Then withdraws this one: two wallet prompts.")
              : t("Places the same offer over the {count} pieces opened now, then withdraws this one: two wallet prompts.", {
                  count: currentBound.toString(),
                })}
          </p>
          {usable ? (
            <OfferForm
              target={target}
              replacing
              onDone={() => undefined}
              onPlaced={onPlaced}
              initial={{ amount: formatEther(order.priceWei), count: remainingPieces(order).toString() }}
            />
          ) : (
            <p className="co-pick-note">{t("This trait is not offered right now. Withdraw the offer instead.")}</p>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
