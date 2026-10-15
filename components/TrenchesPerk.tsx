"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAddress, isAddress, type Hex } from "viem";
import { useAccount, useBlockNumber, usePublicClient } from "wagmi";
import { AddressLink } from "@/components/AddressLink";
import { CYBEREATOR_SEATS as DRAW, MEASURED_BLOCK_MS, ticketsFor } from "@/config/draws";
import { TIERS } from "@/config/tiers";
import { TRENCHES_ADDRESS } from "@/config/trenches";
import { deployment } from "@/config/contracts";
import { useTrenchesHoldings } from "@/hooks/useTrenchesHoldings";
import { drawWinners, type DrawList } from "@/lib/draw";
import "./TrenchesPerk.css";

/**
 * A holder perk on /trenches: Cybereator NFTs drawn among holders of depth 5+
 * (2026-10-15). The rules and the schedule live in config/draws.ts; the draw
 * itself in lib/draw.ts. This only shows them: before the snapshot, how many
 * tickets a wallet holds right now; after it, the frozen list; after the draw
 * block, the winners, worked out here from the block's hash so anyone viewing
 * the page is checking the result, not trusting it.
 *
 * The card says three things at a glance (the prize, the tickets per depth, your
 * tickets) and a timeline; every rule lives in "How it works", as bullets
 * (owner, 2026-10-15).
 */

type Phase = "before" | "counting" | "listed" | "drawn";

const fmt = (n: number) => n.toLocaleString("en-US");
const DEPTH = Object.fromEntries(TIERS.map((t) => [t.n, t]));

