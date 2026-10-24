import type { ReactNode } from "react";
import type { Tier } from "@/config/tiers";
import "./TrenchesFrame.css";

/**
 * A Trenches depth as the website presents it (owner, 2026-10-24, after a
 * Hypebeast card reference): the whole card is a dark metal frame, its window
 * lit in the depth's colour with the artwork inside, the depth's name over
 * the art, and "The Trenches", a line of facts and the depth number along the
 * foot. It replaces the site's usual token card on /trenches rather than
 * sitting inside one.
 *
 * Presentation only. The NFT itself is the owner's full card artwork
 * (config/tiers.ts). Here the frame IS the card, so the window holds the same
 * character cut out on transparency (public/trenches/art/NN.webp, the owner's
 * transparent versions) over a backdrop in the depth's colour, rather than a
 * card inside a card. Every size is in container units, so the card is the
 * same picture at any width.
 */
export function TrenchesFrame({
  tier,
  status,
  meta,
  lock,
}: {
  tier: Tier;
  /** In the strip along the bottom: the wallet's status for this depth. */
  status?: ReactNode;
  /** Under "The Trenches": the volume mark, how many are claimed. */
  meta?: ReactNode;
  /** Not reached yet: the art dims and this goal shows over it, e.g. "Reach $15M". */
  lock?: string;
}) {
  const two = String(tier.n).padStart(2, "0");
  return (
    <div className={`tframe${lock !== undefined ? " is-locked" : ""}`} style={{ ["--c" as string]: tier.colour }}>
      <div className="tframe-window">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="tframe-art" src={`/trenches/art/${two}.webp`} alt={tier.name} loading="lazy" decoding="async" />
        {lock !== undefined ? (
          <span className="tframe-lock">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span>{lock}</span>
          </span>
        ) : null}
        <span className="tframe-name">{tier.name}</span>
      </div>
      <div className="tframe-foot">
        <span className="tframe-text">
          <span className="tframe-word">
            The <span>Trenches</span>
          </span>
          {meta !== undefined ? <span className="tframe-meta">{meta}</span> : null}
        </span>
        <b className="tframe-mono">{two}</b>
      </div>
      {status !== undefined ? <span className="tframe-status">{status}</span> : null}
    </div>
  );
}
