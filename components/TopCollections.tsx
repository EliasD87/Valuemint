"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Soso } from "@/components/Soso";
import { coverFor } from "@/config/covers";
import { stillUrl } from "@/lib/media";
import { formatSoso, shortAddress } from "@/lib/format";
import type { ExploreCollection, ExploreSummary } from "@/lib/exploreTypes";
import "./TopCollections.css";

/**
 * Where the trading is, with the numbers (2026-10-09).
 *
 * The four biggest collections by all-time volume, each with its floor, how
 * the floor moved in a day, and how many pieces are listed, all from the index
 * summary baked into the page. Nothing here reads the chain.
 *
 * Volume orders the rows but is not shown, and there is no window switch or
 * sales column: the owner cut those on 2026-10-24 to keep the front page
 * light on figures.
 */

const ROWS = 4;

function Change({ percent }: { percent: number | undefined }) {
  if (percent === undefined) return <span className="tc-dim">—</span>;
  const rounded = Math.round(percent * 10) / 10;
  if (rounded === 0) return <span className="tc-dim">0%</span>;
  return (
    <span className={rounded > 0 ? "tc-up" : "tc-down"}>
      {rounded > 0 ? "+" : "−"}
      {Math.abs(rounded).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function TopCollections({
  summary,
  names,
}: {
  summary: ExploreSummary | undefined;
  /** The page's own registry, for any collection the summary could not name. */
  names: ReadonlyMap<string, { name: string; symbol?: string }>;
}) {
  const rows = useMemo(() => {
    const list = [...(summary?.collections ?? [])];
    /* Biggest all-time volume first; listings break ties. */
    list.sort((a, b) => {
      const va = BigInt(a.volume.all);
      const vb = BigInt(b.volume.all);
      if (va !== vb) return vb > va ? 1 : -1;
      return b.listed - a.listed;
    });
    return list.slice(0, ROWS);
  }, [summary]);

  const nameOf = (c: ExploreCollection) => names.get(c.address)?.name ?? c.name ?? shortAddress(c.address);
  const symbolOf = (c: ExploreCollection) => c.symbol ?? names.get(c.address)?.symbol;

  return (
    <div className="tc card">
      <div className="tc-row tc-headrow" aria-hidden="true">
        <span className="tc-rank">#</span>
        <span>Collection</span>
        <span className="tc-num">Floor</span>
        <span className="tc-num tc-change">24h</span>
        <span className="tc-num">Listed</span>
      </div>

      {summary === undefined ? (
        /* Held at the rows' own height, so nothing moves when they land. */
        <ol className="tc-list" aria-busy="true">
          {Array.from({ length: ROWS }, (_, i) => (
            <li key={i} className="tc-row tc-wait">
              <span className="skeleton" />
            </li>
          ))}
        </ol>
      ) : rows.length === 0 ? (
        <p className="tc-empty">Nothing has traded yet.</p>
      ) : (
        <ol className="tc-list">
          {rows.map((c, i) => {
            const art = coverFor(c.address)?.[0];
            const name = nameOf(c);
            const symbol = symbolOf(c);
            return (
              <li key={c.address}>
                <Link href={`/collection/${c.address}`} className="tc-row tc-link" prefetch={false}>
                  <span className="tc-rank">{i + 1}</span>
                  <span className="tc-who">
                    {art === undefined ? (
                      <span className="tc-art tc-art-empty" aria-hidden="true">
                        {name.slice(0, 2)}
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="tc-art" src={stillUrl(art, 96)} alt="" loading="lazy" decoding="async" />
                    )}
                    <span className="tc-names">
                      <b>{name}</b>
                      {symbol === undefined ? null : <small>{symbol}</small>}
                    </span>
                  </span>
                  <span className="tc-num tc-floor">
                    {c.floorWei === undefined ? (
                      <span className="tc-dim">—</span>
                    ) : (
                      <Soso size={12}>{formatSoso(BigInt(c.floorWei), 2)}</Soso>
                    )}
                    {/* A phone has no room for its own column: the move sits under the floor. */}
                    <small className="tc-change-inline">
                      <Change percent={c.floorChange} />
                    </small>
                  </span>
                  <span className="tc-num tc-change">
                    <Change percent={c.floorChange} />
                  </span>
                  <span className="tc-num">
                    {c.listed === 0 ? <span className="tc-dim">—</span> : c.listed.toLocaleString("en-US")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
