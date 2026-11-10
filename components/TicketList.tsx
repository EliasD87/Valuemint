"use client";

import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { AddressLink } from "@/components/AddressLink";
import { TIERS } from "@/config/tiers";
import { numbersOf, ownerOfTicket, type DrawEntry } from "@/lib/draw";
import { useT } from "@/lib/i18n";

/**
 * Every wallet in a draw and the ticket numbers it holds, in address order —
 * the order the list is built in. It is the published list made readable, so
 * anyone can see nobody was slipped in and find any wallet, or the wallet
 * behind any ticket number (owner, 2026-10-16). Numbers are shuffled by the
 * contract's `numberSeed`; until it exists a wallet shows its run of places.
 */

const PAGE = 25;
/** Numbers shown per row before "+N". */
const ROW_NUMBERS = 3;
const fmt = (n: number) => n.toLocaleString("en-US");
const DEPTH = Object.fromEntries(TIERS.map((t) => [t.n, t]));

/** Previous / page n of m / Next, under a long table. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const tr = useT();
  if (pages <= 1) return null;
  return (
    <nav className="perk-pager" aria-label={tr("Pages")}>
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 0}>
        {tr("Previous")}
      </button>
      <span>{tr("Page {page} of {pages}", { page: page + 1, pages })}</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages - 1}>
        {tr("Next")}
      </button>
    </nav>
  );
}

/** "#884–#901", or "#2,052" for a single place. */
export function rangeText(e: Pick<DrawEntry, "from" | "to">): string {
  return e.from === e.to ? `#${fmt(e.from)}` : `#${fmt(e.from)}–#${fmt(e.to)}`;
}

/** Depths held, deepest first, one dot per depth with a count. */
export function heldDepths(depths: readonly number[]): [number, number][] {
  const count = new Map<number, number>();
  for (const d of depths) count.set(d, (count.get(d) ?? 0) + 1);
  return [...count].sort((a, b) => b[0] - a[0]);
}

