"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSeaportListings, useCollectionOffers } from "@/hooks/useSeaportOrders";
import { ladder, spread, type Level } from "@/lib/orderLadder";
import { Soso } from "@/components/Soso";
import { formatSoso, formatCount } from "@/lib/format";
import "@/styles/activity.css";
import "./OrderBook.css";

/**
 * Everything standing on this collection, both sides.
 *
 * ---
 *
 * **Not an exchange book, and it must not pretend to be.**
 *
 * The two sides are different kinds of thing here. An ask is a SPECIFIC TOKEN:
 * "3 at 9 SOSO" is three named pieces and buying one means choosing which, so
 * every ask rung names the ids behind it. A collection-wide bid is genuinely
 * fungible — it fills against any piece its maker does not already own — and
 * that is the whole reason it is worth something to every holder, so those are
 * marked "any piece". A mirrored ladder with matching rungs would imply you can
 * lift the ask side generically, and you cannot.
 *
 * The currencies differ too. Listings settle in native SOSO and bids in WSOSO,
 * because this marketplace refuses native-currency bids outright. That is why
 * the spread between them is described rather than quoted as a tradeable edge:
 * nothing matches these two automatically and no holder is obliged to take a
 * bid.
 *
 * **It costs nothing extra.** Both hooks read the same shared Seaport scan the
 * collection page already mounts for its card prices, so opening this tab is
 * arithmetic over orders that were already in memory.
 */

/** How many ids to name on a rung before giving up and counting them. */
const NAMED_IDS = 3;

function Side({
  title,
  note,
  levels,
  collection,
  unit,
  tone,
  emptyLine,
}: {
  title: string;
  note: string;
  levels: Level[];
  collection: `0x${string}`;
  unit?: string;
  tone: "ask" | "bid";
  emptyLine: string;
}) {
  /**
   * The depth bar is relative to this side's own deepest rung, not to both
   * sides together. Against a shared maximum, a collection with forty listings
   * and two bids draws the entire bid side as a pair of invisible slivers —
   * and the shape of each side is the thing somebody opened this to read.
   */
  const deepest = levels.at(-1)?.cumulative ?? 0;

  return (
    <div className={`ob-side ob-${tone}`}>
      <div className="ob-head">
        <p className="ob-title">{title}</p>
        <span className="ob-note">{note}</span>
      </div>

      {levels.length === 0 ? (
        <p className="act-note">{emptyLine}</p>
      ) : (
        <ol className="ob-list">
          {levels.map((level) => (
            <li key={level.priceWei.toString()} className="ob-row">
              {/*
                The bar is drawn behind the row rather than as a column, so the
                price and the count keep their own alignment. A depth column
                would make every rung's text start at a different place.
              */}
              <span
                className="ob-depth"
                aria-hidden="true"
                style={{ width: `${deepest === 0 ? 0 : (level.cumulative / deepest) * 100}%` }}
              />

              <span className="ob-price">
                <Soso size={14} {...(unit === undefined ? {} : { unit })}>
                  {formatSoso(level.priceWei)}
                </Soso>
              </span>

              <span className="ob-what">
                {level.anyToken ? (
                  /*
                    The one label on this panel that changes what a reader can
                    DO. A holder seeing "any piece" knows this bid is available
                    to them; the same rung drawn as a plain count would not
                    tell them that.
                  */
                  <span className="ob-any">any piece</span>
                ) : null}
                {level.tokenIds.slice(0, NAMED_IDS).map((id) => (
                  <Link
                    key={id.toString()}
                    className="ob-token"
                    href={`/token/${collection}/${id}`}
                  >
                    #{id.toString()}
                  </Link>
                ))}
                {level.tokenIds.length > NAMED_IDS ? (
                  <span className="ob-more">
                    +{formatCount(BigInt(level.tokenIds.length - NAMED_IDS))}
                  </span>
                ) : null}
              </span>

              {/* Cumulative, not this rung's count: "this many at this price or better". */}
              <span className="ob-cum">{formatCount(BigInt(level.cumulative))}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function OrderBook({ collection }: { collection: `0x${string}` | undefined }) {
  const { listings, isLoading: loadingAsks, logsUnavailable } = useSeaportListings(collection);
  const { offers, isLoading: loadingBids } = useCollectionOffers(collection);

  const asks = useMemo(() => ladder(listings, "ask"), [listings]);
  const bids = useMemo(() => ladder(offers, "bid"), [offers]);

  const gap = spread(asks[0]?.priceWei, bids[0]?.priceWei);
  const loading = loadingAsks || loadingBids;

  if (logsUnavailable) {
    /*
      Not "nothing is for sale" — we could not read what is. The same
      distinction every other panel here makes, for the same reason: one is a
      claim about the collection and only the other is known.
    */
    return (
      <div className="act-panel">
        <p className="act-note">
          The order book couldn&rsquo;t be read just now, so this is empty rather than settled.
          Try again in a moment.
        </p>
      </div>
    );
  }

  if (loading && asks.length === 0 && bids.length === 0) {
    return (
      <div className="act-panel">
        <div className="act-list">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton act-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="act-panel ob-panel">
      <div className="ob-sides">
        <Side
          title="Asks"
          note={`${formatCount(BigInt(listings.length))} listed`}
          levels={asks}
          collection={collection!}
          tone="ask"
          emptyLine="Nothing is listed here right now."
        />

        <Side
          title="Bids"
          note={`${formatCount(BigInt(offers.length))} standing`}
          levels={bids}
          collection={collection!}
          unit="WSOSO"
          tone="bid"
          emptyLine="Nobody has bid on this collection yet."
        />
      </div>

      {/*
        The spread, described rather than quoted.

        A crossed book — the best bid above the best ask — is possible here and
        is NOT an arbitrage: the sides settle in different currencies, nothing
        matches them automatically, and no holder is obliged to take a bid. So
        it says so in words instead of printing a negative number that looks
        like free money.
      */}
      {gap === undefined ? null : (
        <p className="ob-spread">
          {gap.negative ? (
            <>
              The best bid is <b>{formatSoso(gap.absWei)}</b> above the cheapest listing. Bids are
              in WSOSO and listings in SOSO, and nothing settles them against each other
              automatically &mdash; this isn&rsquo;t free money.
            </>
          ) : (
            <>
              <b>{formatSoso(gap.absWei)} SOSO</b> between the cheapest listing and the best bid
              &mdash; {gap.percent.toFixed(1)}% of the ask.
            </>
          )}
        </p>
      )}
    </div>
  );
}
