"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAddress, isAddress, keccak256, toHex, zeroHash, type Hex } from "viem";
import { useAccount, useBlockNumber, usePublicClient } from "wagmi";
import { AddressLink } from "@/components/AddressLink";
import { shortAddress } from "@/lib/format";
import { CYBEREATOR_SEATS as DRAW, MEASURED_BLOCK_MS, ticketsFor } from "@/config/draws";
import { Art } from "@/components/Art";
import { TIERS, tierImage } from "@/config/tiers";
import { TRENCHES_ADDRESS } from "@/config/trenches";
import { deployment } from "@/config/contracts";
import { useTicketDraw } from "@/hooks/useTicketDraw";
import { useTrenchesHoldings } from "@/hooks/useTrenchesHoldings";
import { drawWinners, numbersOf, numberTickets, type DrawList, type DrawWinner } from "@/lib/draw";
import { TicketLeaderboard } from "@/components/TicketLeaderboard";
import { TicketShare } from "@/components/TicketShare";
import { TicketList, rangeText } from "@/components/TicketList";
import "./TrenchesPerk.css";

/**
 * A holder perk on /trenches: Cybereator NFTs drawn among holders of depth 5+
 * (2026-10-15). The rules and the schedule live in config/draws.ts; the draw
 * itself in lib/draw.ts. This only shows them: before the snapshot, how many
 * tickets a wallet holds right now; after it, the frozen list; after the draw
 * block, the winners.
 *
 * Once `drawContract` is set, the chain is the source: the list the contract
 * locked is compared line by line with the published file ("Locked on chain"
 * only when every line matches), the draw block and winner count come from the
 * lock, and the winners from the contract's own draw. They are also worked out
 * again here from the seed with lib/draw.ts, so anyone viewing the page is
 * checking the result, not trusting it.
 *
 * The card says three things at a glance (the prize, the tickets per depth, your
 * tickets) and a timeline; every rule lives in "How it works", as bullets
 * (owner, 2026-10-15).
 */

type Phase = "before" | "counting" | "listed" | "drawn";

const fmt = (n: number) => n.toLocaleString("en-US");
const DEPTH = Object.fromEntries(TIERS.map((t) => [t.n, t]));

/** A barcode for the stub. Decoration only: bar widths come from the wallet's own characters. */
function Barcode({ seed }: { seed: string }) {
  const chars = seed.toLowerCase().replace(/^0x/, "").slice(0, 28);
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  for (const c of chars) {
    const v = parseInt(c, 36) || 1;
    const w = 1 + (v % 3);
    bars.push({ x, w });
    x += w + 1 + ((v >> 2) % 2);
  }
  return (
    <svg className="tix-barcode" viewBox={`0 0 ${x} 20`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={20} />
      ))}
    </svg>
  );
}

/** Numbers printed on the stub before "+N more". */
const STUB_NUMBERS = 8;

/** Preview only: stands in for the contract's numberSeed so shuffled numbers can be seen before one exists. */
const PREVIEW_NUMBER_SEED = keccak256(toHex("valuemint-preview-numbers"));
/* Preview only: a made-up draw. The count here is never shown outside a dev build. */
const PREVIEW_DRAW_SEED = keccak256(toHex("valuemint-preview-draw"));
const PREVIEW_WINNERS = 11;
/** The place the connected wallet is given in the made-up draw, so the winner's ticket can be seen. */
const PREVIEW_MY_PLACE = 3;

/** Days / hours / minutes / seconds to a moment, ticking once a second. */
function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((to - now) / 1000));
  const parts: [number, string][] = [
    [Math.floor(left / 86_400), "days"],
    [Math.floor((left % 86_400) / 3600), "hrs"],
    [Math.floor((left % 3600) / 60), "min"],
    [left % 60, "sec"],
  ];
  /* Drop leading zero units (no "00 days" on the last day), keep at least minutes and seconds. */
  while (parts.length > 2 && parts[0]![0] === 0) parts.shift();
  return (
    <span className="perk-clock" role="timer">
      {parts.map(([v, unit]) => (
        <span key={unit} className="perk-clock-unit">
          <b>{String(v).padStart(2, "0")}</b>
          <i>{unit}</i>
        </span>
      ))}
    </span>
  );
}