/** "2d 23h", "4h 12m", "9m". */
function untilText(blocks: bigint): string {
  const ms = Number(blocks) * MEASURED_BLOCK_MS;
  const m = Math.max(1, Math.round(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function whenText(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day}, ${time} UTC`;
}

export function TrenchesPerk() {
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: head } = useBlockNumber({ query: { refetchInterval: 15_000 } });
  const phase: Phase =
    head === undefined || head < DRAW.snapshotBlock
      ? "before"
      : !DRAW.listPublished
        ? "counting"
        : !DRAW.drawAnnounced || head < DRAW.drawBlock
          ? "listed"
          : "drawn";

  const { data: list } = useQuery({
    queryKey: ["draw-list", DRAW.listUrl],
    enabled: DRAW.listPublished,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(DRAW.listUrl);
      if (!res.ok) throw new Error("Could not load the ticket list.");
      return (await res.json()) as DrawList;
    },
  });

  /* The draw block's hash, once it exists, picks the winners right here. */
  const client = usePublicClient();
  const { data: seed } = useQuery({
    queryKey: ["draw-seed", DRAW.drawBlock.toString()],
    enabled: phase === "drawn" && client !== undefined,
    staleTime: Infinity,
    queryFn: async () => (await client!.getBlock({ blockNumber: DRAW.drawBlock })).hash as Hex,
  });
  const winners = useMemo(
    () => (list !== undefined && seed !== undefined ? drawWinners(list.entries, seed, DRAW.winners) : undefined),
    [list, seed],
  );

  /* Whose tickets to show: the connected wallet, or one typed in. */
  const [typed, setTyped] = useState("");
  /* Any letter case: people paste addresses from everywhere. */
  const typedOk = isAddress(typed.trim(), { strict: false });
  const lookup = typedOk ? getAddress(typed.trim()) : mounted ? address : undefined;
  const isOther = typedOk && lookup?.toLowerCase() !== address?.toLowerCase();
  const excluded = lookup !== undefined && DRAW.excluded.includes(lookup.toLowerCase());
  const holdings = useTrenchesHoldings(phase === "before" ? lookup : undefined);
  const listed = lookup === undefined ? undefined : list?.entries.find((e) => e.wallet.toLowerCase() === lookup.toLowerCase());
  const won = lookup === undefined ? undefined : winners?.find((w) => w.wallet.toLowerCase() === lookup.toLowerCase());

  const depths = phase === "before" ? holdings.depths.filter((d) => d >= DRAW.minDepth) : (listed?.depths ?? []);
  const tickets = phase === "before" ? ticketsFor(holdings.depths, DRAW.minDepth) : (listed?.tickets ?? 0);
  /* One chip per depth with a count, deepest first: a wallet holding twenty
     pieces would otherwise get a wall of twenty chips. */
  const heldCount = new Map<number, number>();
  for (const d of depths) heldCount.set(d, (heldCount.get(d) ?? 0) + 1);
  const held = [...heldCount].sort((a, b) => b[0] - a[0]);

  const steps = [
    {
      key: "snapshot",
      name: "Snapshot",
      when: whenText(DRAW.snapshotAt),
      block: DRAW.snapshotBlock,
      state: phase === "before" ? "now" : "done",
      note:
        phase === "before"
          ? head === undefined
            ? "Reading the chain…"
            : `in ${untilText(DRAW.snapshotBlock - head)}`
          : "Taken",
    },
    {
      key: "list",
      name: "Ticket list",
      when: "After the snapshot",
      block: undefined,
      state: phase === "counting" ? "now" : phase === "before" ? "next" : "done",
      note: list !== undefined ? `${fmt(list.wallets)} wallets · ${fmt(list.tickets)} tickets` : phase === "counting" ? "Counting…" : "",
    },
    {
      key: "draw",
      name: "Draw",
      when: DRAW.drawAnnounced ? whenText(DRAW.drawAt) : "Coming soon",
      block: DRAW.drawAnnounced ? DRAW.drawBlock : undefined,
      state: phase === "listed" ? "now" : phase === "drawn" ? "done" : "next",
      note:
        phase === "drawn"
          ? "Drawn"
          : DRAW.drawAnnounced && head !== undefined && phase !== "before"
            ? `in ${untilText(DRAW.drawBlock - head)}`
            : "",
    },
  ] as const;

  let you: React.ReactNode;
  if (lookup === undefined) {
    you = <p className="perk-you-note">Connect a wallet, or paste one below.</p>;
  } else if (excluded) {
    you = <p className="perk-you-note">This is a ValueMint test or deployer wallet, so it is left out.</p>;
  } else if (phase === "before" && holdings.loading) {
    you = <p className="perk-you-note">Reading its Trenches pieces…</p>;
  } else if (phase === "counting") {
    you = <p className="perk-you-note">Snapshot taken. Tickets appear here once the list is published.</p>;
  } else {
    you = (
      <>
        <p className="perk-you-num">
          {fmt(tickets)}
          <span>{tickets === 1 ? "ticket" : "tickets"}</span>
        </p>
        {held.length > 0 ? (
          <div className="perk-chips">
            {held.map(([d, n]) => (
              <span key={d} className="perk-chip">
                <i style={{ background: DEPTH[d]?.colour }} aria-hidden="true" />
                {DEPTH[d]?.name ?? `Depth ${d}`}
                <b>{d}</b>
                {n > 1 ? <span className="perk-chip-count">×{n}</span> : null}
              </span>
            ))}
          </div>
        ) : null}
        {listed !== undefined ? (
          <p className="perk-you-note">
            Ticket numbers <b>#{fmt(listed.from)}</b> to <b>#{fmt(listed.to)}</b>
          </p>
        ) : tickets === 0 ? (
          <p className="perk-you-note">
            {phase === "before" ? (
              <>
                No depth {DRAW.minDepth}+ piece yet.{" "}
                <Link href={`/collection/${TRENCHES_ADDRESS}`}>Find one on the market</Link>.
              </>
            ) : (
              `No depth ${DRAW.minDepth}+ piece at the snapshot.`
            )}
          </p>
        ) : phase === "before" ? (
          <p className="perk-you-note">Counted from what this wallet holds at the snapshot.</p>
        ) : null}
        {won !== undefined ? <p className="perk-you-won">Won a Cybereator</p> : null}
      </>
    );
  }

  return (
    <section className="page section perk" id="perks" aria-labelledby="perk-title">
      <div className="perk-card">
        <div className="perk-top">
          {/* The prize, as a picture: the Cybereator cat at its bar. */}
          <div className="perk-prize" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="perk-prize-bg" src="/heroes/cybereator-bg.webp" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="perk-prize-cat" src="/heroes/cybereator-cat.webp" alt="" />
          </div>

          {/* One title line, one sentence, one line of dates (owner, 2026-10-15: "crowded").
              How many are given is not said (owner, 2026-10-15). */}
          <div className="perk-intro">
            <h2 className="perk-title" id="perk-title">
              Win a Cybereator NFT
            </h2>
            <p className="perk-lede">
              For holders of depth {DRAW.minDepth}+. Each piece you hold is worth its depth in tickets.
            </p>
            <ol className="perk-timeline">
              {steps.map((s) => (
                <li
                  key={s.key}
                  className={`perk-step is-${s.state}`}
                  title={s.block !== undefined ? `Block ${fmt(Number(s.block))}` : undefined}
                >
                  <span className="perk-step-dot" aria-hidden="true" />
                  <span className="perk-step-name">{s.name}</span>
                  <span className="perk-step-when">{s.when}</span>
                  {s.note !== "" ? <span className="perk-step-note">{s.note}</span> : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="perk-you" aria-live="polite">
            <p className="perk-you-label">
              {isOther ? "That wallet" : phase === "before" ? "Your tickets now" : "Your tickets"}
            </p>
            {you}
            <label className="perk-lookup">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
              <input
                aria-label="Check another wallet"
                type="text"
                spellCheck={false}
                placeholder="Check any wallet 0x…"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </label>
          </div>
        </div>

        {winners !== undefined ? (
          <div className="perk-winners">
            <p className="perk-you-label">Winners</p>
            <ol>
              {winners.map((w) => {
                const tx = DRAW.sent[w.wallet.toLowerCase()];
                return (
                  <li key={w.wallet}>
                    <span className="perk-w-place">{w.place}</span>
                    <AddressLink address={w.wallet} chars={5} />
                    <span className="perk-w-ticket">ticket #{fmt(w.ticket)}</span>
                    <span className="perk-w-held">{fmt(w.tickets)} tickets</span>
                    {tx !== undefined ? (
                      <a className="perk-w-sent" href={`${deployment.explorer}/tx/${tx}`} target="_blank" rel="noreferrer">
                        Sent
                      </a>
                    ) : (
                      <span className="perk-w-pending">Sending soon</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        <details className="perk-how">
          <summary>
            How it works
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          {/* Plain words only (owner, 2026-10-15: no hashes, no formulas). The
              mechanics are in lib/draw.ts for anyone who wants them. */}
          <ul>
            <li>
              Hold a Trenches piece of <b>depth {DRAW.minDepth} or deeper</b>, claimed or bought.
            </li>
            <li>
              Each piece is worth <b>its depth in tickets</b>: Inferno 5 up to Monolith 10.
            </li>
            <li>
              What counts is what your wallet holds <b>at the snapshot</b>.
            </li>
            <li>After the snapshot, the full ticket list is published here.</li>
            <li>The draw is random and public: nobody, ValueMint included, can pick the winners.</li>
            <li>
              <b>One NFT per wallet.</b>
            </li>
            <li>ValueMint&rsquo;s own wallets are left out.</li>
          </ul>
        </details>
      </div>
    </section>
  );
}