export function TicketList({
  entries,
  tickets,
  numberSeed,
  you,
  lockedHref,
  query,
  onQuery,
  open,
  onOpen,
}: {
  entries: readonly DrawEntry[];
  tickets: number;
  /** Shuffles places into ticket numbers; undefined until the contract has numbered the list. */
  numberSeed?: Hex;
  /** The connected or looked-up wallet, lower-case: its row is marked. */
  you?: string;
  /** The contract holding the same list, once it matches line for line. */
  lockedHref?: string;
  /** The search box, controlled so the ticket's "+N more" can fill it. */
  query: string;
  onQuery: (q: string) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const tr = useT();
  const [page, setPage] = useState(0);

  const q = query.trim().toLowerCase().replace(/,/g, "");
  /* Shown most tickets first (owner, 2026-10-18: address order read as shuffled).
     `entries` itself stays in address order: that is the order on chain, and
     ticket lookups depend on it. */
  const byTickets = useMemo(
    () => [...entries].sort((a, b) => b.tickets - a.tickets || a.from - b.from),
    [entries],
  );
  const result = useMemo(() => {
    if (q === "") return { rows: byTickets, note: undefined as string | undefined };
    const n = q.replace(/^#/, "");
    if (/^\d+$/.test(n)) {
      const owner = ownerOfTicket(entries, Number(n), numberSeed);
      return owner === undefined
        ? { rows: [], note: tr("No ticket #{n}: they run from #1 to #{last}.", { n: fmt(Number(n)), last: fmt(tickets) }) }
        : { rows: [owner], note: tr("Ticket #{n} belongs to this wallet.", { n: fmt(Number(n)) }) };
    }
    const rows = byTickets.filter((e) => e.wallet.includes(q));
    return { rows, note: rows.length === 0 ? tr("No wallet in the list matches that.") : undefined };
  }, [entries, byTickets, q, tickets, numberSeed, tr]);

  /* Your own row is pinned on top while browsing: in a long list it can be
     page eighteen. It still sits in its real place further down. */
  const pages = Math.max(1, Math.ceil(result.rows.length / PAGE));
  const at = Math.min(page, pages - 1);
  const slice = result.rows.slice(at * PAGE, at * PAGE + PAGE);
  const mine = q === "" && you !== undefined ? entries.find((e) => e.wallet === you) : undefined;
  const rows = [...(mine !== undefined && !slice.includes(mine) ? [mine] : []), ...slice];
  /* One wallet found: show every number it holds. */
  const single = q !== "" && result.rows.length === 1 && numberSeed !== undefined ? result.rows[0] : undefined;

  return (
    <details className="perk-list" open={open} onToggle={(e) => onOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span>
          {tr("Every wallet’s tickets")}
          <small>{tr("{wallets} wallets · {tickets} tickets", { wallets: fmt(entries.length), tickets: fmt(tickets) })}</small>
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
              aria-label={tr("Find a wallet or a ticket number")}
              type="text"
              spellCheck={false}
              placeholder={tr("Wallet or ticket number")}
              value={query}
              onChange={(e) => {
                onQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <p className="perk-list-rule">
            {numberSeed !== undefined ? tr("Numbers shuffled on ValueChain.") : tr("Listed in address order.")}
            {lockedHref !== undefined ? (
              <>
                {" "}
                <a href={lockedHref} target="_blank" rel="noreferrer">
                  {tr("Same list on ValueChain")}
                </a>
              </>
            ) : null}
          </p>
        </div>

        {result.note !== undefined ? <p className="perk-list-note">{result.note}</p> : null}

        {rows.length > 0 ? (
          <div className="perk-list-table" role="table" aria-label={tr("Ticket list")}>
            <div className="perk-list-row is-head" role="row">
              <span role="columnheader">{tr("Wallet")}</span>
              <span role="columnheader">{tr("Pieces")}</span>
              <span role="columnheader" className="perk-list-count">
                {tr("Tickets")}
              </span>
              <span role="columnheader" className="perk-list-range">
                {tr("Numbers")}
              </span>
            </div>
            {rows.map((e, i) => {
              const isYou = you !== undefined && e.wallet === you;
              const pinned = i === 0 && isYou && rows.length > slice.length;
              const nums = numberSeed === undefined ? undefined : numbersOf(e, tickets, numberSeed);
              return (
                <div
                  key={pinned ? "pinned" : e.wallet}
                  className={`perk-list-row${isYou ? " is-you" : ""}${pinned ? " is-pinned" : ""}`}
                  role="row"
                >
                  <span role="cell" className="perk-list-wallet">
                    <AddressLink address={e.wallet} chars={4} />
                    {isYou ? <span className="perk-list-you">{tr("You")}</span> : null}
                  </span>
                  <span role="cell" className="perk-list-pieces">
                    {heldDepths(e.depths).map(([d, n]) => (
                      <span key={d} className="perk-list-depth" title={`${DEPTH[d]?.name ?? tr("Depth {n}", { n: d })}${n > 1 ? ` ×${n}` : ""}`}>
                        <i style={{ background: DEPTH[d]?.colour }} aria-hidden="true" />
                        {d}
                        {n > 1 ? <span>×{n}</span> : null}
                      </span>
                    ))}
                  </span>
                  <span role="cell" className="perk-list-count">
                    {fmt(e.tickets)}
                  </span>
                  <span role="cell" className="perk-list-range" title={nums?.map((n) => `#${n}`).join(" ")}>
                    {nums === undefined ? (
                      rangeText(e)
                    ) : (
                      <>
                        {nums
                          .slice(0, ROW_NUMBERS)
                          .map((n) => `#${fmt(n)}`)
                          .join(", ")}
                        {nums.length > ROW_NUMBERS ? <small> +{nums.length - ROW_NUMBERS}</small> : null}
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {single !== undefined ? (
          <div className="perk-list-all">
            <p>{tr("All {count} numbers of this wallet", { count: fmt(single.tickets) })}</p>
            <div className="tix-nums">
              {numbersOf(single, tickets, numberSeed!).map((n) => (
                <span key={n} className={q.replace(/^#/, "") === String(n) ? "is-hit" : undefined}>
                  #{fmt(n)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <Pager page={at} pages={pages} onPage={setPage} />
      </div>
    </details>
  );
}
