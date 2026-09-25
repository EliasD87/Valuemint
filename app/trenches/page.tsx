"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { Art } from "@/components/Art";
import { ArrowRight } from "@/components/Arrows";
import { ConnectButton } from "@/components/ConnectButton";
import { DepthScene } from "@/components/DepthScene";
import { SodexLogo } from "@/components/SodexLogo";
import { TxResult } from "@/components/TxResult";
import { useTrenchesClaim } from "@/hooks/useTrenchesClaim";
import { TIERS, formatVolume, tierImage, type Tier } from "@/config/tiers";
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

  const statusOf = (t: Tier, i: number): Status | undefined => {
    if (claimed[i]) return "claimed";
    if (standing === undefined) return undefined;
    if (reached === t.n) return "here";
    return reached > t.n ? "earned" : "locked";
  };

  return (
    <>
      <section className="page section trx-intro">
        <div className="trx-intro-copy">
          <p className="eyebrow">The Trenches</p>
          <h1 className="trx-title">How deep have you traded?</h1>
          <p className="trx-lede">
            Ten free NFTs for SoDEX traders, one for every depth of all-time volume you pass. Free to
            claim, gas only, one per depth.
          </p>
          <div className="trx-actions">
            <a className="btn btn-primary btn-lg" href="#depths">
              See the ten depths
              <ArrowRight />
            </a>
            {deployed ? (
              <Link className="btn btn-lg" href={`/collection/${TRENCHES_ADDRESS}`}>
                Trade them
              </Link>
            ) : null}
          </div>

          <YourDepth
            state={state}
            connected={address !== undefined}
            onRetry={() => address && void check(address)}
            onClaimed={() => void refetchReads()}
          />
        </div>

        <figure className="trx-art">
          <DepthScene
            className="trx-scene"
            src="/heroes/trenches-cutout.webp"
            srcSet="/heroes/trenches-cutout-900.webp 900w, /heroes/trenches-cutout.webp 1600w"
            sizes="(max-width: 860px) 100vw, 34rem"
            small="/heroes/trenches-cutout-900.webp"
            depth="/heroes/trenches-depth.png"
            width={1600}
            height={663}
            alt="The ten spirits of The Trenches side by side, Halo at the centre"
          />
          <figcaption className="trx-lockup">
            <SodexLogo variant="full" className="trx-lockup-logo" title="SoDEX" />
            <span aria-hidden="true">×</span>
            <span>ValueMint</span>
          </figcaption>
        </figure>
      </section>

      <section className="page section" id="depths">
        <div className="head">
          <div>
            <p className="eyebrow">The ladder</p>
            <h2>Ten depths</h2>
          </div>
          <p className="trx-head-note">
            {supply === undefined ? null : (
              <>
                <b>{supply.toLocaleString()}</b> claimed so far
              </>
            )}
          </p>
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
  const from = tier?.min ?? 0;
  const to = next?.min;
  const progress =
    tier !== undefined && next === undefined
      ? 1
      : volume !== undefined && to !== undefined && to > from
        ? Math.min(Math.max((volume - from) / (to - from), 0), 1)
        : 0;
  const percent = Math.floor(progress * 100);

  let reading: React.ReactNode;
  if (!connected) {
    reading = <span className="muted">Connect a wallet to see how deep it has traded.</span>;
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
    <div className="card trx-you" aria-live="polite">
      <div className="trx-you-top">
        <span className="eyebrow">Your depth</span>
        {claim.open === true ? (
          <span className="chip chip-up">Claiming open</span>
        ) : claim.open === false ? (
          <span className="chip">Claiming paused</span>
        ) : null}
      </div>
      <p className="trx-you-reading">{reading}</p>

      {showBar ? (
        <div className="trx-progress" style={{ ["--from" as string]: tier?.colour ?? "var(--line-strong)", ["--to" as string]: next?.colour ?? tier?.colour ?? "var(--line-strong)" }}>
          <div className="trx-progress-figures">
            <span>
              {volume !== undefined ? (
                <>
                  <b>{formatTraded(volume)}</b> traded
                </>
              ) : state.kind === "checking" ? (
                "\u00a0"
              ) : (
                <b>{formatVolume(from)}+ traded</b>
              )}
            </span>
            <span>
              {data?.next != null && next !== undefined ? (
                <>
                  <b>{formatVolume(data.next.needed)}</b> to {next.name}
                </>
              ) : tier !== undefined ? (
                "Deepest reached"
              ) : null}
            </span>
          </div>
          <div
            className={`trx-progress-track${state.kind === "checking" ? " is-loading" : ""}`}
            role="progressbar"
            aria-label={next === undefined ? "Volume" : `Volume toward ${next.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span className="trx-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="trx-progress-ends">
            <span>{tier === undefined ? "" : `${tier.name} · ${tier.min === 0 ? "any trade" : formatVolume(tier.min)}`}</span>
            <span>
              {next !== undefined ? `${next.name} · ${formatVolume(next.min)}` : tier !== undefined ? `${percent}%` : ""}
            </span>
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
    return <p className="trx-claim-note">Every depth you have reached is claimed.</p>;
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

/** A depth, as the token card draws a piece everywhere else on the site. */
function DepthCard({ tier, minted, status }: { tier: Tier; minted: number | undefined; status: Status | undefined }) {
  /** The first of this depth ever claimed, to show the piece as it trades. */
  const href =
    deployed && minted !== undefined && minted > 0
      ? `/token/${TRENCHES_ADDRESS}/${tier.n * TIER_STRIDE + 1}`
      : undefined;

  return (
    <article className={`tcard trx-card${status === "locked" ? " is-locked" : ""}`}>
      {href !== undefined ? <Link href={href} className="tcard-hit" aria-label={`${tier.name}, depth ${tier.n}`} /> : null}
      <div className="tcard-media">
        <Art src={tierImage(tier)} alt={tier.name} sizes="(max-width: 999px) 50vw, 240px" />
        {status !== undefined ? (
          <div className="tcard-badges">
            <Chip status={status} />
          </div>
        ) : null}
      </div>
      <div className="tcard-body">
        <div className="tcard-head">
          <span className="tcard-title">{tier.name}</span>
          <span className="tcard-num">Depth {two(tier.n)}</span>
        </div>
        <div className="tcard-money">
          <span className="tcard-amount">
            {tier.min === 0 ? "Any trade" : formatVolume(tier.min)}
            {tier.min === 0 ? null : <span className="soso-unit">&nbsp;volume</span>}
          </span>
        </div>
        <div className="tcard-meta">
          <span>{minted === undefined ? "—" : minted === 0 ? "None claimed yet" : `${minted.toLocaleString()} claimed`}</span>
        </div>
      </div>
    </article>
  );
}

function Chip({ status }: { status: Status }) {
  if (status === "claimed") return <span className="chip chip-accent">Claimed</span>;
  if (status === "here") return <span className="chip chip-up">You&rsquo;re here</span>;
  if (status === "earned") return <span className="chip chip-up">Earned</span>;
  return <span className="chip">Locked</span>;
}
