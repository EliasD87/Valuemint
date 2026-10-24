"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { SodexLogo } from "@/components/SodexLogo";
import { TxResult } from "@/components/TxResult";
import { useTrenchesClaim } from "@/hooks/useTrenchesClaim";
import { TrenchesFrame } from "@/components/TrenchesFrame";
import { TrenchesDeck } from "@/components/TrenchesDeck";
import { TiltCard } from "@/components/TiltCard";
import { GiveawaysPanel, RunningGiveaway } from "@/components/HolderGiveaways";
import { TIERS, formatVolume, type Tier } from "@/config/tiers";
import { TIER_STRIDE, TRENCHES_ABI, TRENCHES_ADDRESS } from "@/config/trenches";
import "@/styles/home.css";
import "@/components/TokenCard.css";
import "@/styles/trenches.css";

/**
 * The Trenches — a free NFT for SoDEX traders, one per depth they've reached.
 *
 * A wallet claims each tier once, so the set is collected over time rather than
 * won in a single shot: reach Warlord and you can take the six below it, then
 * come back for Sakura when your volume gets there.
 *
 * The tier is decided by /api/eligibility, never here. A tier computed in the
 * browser would be a tier the claimant could edit.
 *
 * Built from the rest of the site's parts on purpose — `.page section`, the
 * `.head` eyebrow-and-heading, `.grid-tokens` and the token card, `.chip` — so
 * it reads as one more page of the marketplace rather than a microsite. The
 * one thing of its own is the group picture, kept small at the side and drawn
 * with depth.
 */

/** What /api/eligibility returns. Volume itself is deliberately not in it. */
interface Standing {
  found: boolean;
  tier: { n: number; name: string; min: number } | null;
  next: { n: number; name: string; min: number; needed: number } | null;
}

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "done"; data: Standing }
  | { kind: "error"; message: string };

type Status = "claimed" | "here" | "earned" | "locked";

const deployed = TRENCHES_ADDRESS !== "";
const contract = { address: TRENCHES_ADDRESS as `0x${string}`, abi: TRENCHES_ABI } as const;
const two = (n: number) => String(n).padStart(2, "0");

/**
 * `formatVolume`, rounded down instead of to nearest. A wallet $1 short of
 * $150M must not read "$150M traded" beside a bar that says it is not there.
 */
function formatTraded(usd: number): string {
  for (const [size, suffix] of [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ] as const) {
    if (usd >= size) {
      const v = usd / size;
      const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
      const floored = Math.floor(v * 10 ** digits) / 10 ** digits;
      return `$${Number.isInteger(floored) ? floored : floored.toFixed(digits)}${suffix}`;
    }
  }
  return `$${Math.floor(usd)}`;
}

