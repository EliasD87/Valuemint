"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AddressLink } from "@/components/AddressLink";
import { Pager, heldDepths } from "@/components/TicketList";
import { TIERS } from "@/config/tiers";
import type { Leaderboard } from "@/app/api/trenches/leaderboard/route";

/**
 * Live standings before the snapshot: who holds the most tickets right now
 * (owner, 2026-10-16: "an expandable table showing the leaderboard"). From
 * /api/trenches/leaderboard, which reads the chain once a minute for everyone.
 * After the snapshot the published list (TicketList) takes over.
 */

const PAGE = 25;
const fmt = (n: number) => n.toLocaleString("en-US");
const DEPTH = Object.fromEntries(TIERS.map((t) => [t.n, t]));

export function TicketLeaderboard({ you }: { you?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const { data, error } = useQuery({
    queryKey: ["trenches-leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/trenches/leaderboard");
      if (!res.ok) throw new Error("Could not load the standings.");
      return (await res.json()) as Leaderboard;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const ranked = data?.rows.map((r, i) => ({ ...r, rank: i + 1 })) ?? [];
  const q = query.trim().toLowerCase();
  const matches = q === "" ? ranked : ranked.filter((r) => r.wallet.includes(q));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const at = Math.min(page, pages - 1);
  const slice = matches.slice(at * PAGE, at * PAGE + PAGE);
  /* Your own row pinned on top when it is not on the page being shown. */
  const mine = q === "" && you !== undefined ? ranked.find((r) => r.wallet === you) : undefined;
  const rows = [...(mine !== undefined && !slice.includes(mine) ? [mine] : []), ...slice];

  return (
    <details className="perk-list" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span>
          Leaderboard
          <small>
            {data === undefined ? "Live standings" : `${fmt(data.wallets)} wallets · ${fmt(data.tickets)} tickets right now`}
          </small>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="perk-list-body">
        <div className="perk-list-bar">
          <label className="perk-lookup perk-list-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" />
            </svg>
            <input
              aria-label="Find a wallet"
              type="text"
              spellCheck={false}
              placeholder="Find a wallet"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>

        {error !== null && data === undefined ? <p className="perk-list-note">Could not read the standings right now.</p> : null}
        {data === undefined && error === null ? <p className="perk-list-note">Reading the chain…</p> : null}
        {data !== undefined && rows.length === 0 ? <p className="perk-list-note">No wallet matches that.</p> : null}

        {rows.length > 0 ? (
          <div className="perk-list-table perk-board" role="table" aria-label="Leaderboard">
            <div className="perk-list-row is-head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">Wallet</span>
              <span role="columnheader">Pieces</span>
              <span role="columnheader" className="perk-list-count">
                Tickets
              </span>
            </div>
            {rows.map((r, i) => {
              const isYou = you !== undefined && r.wallet === you;
              const pinned = i === 0 && isYou && rows.length > slice.length;
              return (
                <div
                  key={pinned ? "pinned" : r.wallet}
                  className={`perk-list-row${isYou ? " is-you" : ""}${pinned ? " is-pinned" : ""}${r.rank <= 3 ? " is-top" : ""}`}
                  role="row"
                >
                  <span role="cell" className="perk-board-rank">
                    {r.rank}
                  </span>
                  <span role="cell" className="perk-list-wallet">
                    <AddressLink address={r.wallet} chars={4} />
                    {isYou ? <span className="perk-list-you">You</span> : null}
                  </span>
                  <span role="cell" className="perk-list-pieces">
                    {heldDepths(r.depths).map(([d, n]) => (
                      <span key={d} className="perk-list-depth" title={`${DEPTH[d]?.name ?? `Depth ${d}`}${n > 1 ? ` ×${n}` : ""}`}>
                        <i style={{ background: DEPTH[d]?.colour }} aria-hidden="true" />
                        {d}
                        {n > 1 ? <span>×{n}</span> : null}
                      </span>
                    ))}
                  </span>
                  <span role="cell" className="perk-list-count">
                    {fmt(r.tickets)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        <Pager page={at} pages={pages} onPage={setPage} />
      </div>
    </details>
  );
}
