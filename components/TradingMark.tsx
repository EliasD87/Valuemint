"use client";

import { tradingMarkOf } from "@/config/tradingMark";
import "./TradingMark.css";

/**
 * The trading mark beside a collection's name: three candles that keep
 * ticking, like a chart that is live.
 *
 * Takes an address, as `VerifiedMark` does, so it cannot be drawn for a
 * collection `config/tradingMark.ts` does not name, and renders nothing for
 * one it does not. The tooltip is the reason, and so is the accessible name.
 *
 * The candles move only by transform, from a resting state that is already the
 * finished picture — the mark reads the same if the animation never runs.
 */
export function TradingMark({
  collection,
  size = 15,
}: {
  collection: string | undefined;
  /** Matches the text it sits beside; the SVG scales to it. */
  size?: number;
}) {
  const entry = tradingMarkOf(collection);
  if (entry === undefined) return null;

  return (
    <span className="tm" title={entry.reason} style={{ ["--tm-size" as string]: `${size}px` }}>
      <svg viewBox="0 0 24 24" role="img" aria-label={entry.reason} focusable="false">
        <circle className="tm-badge" cx="12" cy="12" r="11" />
        <g className="tm-candle tm-up tm-c1">
          <line x1="7" y1="8.5" x2="7" y2="17.5" />
          <rect x="5.6" y="10.5" width="2.8" height="5" rx="0.7" />
        </g>
        <g className="tm-candle tm-down tm-c2">
          <line x1="12" y1="5.5" x2="12" y2="15.5" />
          <rect x="10.6" y="7.5" width="2.8" height="5.5" rx="0.7" />
        </g>
        <g className="tm-candle tm-up tm-c3">
          <line x1="17" y1="4.5" x2="17" y2="14.5" />
          <rect x="15.6" y="6" width="2.8" height="6.5" rx="0.7" />
        </g>
      </svg>
    </span>
  );
}
