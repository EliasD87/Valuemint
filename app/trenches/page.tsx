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
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export default function Trenches() {
  const { address } = useAccount();
  const [query, setQuery] = useState("");
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
   * A connected wallet is a convenience, not a requirement.
   *
   * It pre-fills the box and looks itself up once. After that the box is the
   * only input that matters, so someone can check a friend's address without
   * disconnecting.
   */
  useEffect(() => {
    if (address === undefined || looked !== undefined) return;
    setQuery(address);
    setLooked(address);
    const signal = { cancelled: false };
    void check(address, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [address, looked, check]);

  const valid = ADDRESS.test(query.trim());
  const lookUp = () => {
    if (!valid) return;
    const who = query.trim();
    setLooked(who);
    void check(who);
  };

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

          <div className="tr-hero-side">
            <p className="tr-lede">
              Ten depths of the SoDEX leaderboard, free to whoever earned them. Take the one
              you&rsquo;re at and every one you passed through — then come back when you go deeper.
            </p>
          </div>
        </div>

        <Fan reached={reached} />

        <div className="page tr-check">
          <div className="tr-lookup">
            <p className="tr-soon">
              <span className="tr-soon-dot" aria-hidden="true" />
              Claiming opens soon — check what you&rsquo;ll be owed
            </p>

            <div className="tr-lookup-row">
              <input
                className="tr-lookup-input mono"
                placeholder="Paste a wallet address"
                aria-label="Wallet address"
                spellCheck={false}
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") lookUp();
                }}
              />
              <button
                className="btn btn-primary btn-lg"
                disabled={!valid || state.kind === "checking"}
                onClick={lookUp}
              >
                {state.kind === "checking" ? "Checking…" : "Find the depth"}
              </button>
            </div>

            {query.trim() !== "" && !valid ? (
              <p className="tr-lookup-hint">
                That is not an address. A ValueChain address is 0x followed by 40 hex
                characters.
              </p>
            ) : null}

            {looked !== undefined ? (
              <Result state={state} onRetry={() => void check(looked)} />
            ) : (
              <a className="btn btn-lg tr-btn-ghost" href="#ladder">
                See the ten
              </a>
            )}
          </div>
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

function Result({ state, onRetry }: { state: State; onRetry: () => void }) {
  if (state.kind === "checking") {
    return (
      <div className="tr-result">
        <div className="skeleton tr-result-skeleton" />
        <span className="tr-result-sub">Reading your SoDEX volume…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    /**
     * A failed lookup is not the reader's fault and should not look like their
     * mistake. This used to be red text in a panel, which reads as "you have
     * done something wrong" for what is almost always a service being briefly
     * unreachable.
     *
     * So: neutral tone, say plainly that it is our side, offer the retry, and
     * point at the thing they can still do — the ten pieces are on the page
     * whether or not the check works.
     */
    return (
      <div className="tr-result tr-result-quiet">
        <div className="tr-quiet-head">
          <span className="tr-quiet-dot" aria-hidden="true" />
          <b>The volume check is unavailable</b>
        </div>
        <p className="tr-quiet-body">
          We could not reach SoDEX just now, so we can&rsquo;t tell you which depths you&rsquo;ve
          earned yet. Nothing is lost — your volume is on their side, and your tiers will be
          waiting whenever this comes back.
        </p>
        <div className="tr-quiet-actions">
          <button className="btn" onClick={onRetry}>
            Try again
          </button>
          <a className="btn tr-btn-ghost" href="#ladder">
            See the ten meanwhile
          </a>
        </div>
      </div>
    );
  }

  if (state.kind !== "done") return null;
  const { data } = state;

  if (!data.found || data.tier === null) {
    /**
     * Built with the same anatomy as the found state — marker, label, name,
     * blurb, action — so the two read as the same object in two conditions
     * rather than a result and a fallback paragraph.
     *
     * The marker is a numeral rather than Ripple's artwork on purpose: that
     * piece currently carries an XRP logo, and this is the one place it would
     * be shown at size to someone who has not earned it.
     */
    const first = TIERS.find((t) => t.n === 1)!;
    return (
      <div className="tr-result is-empty" style={{ ["--tier" as string]: first.colour }}>
        <div className="tr-result-head">
          <span className="tr-result-mark" aria-hidden="true">
            01
          </span>
          <div>
            <span className="tr-result-label">Nothing here yet</span>
            <b className="tr-result-name">{first.name}</b>
            <span className="tr-result-sub">{first.blurb}</span>
          </div>
        </div>

        <p className="tr-result-next">
          We found no SoDEX trading for this wallet. <b>One trade</b> is all the first depth
          asks — come back afterwards and it will be here.
        </p>

        <a
          className="btn btn-primary btn-lg btn-block"
          href="https://sodex.com"
          target="_blank"
          rel="noreferrer noopener"
        >
          Start trading on SoDEX
        </a>
        <p className="tr-result-fine">
          Traded on another wallet? Paste that address instead — depths follow the wallet
          that earned them.
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

      {/* No claim control while claiming is shut. A button that cannot do
          anything is worse than none - it invites a click and explains nothing. */}
      <p className="tr-result-soon">
        {claimable === 1 ? "1 piece" : `${claimable} pieces`} waiting when claiming opens.
      </p>
      <p className="tr-result-fine">
        Each depth is claimed once per wallet, and costs gas only — a fraction of a cent.
        Depths follow the wallet that earned them.
      </p>
    </div>
  );
}

/**
 * The claim control lived here and is gone while claiming is shut.
 *
 * A disabled button that cannot explain itself is worse than no button - it
 * invites a click and answers nothing - and a half-wired one is worse still.
 * `hooks/useTrenchesClaim.ts` still holds the whole flow, so restoring this is
 * rendering one component again rather than rewriting the logic.
 */

/**
 * The descent: ten pieces receding into the dark.
 *
 * Replaced three coloured placeholder cards. Now that the artwork exists it can
 * carry the page, and showing all ten at once is what makes the ladder legible
 * before a visitor has connected anything.
 */
/**
 * The ten pieces, looping.
 *
 * A CSS keyframe per plate with a staggered negative delay, rather than a
 * JavaScript index that advanced every few seconds. The index version was not
 * really a loop: a plate leaving the fan was removed from the DOM and the one
 * wrapping round reappeared at the front, so every cycle had a visible pop.
 *
 * Each plate now runs the same journey — rise out of the dark at the back,
 * come to the front, drift up and away — offset in time so the fan is always
 * populated and the wrap is never seen.
 */
/**
 * Five cards fanned across the bottom, bleeding off the frame.
 *
 * All ten stay mounted and only their slot changes, so the browser transitions
 * between positions instead of elements appearing and vanishing. An earlier
 * version unmounted cards as they left the fan and remounted them at the front,
 * which read as a pop rather than a rotation.
 *
 * Slot is a signed distance from the centre, so a card is at -2, -1, 0, 1 or 2
 * and anything further is parked below the fold. That mapping is what lets the
 * set rotate in either direction without a seam at the wrap.
 */
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
