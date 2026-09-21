"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useListingFeed } from "@/hooks/useListingFeed";
import { PINNED_COLLECTIONS } from "@/config/featured";
import { useActivity } from "@/hooks/useActivity";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { formatSoso } from "@/lib/format";
import "@/styles/home.css";
import { Soso } from "@/components/Soso";
import { useFloors } from "@/hooks/useFloors";
import { Sortie } from "@/components/Sortie";

type Sort = "traded" | "price-asc" | "price-desc" | "recent";

/**
 * Where each pinned collection sits, by lower-cased address.
 *
 * Built once at module scope: it is two entries derived from a constant, and
 * rebuilding it inside the sort would hash an address per comparison.
 */
const PIN_RANK = new Map(PINNED_COLLECTIONS.map((a, i) => [a.toLowerCase(), i]));

/**
 * A finite rank for everything, so the comparator never does `Infinity -
 * Infinity` and hands `sort` a NaN — which is not a "leave these alone", it is
 * an undefined ordering.
 */
const pinRank = (address: string) => PIN_RANK.get(address.toLowerCase()) ?? PIN_RANK.size;

/** How many collection chips the filter row will carry. */
const CHIP_LIMIT = 4;

export default function Market() {
  const { address } = useAccount();
  const { tokens: listed, collections, isLoading, logsUnavailable } = useListingFeed();
  const { floorFor, tierFloorsFor } = useFloors();

  /**
   * Which listed collections anything actually vouches for.
   *
   * Built once here rather than looked up per card. A collection the feed knows
   * about only because Blockscout indexed it is vouched for by nothing.
   */
  const vouchedFor = useMemo(
    () => new Map(collections.map((c) => [c.address.toLowerCase(), c.vouched])),
    [collections],
  );
  /**
   * How many sales each collection has ever had.
   *
   * From the shared activity scan, which every page already runs and caches, so
   * this is a count over rows that are in memory rather than a request. It is
   * also deferred by 900 ms, which is deliberate: the grid draws in whatever
   * order it can immediately and settles into this one when the history lands,
   * rather than holding the page for it.
   */
  const { sales } = useActivity(undefined, undefined, { salesOnly: true });

  const tradesPerCollection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sale of sales) {
      const key = sale.collection.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [sales]);

  const [sort, setSort] = useState<Sort>("traded");
  const [filterTo, setFilterTo] = useState<string>("all");

  const visible = useMemo(() => {
    const rows = listed.filter(
      (t) => filterTo === "all" || t.collection.toLowerCase() === filterTo.toLowerCase(),
    );

    const cheapestFirst = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
      const diff = a.listing!.price - b.listing!.price;
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    };

    return [...rows].sort((a, b) => {
      /**
       * The pinned collections first, then the busiest, then the cheapest
       * piece within each.
       *
       * ## Why anything jumps the queue at all
       *
       * Ranking by trades alone buries a collection on the day it ships, which
       * is the one day it most needs to be seen: the real SoDEX Treasure Box
       * went live with two listings and no sale history, and sat below every
       * collection that had been trading for weeks. No arithmetic fixes that —
       * a new collection has no history by definition — so it is a decision,
       * and it is written down in `PINNED_COLLECTIONS` alongside the same
       * decision for /collections rather than spelled out again here.
       *
       * Only in this sort. Picking "Price low" or "Newest" is somebody asking
       * a question, and quietly holding two collections above the answer would
       * make those controls lie. This one is the house's own order, which is
       * why it is labelled "Featured" and not "Most traded" — it was called
       * that, and with pinning in it the name would have been describing
       * something the list no longer is.
       *
       * ## Why the rest is still sales
       *
       * Counting SALES rather than listings on purpose — anyone can list
       * anything at any price, so listings measure intent and are free to
       * manufacture. A sale had a buyer.
       */
      if (sort === "traded") {
        const pa = pinRank(a.collection);
        const pb = pinRank(b.collection);
        if (pa !== pb) return pa - pb;

        const ta = tradesPerCollection.get(a.collection.toLowerCase()) ?? 0;
        const tb = tradesPerCollection.get(b.collection.toLowerCase()) ?? 0;
        if (ta !== tb) return tb - ta;
        return cheapestFirst(a, b);
      }

      if (sort === "recent") return Number(b.id - a.id);
      const n = cheapestFirst(a, b);
      return sort === "price-asc" ? n : -n;
    });
  }, [listed, sort, filterTo, tradesPerCollection]);

  /**
   * There is no market-wide floor here, deliberately.
   *
   * A floor is the cheapest way to own a particular thing, so it does not
   * exist until you say which thing. This strip used to carry the minimum
   * across every listing on the chain: it read 2 SOSO on a page where The
   * Trenches started at 500, and calling that "the floor" described nothing
   * on screen. Relabelling it "lowest ask" made it honest and still left a
   * number nobody has a use for, so it is gone.
   *
   * The floors live where they mean something instead - per collection on
   * the filter chips, and per tier below them once a collection is chosen,
   * because a collection with an Epic and a Common edition has two floors
   * and quoting the lower one misleads anyone shopping for the other.
   */
  const total = visible.reduce((sum, t) => sum + t.listing!.price, 0n);
  const chosen = filterTo === "all" ? undefined : filterTo;
  const tierFloors = chosen === undefined ? [] : tierFloorsFor(chosen);

  /** Only offer a collection filter for collections that actually have listings. */
  const withListings = collections.filter((c) =>
    listed.some((t) => t.collection.toLowerCase() === c.address.toLowerCase()),
  );

  /**
   * The filter chips: the pinned collections, then the busiest, four at most.
   *
   * Four because the row is a row. Every collection with a listing used to get
   * a chip, which on a phone is a horizontally scrolling strip of them — and
   * the one anybody came for could be the fourth one off the right-hand edge.
   *
   * Nothing is hidden by this. A chip is a shortcut, not a gate: "All" still
   * carries every listing, a collection dropped from the row still has all of
   * its pieces in the grid, and its own page is a click from any of them. What
   * is lost is the shortcut, for the quietest collections on the page.
   *
   * Whatever is currently selected stays in the row whatever its rank, or
   * choosing it would remove the control that undoes it.
   */
  const chips = (() => {
    const counted = withListings.map((c) => ({
      collection: c,
      listings: listed.filter((t) => t.collection.toLowerCase() === c.address.toLowerCase())
        .length,
    }));

    const ranked = counted.sort((a, b) => {
      const pa = pinRank(a.collection.address);
      const pb = pinRank(b.collection.address);
      if (pa !== pb) return pa - pb;
      return b.listings - a.listings;
    });

    const shown = ranked.slice(0, CHIP_LIMIT);
    const isChosen = (r: (typeof ranked)[number]) => r.collection.address === chosen;
    if (chosen !== undefined && !shown.some(isChosen)) {
      const selected = ranked.find(isChosen);
      if (selected !== undefined) shown.push(selected);
    }
    return shown;
  })();

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Market</p>
          <h2>Everything for sale on ValueChain</h2>
        </div>
        <div className="wrap-row">
          <Sortie active={sort === "traded"} onClick={() => setSort("traded")}>
            Featured
          </Sortie>
          <Sortie active={sort === "price-asc"} onClick={() => setSort("price-asc")}>
            Price low
          </Sortie>
          <Sortie active={sort === "price-desc"} onClick={() => setSort("price-desc")}>
            Price high
          </Sortie>
          <Sortie active={sort === "recent"} onClick={() => setSort("recent")}>
            Newest
          </Sortie>
        </div>
      </div>

      <div className="stats-row">
        <span className="strip-item">
          <b>{visible.length}</b> listed
        </span>
        <span className="strip-item">
          <Soso size={16}>
            <b>{formatSoso(total)}</b>
          </Soso>{" "}
          total
        </span>
        <span className="strip-item">
          <b>{collections.length}</b> collections
        </span>
      </div>

      {withListings.length > 1 ? (
        <div className="filters">
          <button className="filt" aria-pressed={filterTo === "all"} onClick={() => setFilterTo("all")}>
            All <em>{listed.length}</em>
          </button>
          {chips.map(({ collection: c, listings }) => (
            <button
              key={c.address}
              className="filt"
              aria-pressed={filterTo === c.address}
              onClick={() => setFilterTo(c.address)}
            >
              {c.name} <em>{listings}</em>
              {/*
                The floor that actually means something: this collection's own.

                It carries the SOSO mark, and it is fenced off by a rule in the
                stylesheet, because it did neither and was misread — "8" then
                "from 50" at the same weight, a hand's width apart, was reported
                as "8 out of 50", which is what a supply looks like. Two bare
                figures side by side in one pill will always read as a fraction;
                only the currency says otherwise.
              */}
              {floorFor(c.address) !== undefined ? (
                <span className="filt-floor">
                  from{" "}
                  <Soso size={13} unit="">
                    {formatSoso(floorFor(c.address)!)}
                  </Soso>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* Within one collection a tier is its own market, so each gets its own
          floor. Shown only when there is more than one - a single row would
          just repeat the collection floor. */}
      {tierFloors.length > 0 ? (
        <div className="tier-floors">
          {tierFloors.map((t) => (
            <span key={t.tier} className="tier-floor">
              <b className={`chip chip-${t.tier.toLowerCase()}`}>{t.tier}</b>
              <span className="tier-floor-price">
                from {formatSoso(t.price)} SOSO
              </span>
              <span className="tier-floor-count">{t.count} listed</span>
            </span>
          ))}
        </div>
      ) : null}
      
      {logsUnavailable ? (
        <p className="portfolio-note">
          The node would not serve event logs just now, so listings may be incomplete. Open a
          collection directly to see what is on offer in it.
        </p>
      ) : null}

      {isLoading && listed.length === 0 ? (
        <div className="grid-tokens">
          {Array.from({ length: 8 }, (_, i) => (
            <TokenCardSkeleton key={i} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="market-empty">
          <h3>Nothing is listed right now.</h3>
          <p className="muted">
            Nothing across {collections.length} collection{collections.length === 1 ? "" : "s"} is
            on offer. Listings are non-custodial, so a piece only appears here once its owner puts
            it up.
          </p>
          <div className="wrap-row mt-md">
            <Link className="btn btn-primary" href="/portfolio">
              List something you own
            </Link>
            <Link className="btn" href="/mint">
              Mint something first
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid-tokens">
          {visible.map((t) => (
            <TokenCard
              key={`${t.collection}-${t.id}`}
              token={t}
              collection={t.collection}
              collectionName={t.collectionName}
              listing={t.listing}
              owner={t.owner}
              viewerAddress={address}
              vouched={vouchedFor.get(t.collection.toLowerCase())}
            />
          ))}
        </div>
      )}

    </section>
  );
}


