"use client";

import { useId } from "react";
import { TREASURE_DRAW } from "@/config/treasureDraw";
import "./DrawBadge.css";

/**
 * "Next draw": a Treasure Box that counts in SoDEX's next live draw.
 *
 * A gift box, the words, and an (i) that opens the full rule on hover, on
 * keyboard focus, or on a tap on a phone. It is a real button so a tap focuses
 * it rather than falling through to the card's link underneath — the card opens
 * the piece; this only explains itself.
 *
 * `card` sits over a token card's artwork; `chip` sits with the token page's
 * other chips.
 */
export function DrawBadge({ variant }: { variant: "card" | "chip" }) {
  const id = useId();
  const when = new Date(TREASURE_DRAW.snapshot).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });

  return (
    <span className={`draw draw-${variant}`}>
      <button
        type="button"
        className="draw-pill"
        aria-describedby={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <GiftIcon />
        <span>{variant === "chip" ? "Counts for the next draw" : "Next draw"}</span>
        <InfoIcon />
      </button>
      <span className="draw-tip" role="tooltip" id={id}>
        <b>Eligible for SoDEX&rsquo;s next Treasure Box draw</b>
        <span>
          Minted after the {when} UTC snapshot, so it enters the next live draw while it stays
          unopened.
        </span>
        <span className="draw-tip-fine">Opening the box burns it, and the entry goes with it.</span>
      </span>
    </span>
  );
}

function GiftIcon() {
  return (
    <svg className="draw-gift" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="9" width="17" height="4" rx="1" />
      <path d="M5 13v6.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V13" />
      <path d="M12 9v11.5" />
      <path d="M12 9c-1.6-3.4-5.6-4.2-5.6-1.6C6.4 9 12 9 12 9Zm0 0c1.6-3.4 5.6-4.2 5.6-1.6C17.6 9 12 9 12 9Z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="draw-info" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.2v4" />
      <circle cx="8" cy="4.9" r="0.6" className="draw-info-dot" />
    </svg>
  );
}
