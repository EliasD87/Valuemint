"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useListingFeed } from "@/hooks/useListingFeed";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { formatSoso } from "@/lib/format";
import "@/styles/home.css";
import { Soso } from "@/components/Soso";
import { useFloors } from "@/hooks/useFloors";

type Sort = "price-asc" | "price-desc" | "recent";

export default function Market() {
  const { address } = useAccount();
  const { tokens: listed, collections, isLoading, logsUnavailable } = useListingFeed();
  const { floorFor, tierFloorsFor } = useFloors();
  const [sort, setSort] = useState<Sort>("price-asc");
  const [filterTo, setFilterTo] = useState<string>("all");

  const visible = useMemo(() => {
    const rows = listed.filter(
      (t) => filterTo === "all" || t.collection.toLowerCase() === filterTo.toLowerCase(),
    );

    return [...rows].sort((a, b) => {
      if (sort === "recent") return Number(b.id - a.id);
      const diff = a.listing!.price - b.listing!.price;
      const n = diff > 0n ? 1 : diff < 0n ? -1 : 0;
      return sort === "price-asc" ? n : -n;
    });
  }, [listed, sort, filterTo]);

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

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Market</p>
          <h2>Everything for sale on ValueChain</h2>
        </div>
        <div className="wrap-row">
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
          {withListings.map((c) => (
            <button
              key={c.address}
              className="filt"
              aria-pressed={filterTo === c.address}
              onClick={() => setFilterTo(c.address)}
            >
              {c.name}{" "}
              <em>{listed.filter((t) => t.collection.toLowerCase() === c.address.toLowerCase()).length}</em>
              {/* The floor that actually means something: this collection's own. */}
              {floorFor(c.address) !== undefined ? (
                <span className="filt-floor">from {formatSoso(floorFor(c.address)!)}</span>
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
              listing={t.listing}
              owner={t.owner}
              viewerAddress={address}
            />
          ))}
        </div>
      )}

    </section>
  );
}

function Sortie({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="filt" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