/** The configured time when it is for this block, else an estimate from the head. */
function drawAtOf(block: bigint, head: bigint | undefined): string {
  if (block === DRAW.drawBlock || head === undefined) return DRAW.drawAt;
  return new Date(Date.now() + Number(block - head) * MEASURED_BLOCK_MS).toISOString();
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

  /* Dev only: /trenches?ticketsPreview shows the page as after the snapshot,
     with today's list (public/draws/preview.json, gitignored) and the connected
     wallet added with made-up pieces, so the ticket view can be checked on a
     real wallet before the real list exists. ?ticketsPreview=drawn goes on to a
     made-up draw that the connected wallet wins, for the winner's ticket.
     Inert in a production build. */
  const [preview, setPreview] = useState<false | "listed" | "drawn">(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const read = (v: string | null) => (v === null ? false : v === "drawn" ? "drawn" : "listed");
    /* Sticky for the tab, so the header's own Trenches link keeps it on; ?ticketsPreview=off ends it. */
    try {
      const q = new URLSearchParams(window.location.search).get("ticketsPreview");
      if (q === "off") sessionStorage.removeItem("ticketsPreview");
      else if (q !== null) sessionStorage.setItem("ticketsPreview", q === "drawn" ? "drawn" : "listed");
      setPreview(read(sessionStorage.getItem("ticketsPreview")));
    } catch {
      setPreview(read(new URLSearchParams(window.location.search).get("ticketsPreview")));
    }
  }, []);

  const { data: head } = useBlockNumber({ query: { refetchInterval: 15_000 } });
  const chain = useTicketDraw(DRAW.drawContract).state;
  /* The lock is the announcement: from then on the block and the count are public on chain anyway. */
  const locked = chain !== undefined && chain.drawBlock > 0n;
  const drawBlock = locked ? chain.drawBlock : DRAW.drawBlock;
  const announced = locked || DRAW.drawAnnounced || preview === "drawn";
  const winnerCount = preview === "drawn" ? PREVIEW_WINNERS : locked ? chain.winners : DRAW.winners;
  /* With a contract, "drawn" means the contract has drawn; without, that the block exists. */
  const isDrawn = DRAW.drawContract !== "" ? chain?.drawn === true : head !== undefined && head >= drawBlock;
  const phase: Phase = preview
    ? preview
    : head === undefined || head < DRAW.snapshotBlock
      ? "before"
      : !DRAW.listPublished
        ? "counting"
        : !announced || !isDrawn
          ? "listed"
          : "drawn";

  const listUrl = preview ? "/draws/preview.json" : DRAW.listUrl;
  const { data: published } = useQuery({
    queryKey: ["draw-list", listUrl],
    enabled: DRAW.listPublished || preview !== false,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(listUrl);
      if (!res.ok) throw new Error("Could not load the ticket list.");
      return (await res.json()) as DrawList;
    },
  });
  const list = useMemo(() => {
    if (!preview || published === undefined || address === undefined) return published;
    const me = address.toLowerCase();
    if (published.entries.some((e) => e.wallet === me)) return published;
    const depths = [9, 7, 6, 6, 5];
    const entries = numberTickets([
      ...published.entries.map(({ wallet, depths, tickets }) => ({ wallet, depths, tickets })),
      { wallet: me, depths, tickets: depths.reduce((a, b) => a + b, 0) },
    ]);
    return { ...published, entries, wallets: entries.length, tickets: entries[entries.length - 1]!.to };
  }, [preview, published, address]);

  /* Block numbers are the rule; for a ticking clock, anchor the head to the wall
     clock whenever it moves and estimate at the chain's measured pace. */
  const [anchor, setAnchor] = useState<{ head: bigint; at: number } | undefined>(undefined);
  useEffect(() => {
    if (head !== undefined) setAnchor({ head, at: Date.now() });
  }, [head]);
  const etaOf = (block: bigint) =>
    anchor === undefined ? undefined : anchor.at + Number(block - anchor.head) * MEASURED_BLOCK_MS;

  /* Sealed and numbered on chain: from then on the chain's numberSeed is the one that counts. */
  const numbered = chain !== undefined && chain.numberSeed !== zeroHash;
  /* The list on chain must be the published file, line for line, with the same shuffle. */
  const listOnChain =
    numbered && list !== undefined
      ? chain.entries.length === list.entries.length &&
        chain.tickets === list.tickets &&
        chain.entries.every((e, i) => e.wallet === list.entries[i]!.wallet.toLowerCase() && e.end === list.entries[i]!.to) &&
        (list.numbers === undefined || list.numbers.seed.toLowerCase() === chain.numberSeed.toLowerCase())
      : undefined;
  /* What shuffles places into ticket numbers: the chain's, else the file's, else (preview) a stand-in. */
  const numberSeed: Hex | undefined = numbered
    ? chain.numberSeed
    : (list?.numbers?.seed ?? (preview ? PREVIEW_NUMBER_SEED : undefined));

  /* The draw block's hash picks the winners: the contract's seed, or (no contract) the block itself. */
  const client = usePublicClient();
  const { data: blockSeed } = useQuery({
    queryKey: ["draw-seed", drawBlock.toString()],
    enabled: phase === "drawn" && !preview && DRAW.drawContract === "" && client !== undefined,
    staleTime: Infinity,
    queryFn: async () => (await client!.getBlock({ blockNumber: drawBlock })).hash as Hex,
  });
  const seed = DRAW.drawContract !== "" ? (chain?.drawn ? chain.seed : undefined) : blockSeed;
  const recomputed = useMemo(
    () => (list !== undefined && seed !== undefined ? drawWinners(list.entries, seed, winnerCount, numberSeed) : undefined),
    [list, seed, winnerCount, numberSeed],
  );
  /* Preview: a made-up draw, with the connected wallet moved into one place so its winner's ticket shows. */
  const previewWinners = useMemo(() => {
    if (preview !== "drawn" || list === undefined || numberSeed === undefined) return undefined;
    const drawn = drawWinners(list.entries, PREVIEW_DRAW_SEED, PREVIEW_WINNERS, numberSeed);
    const me = address?.toLowerCase();
    const mine = me === undefined ? undefined : list.entries.find((e) => e.wallet.toLowerCase() === me);
    if (mine === undefined || drawn.some((w) => w.wallet.toLowerCase() === me)) return drawn;
    const ticket = numbersOf(mine, list.tickets, numberSeed)[0]!;
    return drawn.map((w) => (w.place === PREVIEW_MY_PLACE ? { ...w, wallet: mine.wallet, ticket, tickets: mine.tickets, attempt: 0 } : w));
  }, [preview, list, numberSeed, address]);
  /* Preview: place 1 shows as sent, the rest as not yet, so both states can be seen. */
  const sent: Readonly<Record<string, `0x${string}`>> =
    previewWinners !== undefined ? { [previewWinners[0]!.wallet.toLowerCase()]: keccak256(toHex("valuemint-preview-sent")) } : DRAW.sent;

  const winners: DrawWinner[] | undefined =
    previewWinners !== undefined
      ? previewWinners
      : DRAW.drawContract === ""
        ? recomputed
        : chain?.drawn && list !== undefined
          ? chain.results.map((r, i) => ({
              place: i + 1,
              wallet: r.wallet,
              ticket: r.ticket,
              attempt: r.attempt,
              tickets: list.entries.find((e) => e.wallet.toLowerCase() === r.wallet.toLowerCase())?.tickets ?? 0,
            }))
          : undefined;
  /* Should never be false; if it is, say so rather than quietly show one side. */
  const agrees =
    winners === undefined || recomputed === undefined
      ? undefined
      : winners.length === recomputed.length &&
        winners.every((w, i) => w.wallet.toLowerCase() === recomputed[i]!.wallet.toLowerCase());

  /* Whose tickets to show: the connected wallet, or one typed in. */
  const [typed, setTyped] = useState("");
  /* What "Share ticket" captures: the ticket, plus a footer only while capturing. */
  const shot = useRef<HTMLDivElement>(null);
  /* The full list's search and open state, lifted so the ticket's "+N more" can open it on this wallet. */
  const [listQuery, setListQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  /* Any letter case: people paste addresses from everywhere. */
  const typedOk = isAddress(typed.trim(), { strict: false });
  const lookup = typedOk ? getAddress(typed.trim()) : mounted ? address : undefined;
  const isOther = typedOk && lookup?.toLowerCase() !== address?.toLowerCase();
  /* In the preview the connected wallet is shown a ticket even if it is one of ours, so the owner can check the view. */
  const previewSelf = preview && lookup !== undefined && lookup.toLowerCase() === address?.toLowerCase();
  const excluded = lookup !== undefined && !previewSelf && DRAW.excluded.includes(lookup.toLowerCase());
  const holdings = useTrenchesHoldings(phase === "before" ? lookup : undefined);
  const listed = lookup === undefined ? undefined : list?.entries.find((e) => e.wallet.toLowerCase() === lookup.toLowerCase());
  const won = lookup === undefined ? undefined : winners?.find((w) => w.wallet.toLowerCase() === lookup.toLowerCase());
  const myNumbers = useMemo(
    () => (listed === undefined || list === undefined || numberSeed === undefined ? undefined : numbersOf(listed, list.tickets, numberSeed)),
    [listed, list, numberSeed],
  );

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
      /* While it is ahead, the clock on the ticket says when. */
      note: phase === "before" ? "" : "Taken",
    },
    {
      key: "list",
      name: "Ticket list",
      when: "After the snapshot",
      block: undefined,
      state: phase === "counting" ? "now" : phase === "before" ? "next" : "done",
      note:
        list !== undefined ? (
          <>
            <span className="tix-step-stat">
              <b>{fmt(list.tickets)}</b> tickets
            </span>
            <span className="tix-step-stat">
              <b>{fmt(list.wallets)}</b> wallets
            </span>
            {listOnChain === true ? (
              <a
                className="tix-step-lock"
                href={`${deployment.explorer}/address/${DRAW.drawContract}`}
                target="_blank"
                rel="noreferrer"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                Locked on chain
              </a>
            ) : listOnChain === false ? (
              <span className="tix-step-warn">Does not match the chain</span>
            ) : null}
          </>
        ) : phase === "counting" ? (
          "Counting…"
        ) : (
          ""
        ),
    },
    {
      key: "draw",
      name: "Draw",
      when: announced ? whenText(drawAtOf(drawBlock, head)) : "Coming soon",
      block: announced ? drawBlock : undefined,
      state: phase === "listed" ? "now" : phase === "drawn" ? "done" : "next",
      note:
        phase === "drawn"
          ? "Drawn"
          : announced && head !== undefined && phase !== "before" && head >= drawBlock
            ? "Drawing…" /* before then, the clock on the ticket counts down to it */
            : "",
    },
  ] as const;

  /* The one thing the hero counts down to, or says, right now. */
  const count: { label: string; to?: number; text?: string } =
    phase === "before"
      ? { label: "Snapshot in", to: etaOf(DRAW.snapshotBlock), text: "Reading the chain…" }
      : phase === "counting"
        ? { label: "Snapshot taken", text: "Counting the tickets…" }
        : phase === "listed"
          ? !announced
            ? { label: "Tickets are in", text: "Draw date coming soon" }
            : head !== undefined && head < drawBlock
              ? { label: "Draw in", to: etaOf(drawBlock), text: "…" }
              : { label: "Draw block reached", text: "Drawing the winners…" }
          : { label: "The draw is done", text: "Winners below" };

  const chips =
    held.length > 0 ? (
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
    ) : null;

  /* What the stub of the ticket says for the wallet being looked at. */
  let stub: React.ReactNode;
  if (lookup === undefined) {
    stub = <p className="tix-stub-note">Connect a wallet to see your tickets, or check any wallet below.</p>;
  } else if (excluded) {
    stub = <p className="tix-stub-note">A ValueMint test or deployer wallet, so it is left out.</p>;
  } else if (phase === "before" && holdings.loading) {
    stub = <p className="tix-stub-note">Reading its Trenches pieces…</p>;
  } else if (phase === "counting") {
    stub = <p className="tix-stub-note">Snapshot taken. The tickets appear here once the list is out.</p>;
  } else if (won !== undefined && list !== undefined) {
    /* The winner's stub: the ticket that came up, and where the prize is. */
    const tx = sent[won.wallet.toLowerCase()];
    stub = (
      <>
        <p className="tix-stub-num">
          <b>#{fmt(won.ticket)}</b>
        </p>
        <p className="tix-stub-wallet">{shortAddress(won.wallet as `0x${string}`, 4)}</p>
        <p className="tix-stub-note">
          Drawn from all <b>{fmt(list.tickets)}</b> tickets. {isOther ? "It" : "You"} held <b>{fmt(won.tickets)}</b>.
        </p>
        {tx !== undefined ? (
          <a className="tix-stub-sent" href={`${deployment.explorer}/tx/${tx}`} target="_blank" rel="noreferrer">
            Cybereator sent
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        ) : (
          <p className="tix-stub-sent is-pending">Cybereator on its way</p>
        )}
      </>
    );
  } else if (listed !== undefined && list !== undefined) {
    const share = (listed.tickets / list.tickets) * 100;
    stub = (
      <>
        <p className="tix-stub-num">
          <b>{fmt(listed.tickets)}</b>
          <span>{listed.tickets === 1 ? "ticket" : "tickets"}</span>
        </p>
        {myNumbers !== undefined ? (
          <div className="tix-nums">
            {myNumbers.slice(0, STUB_NUMBERS).map((n) => (
              <span key={n}>#{fmt(n)}</span>
            ))}
            {myNumbers.length > STUB_NUMBERS ? (
              <button
                type="button"
                onClick={() => {
                  setListQuery(listed.wallet);
                  setListOpen(true);
                  requestAnimationFrame(() => document.querySelector(".perk-list")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                }}
              >
                +{myNumbers.length - STUB_NUMBERS} more
              </button>
            ) : null}
          </div>
        ) : (
          <p className="tix-stub-range">{rangeText(listed)}</p>
        )}
        <p className="tix-stub-note">
          <b>{share < 0.01 ? "<0.01" : share.toFixed(2)}%</b> of all {fmt(list.tickets)} tickets
        </p>
        {chips}
        {phase === "drawn" && winners !== undefined ? <p className="tix-stub-note">Not drawn this time. Thank you for playing.</p> : null}
      </>
    );
  } else {
    stub = (
      <>
        <p className="tix-stub-num">
          <b>{fmt(tickets)}</b>
          <span>{tickets === 1 ? "ticket" : "tickets"}</span>
        </p>
        {chips}
        <p className="tix-stub-note">
          {tickets === 0 ? (
            phase === "before" ? (
              <>
                No depth {DRAW.minDepth}+ piece yet.{" "}
                <Link href={`/collection/${TRENCHES_ADDRESS}`}>Find one on the market</Link>.
              </>
            ) : (
              `No depth ${DRAW.minDepth}+ piece at the snapshot.`
            )
          ) : phase === "before" ? (
            "If this wallet still holds them at the snapshot."
          ) : null}
        </p>
      </>
    );
  }

  return (
    <section className="page section perk" id="perks" aria-labelledby="perk-title">
      {preview ? (
        <p className="perk-preview-bar">
          <b>Preview</b> (localhost only): as after the snapshot, with today&rsquo;s list
          {address !== undefined ? " and your wallet given made-up pieces" : ". Connect a wallet to get a ticket"}.{" "}
          <a href="?ticketsPreview=off">Exit</a>
        </p>
      ) : null}

      {/* The whole perk is one event ticket (owner, 2026-10-16, after a ticket
          reference): the art on the left, the event on the face, the wallet's
          own tickets on a tear-off stub. How many are given is not said (owner,
          2026-10-15). */}
      <div className={`tix-shot${won !== undefined ? " is-won" : ""}`} ref={shot}>
        <div className={`tix${won !== undefined ? " is-won" : ""}`}>
          <div className="tix-art" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tix-art-bg" src="/heroes/cybereator-bg.webp" alt="" />
            {/* A winner's ticket: rays of Cybereator gold behind the cat. */}
            {won !== undefined ? <span className="tix-art-burst" /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tix-art-cat" src="/heroes/cybereator-cat.webp" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tix-art-logo" src="/brand/cybereator-dark.png" alt="" />
            <div className="tix-art-pieces">
              {[5, 9, 10].map((d, i) => {
                const t = DEPTH[d];
                return t === undefined ? null : (
                  <span key={d} className={`tix-piece is-${i}`} style={{ ["--c" as string]: t.colour }}>
                    <Art src={tierImage(t)} alt="" sizes="72px" />
                  </span>
                );
              })}
            </div>
          </div>

          <div className="tix-face">
            <p className="tix-kicker">SoDEX Trenches · Holder draw</p>
            <h2 className="tix-title" id="perk-title">
              {won === undefined ? "Win a" : isOther ? "This wallet won a" : "You won a"}{" "}
              {/* The Cybereator wordmark itself, tinted gold (owner, 2026-10-16); the word stays for screen readers. */}
              <span className="tix-wordmark">
                <span className="visually-hidden">Cybereator</span>
              </span>
            </h2>

            {won !== undefined && winners !== undefined ? (
              <div className="tix-win">
                <span className="tix-win-place">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
                  </svg>
                  Winner #{won.place} of {winners.length}
                </span>
                <span className="tix-win-how">Picked on ValueChain from block {fmt(Number(drawBlock))}</span>
              </div>
            ) : (
              <div className="tix-count">
                <span className="tix-count-label">{count.label}</span>
                {count.to !== undefined ? <Countdown to={count.to} /> : <span className="tix-count-text">{count.text}</span>}
              </div>
            )}

            <ol className="tix-steps">
              {steps.map((s) => (
                <li
                  key={s.key}
                  className={`tix-step is-${s.state}`}
                  title={s.block !== undefined ? `Block ${fmt(Number(s.block))}` : undefined}
                >
                  <span className="tix-step-name">
                    <i aria-hidden="true" />
                    {s.name}
                  </span>
                  <span className="tix-step-when">{s.when}</span>
                  {s.note !== "" ? (
                    <span className="tix-step-note">
                      {s.note}
                      {/* Why the snapshot came early, behind an "i" so the step stays one word. */}
                      {s.key === "snapshot" && phase !== "before" && DRAW.snapshotNote !== undefined ? (
                        <span className="tix-info">
                          <button type="button" className="tix-info-btn" aria-label={DRAW.snapshotNote}>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 11v5M12 8h.01" />
                            </svg>
                          </button>
                          <span className="tix-info-tip" role="tooltip">
                            {DRAW.snapshotNote}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="tix-stub" aria-live="polite">
            <p className="tix-stub-label">
              {won !== undefined ? "Winning ticket" : isOther ? "That wallet" : phase === "before" ? "Your tickets now" : "Your tickets"}
            </p>
            {stub}
            {won !== undefined ? (
              <span className="tix-stamp" aria-hidden="true">
                Winner
              </span>
            ) : null}
            <Barcode seed={lookup ?? DRAW.id} />
            <span className="tix-admit" aria-hidden="true">
              Admit one wallet · {DRAW.id}
            </span>
          </div>
        </div>

        <p className="tix-shot-foot" aria-hidden="true">
          <span>{won !== undefined ? "Cybereator × ValueMint · Trenches holder draw" : "Cybereator × ValueMint"}</span>
          <b>valuemint.store/trenches</b>
        </p>
      </div>

      <div className="tix-tools">
        <TicketShare
          target={shot}
          fileName={`cybereator-${won !== undefined ? "winner" : "ticket"}${lookup !== undefined ? `-${lookup.slice(2, 8).toLowerCase()}` : ""}.png`}
          label={won !== undefined ? (isOther ? "Share this win" : "Share my win") : "Share ticket"}
          text={
            won !== undefined
              ? isOther
                ? "A winner of the Cybereator holder draw 🏆 valuemint.store/trenches"
                : "I won a Cybereator in the Trenches holder draw 🏆 valuemint.store/trenches"
              : "My tickets for the Cybereator draw 🎟️ valuemint.store/trenches"
          }
        />
        <label className="perk-lookup tix-lookup">
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

      <div className="perk-card">
        {winners !== undefined ? (
          <div className="perk-winners">
            <div className="perk-winners-head">
              <h3 className="perk-winners-title">
                {winners.length} {winners.length === 1 ? "winner" : "winners"}
              </h3>
              <p className="perk-winners-sub">
                Picked on ValueChain from block {fmt(Number(drawBlock))}. One Cybereator each.
              </p>
            </div>
            {agrees === false ? (
              <p className="perk-you-note">
                The contract&rsquo;s result and this page&rsquo;s own check disagree. Do not rely on either until this is
                looked at.
              </p>
            ) : null}
            <ol className="perk-winners-grid">
              {winners.map((w) => {
                const tx = sent[w.wallet.toLowerCase()];
                const me = address !== undefined && w.wallet.toLowerCase() === address.toLowerCase();
                const shown = lookup !== undefined && w.wallet.toLowerCase() === lookup.toLowerCase();
                return (
                  <li key={w.wallet} className={`perk-w${me ? " is-you" : ""}${shown ? " is-shown" : ""}`}>
                    <span className="perk-w-place">#{w.place}</span>
                    <span className="perk-w-who">
                      <AddressLink address={w.wallet} chars={5} />
                      {me ? <span className="perk-list-you">You</span> : null}
                    </span>
                    <span className="perk-w-ticket">
                      Ticket <b>#{fmt(w.ticket)}</b> · held {fmt(w.tickets)}
                    </span>
                    <span className="perk-w-foot">
                      {tx !== undefined ? (
                        <a className="perk-w-sent" href={`${deployment.explorer}/tx/${tx}`} target="_blank" rel="noreferrer">
                          Sent
                        </a>
                      ) : (
                        <span className="perk-w-pending">Sending soon</span>
                      )}
                      <button
                        type="button"
                        className="perk-w-view"
                        onClick={() => {
                          setTyped(me ? "" : w.wallet);
                          requestAnimationFrame(() => shot.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
                        }}
                      >
                        {shown ? "Showing ticket" : "See ticket"}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {phase === "before" ? <TicketLeaderboard you={lookup?.toLowerCase()} /> : null}

        {list !== undefined && phase !== "before" && phase !== "counting" ? (
          <TicketList
            entries={list.entries}
            tickets={list.tickets}
            numberSeed={numberSeed}
            query={listQuery}
            onQuery={setListQuery}
            open={listOpen}
            onOpen={setListOpen}
            you={lookup?.toLowerCase()}
            lockedHref={listOnChain === true ? `${deployment.explorer}/address/${DRAW.drawContract}` : undefined}
          />
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
            <li>After the snapshot, the full list is locked on ValueChain and everyone&rsquo;s ticket numbers are given out at random.</li>
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