export default function Trenches() {
  const { address } = useAccount();
  const [state, setState] = useState<State>({ kind: "idle" });

  /**
   * Nothing wallet-shaped renders until after hydration. The server has no
   * wallet, so it draws "Connect a wallet"; wagmi restores a connection
   * during the first client render, which drew "Reading SoDEX…" instead. React
   * then threw the server HTML away and rebuilt the tree — and rebuilding the
   * root is what clears <html data-theme>, flipping a dark page light
   * (2026-09-26). Same gate as the one in Wallet.tsx.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const check = useCallback(async (who: string, signal?: { cancelled: boolean }) => {
    setState({ kind: "checking" });
    try {
      const res = await fetch(`/api/eligibility/${who}`);
      const body = await res.json();
      if (signal?.cancelled === true) return;
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Could not read this wallet's depth." });
        return;
      }
      setState({ kind: "done", data: body as Standing });
    } catch {
      if (signal?.cancelled !== true) {
        setState({ kind: "error", message: "Could not reach SoDEX just now." });
      }
    }
  }, []);

  /** The connected wallet looks itself up; switching wallets looks up the new one. */
  useEffect(() => {
    if (address === undefined) {
      setState({ kind: "idle" });
      return;
    }
    const signal = { cancelled: false };
    void check(address, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [address, check]);

  /**
   * One multicall: how many of each depth exist, and — for a connected wallet —
   * which it has claimed.
   */
  const { data: reads, refetch: refetchReads } = useReadContracts({
    contracts: [
      ...TIERS.map((t) => ({ ...contract, functionName: "mintedPerTier", args: [t.n] }) as const),
      ...(address === undefined
        ? []
        : TIERS.map((t) => ({ ...contract, functionName: "claimed", args: [address, t.n] }) as const)),
    ],
    query: { enabled: deployed, refetchInterval: 60_000 },
  });

  const minted = useMemo(
    () =>
      TIERS.map((_, i) => {
        const r = reads?.[i];
        return r?.status === "success" ? Number(r.result) : undefined;
      }),
    [reads],
  );
  const claimed = useMemo(
    () =>
      TIERS.map((_, i) => {
        const r = reads?.[TIERS.length + i];
        return r?.status === "success" && r.result === true;
      }),
    [reads],
  );
  /** Every token is one depth's, so the ten counts are the whole supply. */
  const supply = minted.every((m) => m !== undefined)
    ? minted.reduce<number>((a, m) => a + (m ?? 0), 0)
    : undefined;

  const standing = state.kind === "done" ? state.data : undefined;
  const reached = standing?.tier?.n ?? 0;

  /* Dev only: /trenches?depthPreview=7 shows the cards as a wallet at depth 7
     that has claimed below it, so the statuses can be seen without one. */
  const [depthPreview, setDepthPreview] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const v = Number(new URLSearchParams(window.location.search).get("depthPreview"));
    if (v >= 1 && v <= TIERS.length) setDepthPreview(v);
  }, []);

  const statusOf = (t: Tier, i: number): Status | undefined => {
    if (depthPreview !== undefined) return t.n < depthPreview ? "claimed" : t.n === depthPreview ? "here" : "locked";
    if (claimed[i]) return "claimed";
    if (standing === undefined) return undefined;
    if (reached === t.n) return "here";
    return reached > t.n ? "earned" : "locked";
  };

  return (
    <>
      {/* The hero (owner, 2026-10-24): on the left the headline, then the
          wallet's depth and claim, then holder giveaways, each only as tall as
          its content; on the right the deck of the ten cards. */}
      <section className="trx-hero" aria-labelledby="trx-title">
        <div className="page trx-hero-inner">
          <div className="trx-hero-left">
            <div className="trx-hero-copy">
              <p className="trx-lockup">
                <SodexLogo variant="full" className="trx-lockup-logo" title="SoDEX" />
                <span aria-hidden="true">×</span>
                <span>ValueMint</span>
              </p>
              <h1 className="trx-title" id="trx-title">
                How deep have you traded?
              </h1>
              <p className="trx-lede">One free NFT for every depth of SoDEX volume you pass.</p>
              {/* Small print, taking almost no room (owner, 2026-10-24). */}
              <p className="trx-meta">
                {TIERS.length} depths
                {supply === undefined ? null : <> · {supply.toLocaleString()} claimed</>} · free, gas only
              </p>
            </div>

            {/* The wallet's standing and the claim: what the page is for. */}
            <YourDepth
              state={state}
              connected={mounted && address !== undefined}
              onRetry={() => address && void check(address)}
              onClaimed={() => void refetchReads()}
            />

            {/* Past holder giveaways, and that more are coming. */}
            <GiveawaysPanel />
          </div>

          <figure className="trx-art">
            {/* The ten depths as an interactive deck (components/TrenchesDeck), opening on the wallet's depth. */}
            <TrenchesDeck start={state.kind === "done" ? (state.data.tier?.n ?? undefined) : undefined} />
          </figure>
        </div>
      </section>

      {/* A holder giveaway that is not drawn yet, in full (config/draws.ts DRAWS); nothing between giveaways. */}
      <RunningGiveaway />

      <section className="page section trx-depths" id="depths" aria-labelledby="trx-depths-title">
        <div className="trx-depths-head">
          <h2 className="trx-depths-title" id="trx-depths-title">
            The ten depths
          </h2>
          <p className="trx-depths-note">Trade more on SoDEX to go deeper. Each depth is one free piece, claimed once.</p>
        </div>
        <div className="grid-tokens trx-grid">
          {TIERS.map((t, i) => (
            <DepthCard key={t.n} tier={t} minted={minted[i]} status={statusOf(t, i)} />
          ))}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

/**
 * The answer to the headline: the wallet's depth, and a progress bar of its
 * all-time volume from that depth's mark to the next one's.
 *
 * The volume is worked out, not read: /api/eligibility deliberately returns
 * no `volumeUsd`, only how much the next depth still needs, and the mark
 * minus that is the volume to the dollar (checked against SoDEX's own
 * leaderboard for two wallets, 2026-09-25). At the deepest depth there is no
 * next mark, so there is nothing to derive it from — the bar is simply full.
 *
 * The bar spans one gap, not the whole ladder: the gaps run from $1K to
 * $100M, so a single scale would put five depths in its first sliver and
 * never visibly move for most wallets.
 */
function YourDepth({
  state,
  connected,
  onRetry,
  onClaimed,
}: {
  state: State;
  connected: boolean;
  onRetry: () => void;
  /** Re-read the cards' claimed state once a claim confirms. */
  onClaimed: () => void;
}) {
  const data = state.kind === "done" ? state.data : undefined;
  const tier = data?.tier == null ? undefined : TIERS.find((t) => t.n === data.tier!.n);
  const next = data?.next == null ? undefined : TIERS.find((t) => t.n === data.next!.n);

  const volume = data?.next != null ? Math.max(data.next.min - data.next.needed, 0) : undefined;
  /**
   * All the volume so far against the next depth's mark — the "6,825 / 10,000"
   * of it, counted from zero rather than from this depth's own mark, so it
   * reads as how far they have come and not only what is left.
   */
  const toward =
    next === undefined
      ? tier === undefined
        ? 0
        : 1
      : volume !== undefined && next.min > 0
        ? Math.min(Math.max(volume / next.min, 0), 1)
        : 0;
  const towardPct = Math.floor(toward * 100);
  /** Depths already reached: every circle up to this one is checked. */
  const reachedN = tier?.n ?? 0;
  const loading = state.kind === "checking";

  let reading: React.ReactNode;
  if (!connected) {
    reading = <span className="muted">Connect a wallet to see your depth.</span>;
  } else if (state.kind === "checking" || state.kind === "idle") {
    reading = <span className="muted">Reading SoDEX…</span>;
  } else if (state.kind === "error") {
    reading = <span className="muted">{state.message}</span>;
  } else if (tier === undefined) {
    reading = <span>No SoDEX trades yet. Any trade reaches Halo.</span>;
  } else {
    reading = (
      <>
        <b>{tier.name}</b>
        <span className="muted">
          {" "}
          · Depth {tier.n} of {TIERS.length}
        </span>
      </>
    );
  }

  const showBar = connected && (state.kind === "checking" || (state.kind === "done" && tier !== undefined));

  /**
   * Claiming, from the hook the page had all along. It asks the chain which of
   * the depths this wallet has earned it still holds unclaimed, so the button
   * never offers a piece the signature will not mint — and one transaction
   * takes all of them.
   */
  const claim = useTrenchesClaim(tier?.n ?? 0);
  const claimDone = claim.phase.kind === "done";
  /* A ref, so a parent re-render (a fresh callback) cannot re-fire the refetch. */
  const onClaimedRef = useRef(onClaimed);
  onClaimedRef.current = onClaimed;
  useEffect(() => {
    if (claimDone) onClaimedRef.current();
  }, [claimDone]);

  return (
    /* Black and white, not the depth's colour (owner, 2026-10-24); --from is set in trenches.css. */
    <div className="card trx-you" aria-live="polite">
      {/* Left: who they are and the ladder. Right: the next goal and the claim. */}
      <div className="trx-you-main">
        {/* Fewer words (owner, 2026-10-24): the depth itself heads the card, no label above it. */}
        <div className="trx-you-top">
          <p className="trx-you-reading">{reading}</p>
          {claim.open === true ? (
            <span className="chip chip-up">Claiming open</span>
          ) : claim.open === false ? (
            <span className="chip">Claiming paused</span>
          ) : null}
        </div>
        {/*
          The ladder, one circle per depth — how far they have come at a
          glance: a check on every depth reached; a ring
          filling toward the next; the rest still to go.
        */}
        {showBar ? (
          <ol className={`trx-ladder${loading ? " is-loading" : ""}`} aria-label="Depths">
            {TIERS.map((t) => {
              const done = t.n <= reachedN;
              const active = !loading && next !== undefined && t.n === next.n;
              return (
                <li
                  key={t.n}
                  className={`trx-rung${done ? " is-done" : active ? " is-active" : ""}`}
                  title={`${t.name} · ${t.min === 0 ? "any trade" : formatVolume(t.min)}`}
                  aria-label={`${t.name}: ${done ? "reached" : active ? `${towardPct}% of the way` : "not yet"}`}
                >
                  <span className="trx-rung-dot">
                    {done ? (
                      <svg className="trx-rung-check" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6.5 12.5l3.8 3.8 7.2-8.1" />
                      </svg>
                    ) : active ? (
                      <svg className="trx-rung-ring" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="trx-rung-track" cx="12" cy="12" r="10.25" />
                        <circle
                          className="trx-rung-arc"
                          cx="12"
                          cy="12"
                          r="10.25"
                          pathLength={100}
                          strokeDasharray={`${Math.max(towardPct, 2)} 100`}
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className="trx-rung-label" aria-hidden="true">
                    {two(t.n)}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
      <div className="trx-you-side">
        {/* The goal: all the volume so far against the next depth's mark. */}
        {showBar ? (
          <div className="trx-goal">
            {!loading && next === undefined ? <span className="trx-goal-label">Every depth reached</span> : null}
            <div className="trx-goal-figures">
              <span className="trx-goal-num">
                {loading ? (
                  <b>&nbsp;</b>
                ) : volume !== undefined ? (
                  <b>{formatTraded(volume)}</b>
                ) : (
                  <b>{formatVolume(tier?.min ?? 0)}+</b>
                )}
                {!loading && next !== undefined ? (
                  <span className="trx-goal-of">
                    /{formatVolume(next.min)} to {next.name}
                  </span>
                ) : null}
              </span>
              {loading ? null : <span className="trx-goal-pct">{towardPct}%</span>}
            </div>
            <div
              className={`trx-goal-track${loading ? " is-loading" : ""}`}
              role="progressbar"
              aria-label={next === undefined ? "Volume" : `Volume toward ${next.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={towardPct}
            >
              <span className="trx-goal-fill" style={{ width: `${loading ? 0 : toward * 100}%` }} />
            </div>
          </div>
        ) : null}
        {!connected ? (
          <ConnectButton className="btn btn-primary btn-block">Connect wallet to claim</ConnectButton>
        ) : state.kind === "error" ? (
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Try again
          </button>
        ) : tier !== undefined && claim.deployed ? (
          <ClaimAction claim={claim} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The claim button and what it says at each step.
 *
 * The server re-reads the wallet's volume and signs a ceiling, the wallet
 * sends one transaction, and the contract mints every earned depth this
 * wallet does not hold yet — so the count on the button is read from the
 * chain, not worked out here.
 */
function ClaimAction({ claim }: { claim: ReturnType<typeof useTrenchesClaim> }) {
  const { phase, owedCount, open } = claim;

  if (phase.kind === "confirming" || phase.kind === "done") {
    return (
      <TxResult
        hash={claim.hash}
        confirming={phase.kind === "confirming"}
        success={phase.kind === "done"}
        error={null}
        successLabel="Claimed. They are in your wallet"
      />
    );
  }

  if (open === false) {
    return <p className="trx-claim-note">Claiming is paused for now.</p>;
  }
  if (open === undefined || owedCount === undefined) {
    return (
      <button type="button" className="btn btn-primary btn-block is-busy" disabled aria-busy="true">
        <span className="trx-spin" aria-hidden="true" />
        Checking what you can claim…
      </button>
    );
  }
  if (owedCount === 0) {
    return <p className="trx-claim-note">All claimed</p>;
  }

  const busy = phase.kind === "authorising" || phase.kind === "signing";
  return (
    <>
      <button
        type="button"
        className={`btn btn-primary btn-block${busy ? " is-busy" : ""}`}
        disabled={busy}
        aria-busy={busy}
        onClick={() => void claim.claim()}
      >
        {busy ? <span className="trx-spin" aria-hidden="true" /> : null}
        {phase.kind === "authorising"
          ? "Checking your volume…"
          : phase.kind === "signing"
            ? "Confirm in your wallet…"
            : `Claim ${owedCount} ${owedCount === 1 ? "piece" : "pieces"}, free`}
      </button>
      {phase.kind === "error" ? <p className="txr txr-bad">{phase.message}</p> : null}
    </>
  );
}

/**
 * A depth, as the Trenches card (components/TrenchesFrame): the frame is the
 * whole card (owner, 2026-10-24), with the wallet's status on the art and the
 * volume mark and claimed count in its foot.
 */
function DepthCard({ tier, minted, status }: { tier: Tier; minted: number | undefined; status: Status | undefined }) {
  /** The first of this depth ever claimed, to show the piece as it trades. */
  const href =
    deployed && minted !== undefined && minted > 0
      ? `/token/${TRENCHES_ADDRESS}/${tier.n * TIER_STRIDE + 1}`
      : undefined;

  const locked = status === "locked";
  return (
    <TiltCard className="trx-card">
      {href !== undefined ? <Link href={href} className="trx-card-hit" aria-label={`${tier.name}, depth ${tier.n}`} /> : null}
      <TrenchesFrame
        tier={tier}
        status={status !== undefined && !locked ? <Chip status={status} /> : undefined}
        lock={locked ? (tier.min === 0 ? "Make a trade" : `Reach ${formatVolume(tier.min)}`) : undefined}
        meta={
          <>
            <b>{tier.min === 0 ? "Any trade" : formatVolume(tier.min)}</b>
            {minted === undefined ? null : minted === 0 ? " · none yet" : ` · ${minted.toLocaleString()} claimed`}
          </>
        }
      />
    </TiltCard>
  );
}

function Chip({ status }: { status: Status }) {
  if (status === "claimed") return <span className="chip chip-accent">Claimed</span>;
  if (status === "here") return <span className="chip chip-up">You&rsquo;re here</span>;
  if (status === "earned") return <span className="chip chip-up">Earned</span>;
  return <span className="chip">Locked</span>;
}
