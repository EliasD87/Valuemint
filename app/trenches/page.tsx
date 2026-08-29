"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import { Art } from "@/components/Art";
import { TIERS, formatVolume, tierImage, type Tier } from "@/config/tiers";
import "@/styles/trenches.css";

/**
 * The Trenches — a free NFT for SoDEX traders, one per depth they've reached.
 *
 * A wallet claims each tier once, so the set is collected over time rather than
 * won in a single shot: reach Deep and you can take the seven below it, then
 * come back for Trench when your volume gets there.
 *
 * The tier is decided by /api/eligibility, never here. A tier computed in the
 * browser would be a tier the claimant could edit.
 */

interface Eligibility {
  address: string;
  found: boolean;
  volumeUsd: number;
  rank: number | null;
  tier: { n: number; name: string; min: number } | null;
  next: { n: number; name: string; min: number; needed: number } | null;
}

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "done"; data: Eligibility }
  | { kind: "error"; message: string };

export default function Trenches() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (address === undefined) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "checking" });

    (async () => {
      try {
        const res = await fetch(`/api/eligibility/${address}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: body.error ?? "Could not check this wallet." });
          return;
        }
        setState({ kind: "done", data: body as Eligibility });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Could not reach the check. Try again shortly." });
      }
    })();

    // A wallet switch mid-request must not let the old answer land on the new
    // address — that would show someone else's tier under your wallet.
    return () => {
      cancelled = true;
    };
  }, [address]);

  const reached = state.kind === "done" ? (state.data.tier?.n ?? 0) : 0;

  return (
    <div className="tr">
      <section className="tr-hero">
        <div className="tr-deep" aria-hidden="true" />
        <div className="tr-glow" aria-hidden="true" />

        <div className="page tr-hero-grid">
          <div className="tr-hero-text">
            <p className="tr-eyebrow">SoDEX × ValueMint</p>
            <h1 className="tr-title">
              How deep
              <br />
              have you <em>traded</em>?
            </h1>
            <p className="tr-lede">
              Ten depths of the SoDEX leaderboard, free to whoever earned them. Take the one
              you&rsquo;re at and every one you passed through.
            </p>

            <div className="tr-check">
              {!isConnected ? (
                <div className="tr-actions">
                  <button
                    className="btn btn-primary btn-lg"
                    disabled={connecting}
                    onClick={() => {
                      const injected = connectors.find((c) => c.id === "injected");
                      if (injected !== undefined) connect({ connector: injected });
                    }}
                  >
                    {connecting ? "Check your wallet…" : "Find your depth"}
                  </button>
                  <a className="btn btn-lg tr-btn-ghost" href="#ladder">
                    See the ten
                  </a>
                </div>
              ) : (
                <Result state={state} />
              )}
            </div>
          </div>

          <Descent reached={reached} />
        </div>
      </section>

      <section className="section" id="ladder">
        <div className="page head">
          <div>
            <p className="eyebrow">The ladder</p>
            <h2>Ten depths</h2>
          </div>
          <span className="dim">Volume, not rank — so a piece never stops being true</span>
        </div>

        {/* Full bleed, running off both edges: the set should feel like it
            continues past the screen rather than being a tidy grid of ten. */}
        <div className="tr-rail">
          {TIERS.map((t) => (
            <TierCard key={t.n} tier={t} unlocked={reached >= t.n} isCurrent={reached === t.n} />
          ))}
        </div>

        <p className="page tr-note">
          One claim per depth, per wallet. Volume rather than rank on purpose: rank moves as other
          people trade, so a piece minted against a rank would slowly stop being true of whoever
          holds it. Volume only goes up.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function TierCard({ tier, unlocked, isCurrent }: { tier: Tier; unlocked: boolean; isCurrent: boolean }) {
  return (
    <article
      className={`tr-tile${unlocked ? " is-unlocked" : ""}${isCurrent ? " is-current" : ""}`}
      style={{ ["--tier" as string]: tier.colour }}
    >
      <div className="tr-tile-art">
        <Art src={tierImage(tier)} alt={tier.name} sizes="(max-width: 700px) 50vw, 260px" />
        <span className="tr-tile-n">{String(tier.n).padStart(2, "0")}</span>
        {isCurrent ? <span className="tr-tile-flag">You&rsquo;re here</span> : null}
      </div>
      <div className="tr-tile-body">
        <h3>{tier.name}</h3>
        <p>{tier.blurb}</p>
      </div>
      {/* One bar, two facts: what it costs on the left, what it is on the
          right — the shape the reference uses for price and collection. */}
      <div className="tr-tile-foot">
        <span className="mono">{tier.min === 0 ? "Any trade" : formatVolume(tier.min)}</span>
        <span className="tr-tile-state">{unlocked ? "Earned" : "Locked"}</span>
      </div>
    </article>
  );
}

function Result({ state }: { state: State }) {
  if (state.kind === "checking") {
    return (
      <div className="tr-result">
        <div className="skeleton tr-result-skeleton" />
        <span className="tr-result-sub">Reading your SoDEX volume…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="tr-result">
        <p className="tr-result-error">{state.message}</p>
      </div>
    );
  }

  if (state.kind !== "done") return null;
  const { data } = state;

  if (!data.found || data.tier === null) {
    return (
      <div className="tr-result">
        <p className="tr-result-none">
          No SoDEX trading found for this wallet. One trade is all it takes to reach{" "}
          <b>Ripple</b> — start on{" "}
          <a href="https://sodex.com" target="_blank" rel="noreferrer noopener">
            SoDEX
          </a>{" "}
          and come back.
        </p>
      </div>
    );
  }

  const tier = TIERS.find((t) => t.n === data.tier!.n)!;
  const claimable = data.tier.n;

  return (
    <div className="tr-result is-found" style={{ ["--tier" as string]: tier.colour }}>
      <div className="tr-result-head">
        <span className="tr-result-art">
          <Art src={tierImage(tier)} alt={tier.name} sizes="80px" />
        </span>
        <div>
          <span className="tr-result-label">You&rsquo;ve reached</span>
          <b className="tr-result-name">{tier.name}</b>
          <span className="tr-result-sub">{tier.blurb}</span>
        </div>
      </div>

      <dl className="tr-result-figs">
        <div>
          <dt>All-time volume</dt>
          <dd className="mono">{formatVolume(data.volumeUsd)}</dd>
        </div>
        {data.rank !== null ? (
          <div>
            <dt>Leaderboard</dt>
            <dd className="mono">#{data.rank}</dd>
          </div>
        ) : null}
        <div>
          <dt>Yours to claim</dt>
          <dd className="mono">
            {claimable} of {TIERS.length}
          </dd>
        </div>
      </dl>

      {data.next !== null ? (
        <p className="tr-result-next">
          <b className="mono">{formatVolume(data.next.needed)}</b> more volume unlocks{" "}
          <b>{data.next.name}</b>.
        </p>
      ) : (
        <p className="tr-result-next">Nothing above you. You&rsquo;ve reached the bottom.</p>
      )}

      <button className="btn btn-primary btn-lg btn-block" disabled>
        Claim {claimable} {claimable === 1 ? "piece" : "pieces"} — opens at launch
      </button>
      <p className="tr-result-fine">
        Each depth can be claimed once per wallet. Claiming costs gas only, a fraction of a cent.
      </p>
    </div>
  );
}

/**
 * The descent: ten pieces receding into the dark.
 *
 * Replaced three coloured placeholder cards. Now that the artwork exists it can
 * carry the page, and showing all ten at once is what makes the ladder legible
 * before a visitor has connected anything.
 */
function Descent({ reached }: { reached: number }) {
  return (
    <div className="tr-stack" aria-hidden="true">
      <div className="tr-stack-inner">
        {TIERS.map((t, i) => (
          <div
            key={t.n}
            className={`tr-plate${reached >= t.n ? " is-lit" : ""}`}
            style={{ ["--i" as string]: i, ["--tier" as string]: t.colour }}
          >
            <Art src={tierImage(t)} sizes="(max-width: 900px) 30vw, 240px" />
            <span className="tr-plate-n">{String(t.n).padStart(2, "0")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
