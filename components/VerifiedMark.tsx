"use client";

import { verifiedReason } from "@/config/verified";
import "./VerifiedMark.css";

/**
 * The tick beside a collection's name.
 *
 * ---
 *
 * **It takes an address, not a boolean, and that is the whole design.**
 *
 * A `verified` prop would let any call site draw this mark for any reason —
 * because a collection is featured, because it is ours, because somebody
 * passed `true` by mistake — and the meaning would drift one call site at a
 * time until the tick meant nothing. Taking an address means there is exactly
 * one answer for a given collection and exactly one place it is decided:
 * `config/verified.ts`.
 *
 * It renders NOTHING for an unmarked collection. There is no grey tick, no
 * outline, no "unverified" state anywhere in this app, because the absence of
 * a mark means "not checked" and a negative mark would read as "checked and
 * found to be fake" — a far stronger claim than anything here has grounds for.
 *
 * ---
 *
 * **The reason is carried to the screen.** The tooltip says why, so the mark
 * is an assertion somebody can evaluate rather than a badge that appeared. It
 * is also the accessible name: a screen reader is told the collection is
 * verified and why, not that there is a decorative image here.
 */
export function VerifiedMark({
  collection,
  size = 15,
}: {
  collection: string | undefined;
  /** Matches the text it sits beside; the SVG scales to it. */
  size?: number;
}) {
  const reason = verifiedReason(collection);
  if (reason === undefined) return null;

  const label = `Verified collection — ${reason}`;

  return (
    <span className="vm" title={label} style={{ ["--vm-size" as string]: `${size}px` }}>
      <svg viewBox="0 0 24 24" role="img" aria-label={label} focusable="false">
        {/*
          A rosette rather than a plain circle, so the mark is recognisable at
          15px without relying on colour alone — which is the size it renders
          at beside a collection name, and the size at which a tick in a circle
          and a tick in a square are indistinguishable.
        */}
        <path
          className="vm-badge"
          d="M12 1.6l2.4 1.85 3-.28 1.16 2.79 2.75 1.25-.63 2.96L22.6 12l-1.92 2.33.63 2.96-2.75 1.25-1.16 2.79-3-.28L12 22.4l-2.4-1.85-3 .28-1.16-2.79-2.75-1.25.63-2.96L1.4 12l1.92-2.33-.63-2.96 2.75-1.25L6.6 2.67l3 .28z"
        />
        <path
          className="vm-tick"
          d="M7.6 12.2l3 3 5.8-6"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
