"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useTopHolders } from "@/hooks/useTopHolders";
import { formatCount, shortAddress } from "@/lib/format";
import "@/styles/activity.css";
import "./TopHolders.css";

/**
 * Who holds the most of a collection.
 *
 * Shares the activity panel's chrome deliberately — the two are tabs of one
 * panel, and a reader switching between them should see the frame stay still
 * and only the contents change. Its own stylesheet is imported alongside
 * `activity.css` rather than relying on `Activity` having been rendered first:
 * a component that only draws correctly when a sibling happens to be mounted is
 * the trap that once rendered the offer stepper as a bare numbered list.
 */
export function TopHolders({
  collection,
  /** Total minted, for a share of the collection. Omitted where unknown. */
  supply,
  limit = 10,
  enabled = true,
  /** Extra room above, for the full-bleed placement rather than the sidebar. */
  standalone = false,
}: {
  collection: `0x${string}` | undefined;
  supply?: bigint;
  limit?: number;
  enabled?: boolean;
  standalone?: boolean;
}) {
  const { address: viewer } = useAccount();
  const { holders, isLoading, unavailable } = useTopHolders(collection, enabled);

  /**
   * Ten to begin with, the rest on request.
   *
   * Ten is the shape of the distribution, which is what the tab is for. The
   * hundred are for somebody looking for a particular address, and they are
   * already loaded — expanding costs nothing but height.
   */
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? holders : holders.slice(0, limit);
  const hidden = holders.length - shown.length;
  const mine = (a: string) => viewer !== undefined && a.toLowerCase() === viewer.toLowerCase();

  /** The largest holding, so the bars are relative to the leader rather than to supply. */
  const top = shown[0]?.count ?? 0;

  return (
    <div className={`act-panel${standalone ? " act-panel-standalone" : ""}`}>
      <div className="act-head">
        <p className="act-title">Top holders</p>
        {holders.length > shown.length ? (
          <span className="act-count">
            {shown.length} of {formatCount(BigInt(holders.length))}
          </span>
        ) : holders.length > 0 ? (
          <span className="act-count">
            {formatCount(BigInt(holders.length))} {holders.length === 1 ? "holder" : "holders"}
          </span>
        ) : null}
      </div>

      {isLoading && shown.length === 0 ? (
        <div className="act-list">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton act-skeleton" />
          ))}
        </div>
      ) : unavailable ? (
        /*
         * Not "nobody holds this" — we could not find out who does. The same
         * distinction the activity panel makes, and for the same reason: the
         * first is a claim about the collection and only the second is known.
         */
        <p className="act-note">
          The explorer would not answer just now, so this could not be read. It is not empty
          &mdash; try again in a moment.
        </p>
      ) : shown.length === 0 ? (
        <p className="act-note">Nothing has been minted here yet, so nobody holds any.</p>
      ) : (
        <ol className={`act-list th-list${expanded ? " is-expanded" : ""}`}>
          {shown.map((h, i) => (
            <li key={h.address} className={`act-row th-row${mine(h.address) ? " is-mine" : ""}`}>
              <span className="th-rank" aria-hidden="true">
                {i + 1}
              </span>

              {/* To the holder's own page on ValueMint — what they collect —
                  rather than the explorer, which lists transactions. */}
              <Link className="th-who" href={`/address/${h.address}`} title={h.address}>
                {mine(h.address) ? "You" : (h.name ?? shortAddress(h.address, 4))}
                {/*
                  A contract holding a lot of a collection is a different fact
                  from a person holding a lot — a bridge, a vault, or this
                  marketplace's own escrow would all top a leaderboard without
                  anybody having bought anything.
                */}
                {h.isContract ? <span className="th-tag">contract</span> : null}
              </Link>

              <span className="th-bar" aria-hidden="true">
                <span
                  className="th-bar-fill"
                  style={{ width: `${top === 0 ? 0 : Math.round((h.count / top) * 100)}%` }}
                />
              </span>

              <span className="th-count mono">
                {formatCount(BigInt(h.count))}
                {supply !== undefined && supply > 0n ? (
                  <small>{((h.count / Number(supply)) * 100).toFixed(1)}%</small>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/*
        Only where there is more, and it says how much more — "See more" alone
        makes somebody press it to find out whether it was worth pressing.
      */}
      {hidden > 0 || expanded ? (
        <button type="button" className="th-more" onClick={() => setExpanded((v) => !v)}>
          {expanded
            ? `Show top ${formatCount(BigInt(limit))}`
            : `See all ${formatCount(BigInt(holders.length))} holders`}
        </button>
      ) : null}
    </div>
  );
}
