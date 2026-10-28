"use client";

import { ogOf } from "@/config/og";
import "./OgRibbon.css";

/**
 * The OG sash across the top-left corner of a collection's cover.
 *
 * Takes an address, as `VerifiedMark` and `TradingMark` do, and renders
 * nothing for a collection `config/og.ts` does not name.
 *
 * On the artwork rather than beside the name: a tag in the title row pushed a
 * long name into an ellipsis on phones, and the corner is free in every
 * layout — the strip's first cell on desktop, the thumbnail on phones.
 *
 * The sheen is the only thing that moves, and it starts and ends off the band,
 * so the sash reads the same if the animation never runs.
 */
export function OgRibbon({ collection }: { collection: string | undefined }) {
  const entry = ogOf(collection);
  if (entry === undefined) return null;

  return (
    <span className="og-ribbon" title={entry.reason}>
      <span className="og-ribbon-band" role="img" aria-label={entry.reason}>
        OG
      </span>
    </span>
  );
}
