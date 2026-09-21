"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useListingFeed } from "@/hooks/useListingFeed";
import { MARKET_CHIPPED, MARKET_TIERED, PINNED_COLLECTIONS } from "@/config/featured";
import { tierClass } from "@/lib/tokenMetadata";
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

  /**
   * The filter row: named buttons, not one per collection.
   *
   * See `MARKET_TIERED` / `MARKET_CHIPPED` in config/featured.ts for what goes
   * on it and why. The short version: one chip per collection stops working
   * when a single collection is most of the book, because they are all the
   * same chip.
   *
   * Each chip owns its own predicate, so the grid filter, the count and the
   * floor all come from one definition and cannot drift apart. The floor is
   * the cheapest of *this chip's* rows rather than a lookup — which is both
   * simpler and the only figure that is true of what the chip shows.
   */
  const chips = useMemo(() => {
    const boxAt = MARKET_TIERED.address.toLowerCase();
    const named = new Set<string>([boxAt, ...MARKET_CHIPPED.map((a) => a.toLowerCase())]);
    const nameOf = (address: string) =>
      collections.find((c) => c.address.toLowerCase() === address.toLowerCase())?.name ??
      "Collection";

    const defs: Array<{
      key: string;
      label: string;
      tone?: string;
      match: (t: (typeof listed)[number]) => boolean;
    }> =
      [
        ...MARKET_CHIPPED.map((address) => ({
          key: `c:${address.toLowerCase()}`,
          label: nameOf(address),
          match: (t: (typeof listed)[number]) =>
            t.collection.toLowerCase() === address.toLowerCase(),
        })),
        ...MARKET_TIERED.tiers.map((tier) => ({
          key: `t:${tier}`,
          /* "Common box", the way somebody would say it out loud. */
          label: `${tier === "SuperRare" ? "Super Rare" : tier} box`,
          /*
            The tier's own colour, from the same palette the cards and ribbons
            wear. Only the tiers are coloured: it is what makes the ladder
            legible at a glance, and it only works while the buttons that are
            not rungs on it stay neutral.
          */
          tone: tierClass(tier),
          match: (t: (typeof listed)[number]) =>
            t.collection.toLowerCase() === boxAt && tierClass(t.tier) === tierClass(tier),
        })),
        {
          key: "others",
          label: "Others",
          /* Everything the named buttons do not reach. Without it the rest of
             the market is unreachable in one click once the boxes are the bulk
             of the book, which is the whole reason this row was rebuilt. */
          match: (t: (typeof listed)[number]) => !named.has(t.collection.toLowerCase()),
        },
      ];

    return defs
      .map((d) => {
        const rows = listed.filter(d.match);
        const floor = rows.reduce<bigint | undefined>(
          (least, r) => (least === undefined || r.listing!.price < least ? r.listing!.price : least),
          undefined,
        );
        return { ...d, count: rows.length, floor };
      })
      /* A button with nothing behind it takes itself off the row rather than
         sitting there dead. */
      .filter((d) => d.count > 0);
  }, [listed, collections]);

  const active = chips.find((c) => c.key === filterTo);

  /**
   * The per-tier breakdown, which only says something for a whole collection.
   *
   * Pointless under a tier button — it would break one tier into one row — and
   * meaningless under "Others", which is several collections at once.
   */
  const chosen =
    filterTo.startsWith("c:") ? (filterTo.slice(2) as `0x${string}`) : undefined;
  const tierFloors = chosen === undefined ? [] : tierFloorsFor(chosen);

  const visible = useMemo(() => {
    const rows = active === undefined ? listed : listed.filter(active.match);

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
  }, [listed, sort, active, tradesPerCollection]);

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

      {chips.length > 1 ? (
        <div className="filters">
          <button className="filt" aria-pressed={filterTo === "all"} onClick={() => setFilterTo("all")}>
            All <em>{listed.length}</em>
          </button>
          {chips.map((chip) => (
            <button
              key={chip.key}
              className={`filt${chip.tone === undefined ? "" : ` filt-${chip.tone}`}`}
              aria-pressed={filterTo === chip.key}
              onClick={() => setFilterTo(chip.key)}
            >
              {chip.label} <em>{chip.count}</em>
              {/*
                The cheapest thing behind this button.

                It carries the SOSO mark, and it is fenced off by a rule in the
                stylesheet, because it did neither and was misread — "8" then
                "from 50" at the same weight, a hand's width apart, was reported
                as "8 out of 50", which is what a supply looks like. Two bare
                figures side by side in one pill will always read as a fraction;
                only the currency says otherwise.
              */}
              {chip.floor !== undefined ? (
                <span className="filt-floor">
                  {/* No "from". The mark already says this is money and the
                      rule already says it is a different figure to the count;
                      the word was a third device doing the same job, and six
                      of them across a row is most of its width. */}
                  <Soso size={13} unit="">
                    {formatSoso(chip.floor)}
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


