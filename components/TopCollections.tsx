"use client";

import { WarmLink } from "@/components/WarmLink";
import { useMemo, type CSSProperties } from "react";
import { Soso } from "@/components/Soso";
import { avatarFor } from "@/config/covers";
import { stillUrl } from "@/lib/media";
import { formatSoso, shortAddress } from "@/lib/format";
import type { ExploreCollection, ExploreSummary } from "@/lib/exploreTypes";
import "./TopCollections.css";

/**
 * Where the trading is, with the numbers (2026-10-09).
 *
 * The biggest collections by all-time volume, each with its floor and how the
 * floor moved in a day, from the index summary baked into the page. Nothing
 * here reads the chain.
 *
 * Volume orders the rows but is not shown, and there is no window switch or
 * sales column: the owner cut those on 2026-10-24 to keep the front page
 * light on figures.
 *
 * Redrawn 2026-11-01 as a ranked list in two columns, one through four down
 * the left and five through eight down the right: four rows across the whole
 * width left the middle of the table empty. Each row carries one figure, the
 * floor, with its day's move under it; how many are listed rides with the
 * symbol. A phone shows one column of five.
 */

/** Rows per column. Two columns are used once there are more than this. */
const PER_COLUMN = 4;
const ROWS = PER_COLUMN * 2;

function Change({ percent }: { percent: number | undefined }) {
  if (percent === undefined) return null;
  const rounded = Math.round(percent * 10) / 10;
  if (rounded === 0) return <span className="tc-move">0%</span>;
  return (
    <span className={`tc-move ${rounded > 0 ? "is-up" : "is-down"}`}>
      {rounded > 0 ? "+" : "−"}
      {Math.abs(rounded).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
    </span>
  );
}

function Head() {
  return (
    <div className="tc-head" aria-hidden="true">
      <span className="tc-rank">#</span>
      <span className="tc-head-who">Collection</span>
      <span className="tc-head-num">Floor · 24h</span>
    </div>
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

  /* The contract's own name, read on the server, first: the registry's can be a
     hand-written one from `known.ts` until the browser reads the contract, and
     the row's name changed under the reader when it did. */
  const nameOf = (c: ExploreCollection) => c.name ?? names.get(c.address)?.name ?? shortAddress(c.address);
  const symbolOf = (c: ExploreCollection) => c.symbol ?? names.get(c.address)?.symbol;

  /* Waiting, the table holds the two-column shape it will most likely land in. */
  const two = summary === undefined || rows.length > PER_COLUMN;
  /* Fills down the first column before the second, so the ranks read in order. */
  const style = { ["--tc-rows" as string]: PER_COLUMN } as CSSProperties;

  return (
    <div className={`tc card${two ? " tc-two" : ""}`}>
      <div className="tc-heads">
        <Head />
        <Head />
      </div>

      {summary === undefined ? (
        /* Held at the rows' own height, so nothing moves when they land. */
        <ol className="tc-list" style={style} aria-busy="true">
          {Array.from({ length: ROWS }, (_, i) => (
            <li key={i} className="tc-wait">
              <span className="skeleton" />
            </li>
          ))}
        </ol>
      ) : rows.length === 0 ? (
        <p className="tc-empty">Nothing has traded yet.</p>
      ) : (
        <ol className="tc-list" style={style}>
          {rows.map((c, i) => {
            const art = avatarFor(c.address);
            const name = nameOf(c);
            const symbol = symbolOf(c);
            const listed = c.listed === 0 ? undefined : `${c.listed.toLocaleString("en-US")} listed`;
            const sub = [symbol, listed].filter((s) => s !== undefined).join(" · ");
            return (
              <li key={c.address}>
                <WarmLink href={`/collection/${c.address}`} className="tc-row">
                  <span className="tc-rank">{i + 1}</span>
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
                    {sub === "" ? null : <small>{sub}</small>}
                  </span>
                  <span className="tc-floor">
                    {c.floorWei === undefined ? (
                      <span className="tc-dim">No floor</span>
                    ) : (
                      <Soso size={12}>{formatSoso(BigInt(c.floorWei), 2)}</Soso>
                    )}
                    <Change percent={c.floorChange} />
                  </span>
                </WarmLink>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
