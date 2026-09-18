"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Art } from "@/components/Art";
import { SodexLogo } from "@/components/SodexLogo";
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

/**
 * Claiming is not open yet, so this page answers a question instead of taking
 * an action: paste an address, see what it would be owed.
 *
 * A wallet connection is the wrong price of entry for that. Nothing here signs
 * or spends, the eligibility route already takes an address in its path, and
 * asking someone to connect before they can read a number is friction in
 * exchange for nothing. The connected wallet is still used as a default, so a
 * visitor who has one does not have to type their own address.
 */
export default function Trenches() {
  const { address } = useAccount();
  const [looked, setLooked] = useState<string | undefined>(undefined);
  const [state, setState] = useState<State>({ kind: "idle" });

  const check = useCallback(async (who: string, signal?: { cancelled: boolean }) => {
    setState({ kind: "checking" });
    try {
      const res = await fetch(`/api/eligibility/${who}`);
      const body = await res.json();
      if (signal?.cancelled === true) return;
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Could not check this wallet." });
        return;
      }
      setState({ kind: "done", data: body as Eligibility });
    } catch {
      if (signal?.cancelled !== true) {
        setState({ kind: "error", message: "Could not reach the check." });
      }
    }
  }, []);

  /**
   * The connected wallet looks itself up, once, and nothing else does.
   *
   * The box that let anyone paste an address is gone — it asked a visitor to
   * type one in to be told a number they cannot act on until claiming opens.
   * This remains because it costs nothing and it is what lights the ladder
   * below: a wallet that has earned six depths sees six of them unlocked
   * without asking for anything.
   */
  useEffect(() => {
    if (address === undefined || looked !== undefined) return;
    setLooked(address);
    const signal = { cancelled: false };
    void check(address, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [address, looked, check]);

  const reached = state.kind === "done" ? (state.data.tier?.n ?? 0) : 0;

  return (
    <div className="tr">
      <section className="tr-hero">
        <div className="tr-deep" aria-hidden="true" />
        <Arcs />
        <div className="tr-glow" aria-hidden="true" />

        <div className="page tr-hero-inner">
          <Seal />

          <p className="tr-eyebrow">
            <SodexLogo variant="full" className="tr-eyebrow-logo" title="SoDEX" />
            <span aria-hidden="true">×</span>
            <span>ValueMint</span>
          </p>
          <h1 className="tr-title">How deep have you traded?</h1>

        </div>

        <Fan reached={reached} />

        <div className="page tr-check">
          {/*
            A status and a way onward, and nothing to fill in.

            This was a wallet-address box with a "Find the depth" button, which
            asked a visitor to type an address to be told a number they cannot
            act on yet — claiming is not open. Until it is, the honest version
            of this section is the date-less fact and a link to the ladder.
          */}
          <div className="tr-claim">
            <p className="tr-soon">
              <span className="tr-soon-dot" aria-hidden="true" />
              Claiming opens soon
            </p>

            <a className="btn btn-lg tr-btn-ghost" href="#ladder">
              See the ten depths
            </a>
          </div>
        </div>
    </section>

    <section className="section" id="ladder">
      <div className="page head">
        <div>
          <p className="eyebrow">The ladder</p>
          <h2>Ten depths</h2>
        </div>
        </div>

        {/* Full bleed, running off both edges: the set should feel like it
            continues past the screen rather than being a tidy grid of ten. */}
        <div className="tr-rail">
          {TIERS.map((t) => (
            <TierCard key={t.n} tier={t} unlocked={reached >= t.n} isCurrent={reached === t.n} />
          ))}
        </div>

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

function Fan({ reached }: { reached: number }) {
  const [centre, setCentre] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setCentre((c) => (c + 1) % TIERS.length), 4200);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="tr-fan" aria-hidden="true">
      {TIERS.map((t, i) => {
        let slot = i - centre;
        if (slot > TIERS.length / 2) slot -= TIERS.length;
        if (slot < -TIERS.length / 2) slot += TIERS.length;
        const parked = Math.abs(slot) > 2;

        return (
          <div
            key={t.n}
            className={`tr-card${reached >= t.n ? " is-lit" : ""}${slot === 0 ? " is-centre" : ""}${parked ? " is-parked" : ""}`}
            style={{ ["--slot" as string]: slot, ["--abs" as string]: Math.abs(slot), ["--tier" as string]: t.colour, zIndex: 10 - Math.abs(slot) }}
          >
            <div className="tr-card-art">
              <Art src={tierImage(t)} sizes="(max-width: 900px) 60vw, 380px" />
            </div>
            <div className="tr-card-bar">
              <div>
                <b>{t.name}</b>
                <span>Depth {String(t.n).padStart(2, "0")}</span>
              </div>
              <span className="tr-card-min mono">
                {t.min === 0 ? "Any trade" : formatVolume(t.min)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The rim-lettered seal, as in the reference's rotating badge. */
function Seal() {
  return (
    <div className="tr-seal" aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <defs>
          <path id="tr-seal-arc" d="M60,60 m-42,0 a42,42 0 1,1 84,0 a42,42 0 1,1 -84,0" />
        </defs>
        <text>
          <textPath href="#tr-seal-arc">
            {"SODEX · THE TRENCHES · VALUEMINT · TEN DEPTHS · "}
          </textPath>
        </text>
      </svg>
    </div>
  );
}

/** Thin arcs sweeping the ground, as in the reference's line texture. */
function Arcs() {
  return (
    <div className="tr-arcs" aria-hidden="true">
      <svg viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 16 }, (_, i) => (
          <ellipse
            key={i}
            cx="700"
            cy={880 + i * 6}
            rx={520 + i * 56}
            ry={300 + i * 30}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.05 - i * 0.0022}
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  );
}
