"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useListingFeed } from "@/hooks/useListingFeed";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { formatSoso } from "@/lib/format";
import "@/styles/home.css";

type Sort = "price-asc" | "price-desc" | "recent";

export default function Market() {
  const { address } = useAccount();
  const { tokens: listed, collections, isLoading, logsUnavailable } = useListingFeed();
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

  const floor = visible.length > 0 ? visible.reduce((m, t) => (t.listing!.price < m ? t.listing!.price : m), visible[0]!.listing!.price) : undefined;
  const total = visible.reduce((sum, t) => sum + t.listing!.price, 0n);

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
          <b>{floor === undefined ? "—" : formatSoso(floor)}</b> floor
        </span>
        <span className="strip-item">
          <b>{formatSoso(total)}</b> SOSO total
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
            </button>
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
