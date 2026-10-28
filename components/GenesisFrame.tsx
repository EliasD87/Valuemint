import type { ReactNode } from "react";
import "./GenesisFrame.css";

const GENESIS = "0x5fadc59297e86acea20bff519aea0f9651cdc90b";

/** Whether this collection's pieces are drawn in the Genesis frame. */
export function hasGenesisFrame(collection: string | undefined): boolean {
  return collection?.toLowerCase() === GENESIS;
}

/**
 * A Genesis piece as the collection page presents it (owner, 2026-10-28, from
 * the same Hypebeast card reference as `TrenchesFrame`): the artwork in a
 * window lit in its tier's colour, and a nameplate under it — "ValueChain
 * Genesis", the tier, and a V monogram — with a small light bar at the foot.
 *
 * It sits INSIDE the token card's media slot rather than replacing the card,
 * so price, offers and the link keep working; the card is the metal around it.
 * Like TrenchesFrame it follows the theme (white where the site is white) and
 * the tier colour is only on the accents. Sizes are in container units of the
 * slot, so it is the same picture at any width.
 *
 * Presentation only: the NFT's own image is untouched.
 */
export function GenesisFrame({
  tier,
  sealedLabel,
  children,
}: {
  /** The piece's Tier trait; undefined while sealed or still loading. */
  tier: string | undefined;
  /** For a sealed piece: what goes where the tier would, e.g. "Reveals Nov 10". */
  sealedLabel?: string;
  /** The artwork, already drawn by the card. */
  children: ReactNode;
}) {
  const key = tier?.toLowerCase();
  const tone = key === "legendary" || key === "epic" || key === "rare" ? key : sealedLabel !== undefined ? "sealed" : "common";
  return (
    <div className="gframe" data-tone={tone}>
      <div className="gframe-window">{children}</div>
      <div className="gframe-foot">
        <span className="gframe-text">
          <span className="gframe-word">
            ValueChain <span>Genesis</span>
          </span>
          <span className="gframe-tier">{tier ?? sealedLabel ?? " "}</span>
        </span>
        <svg className="gframe-mono" viewBox="0 0 40 40" aria-hidden="true">
          <path className="gframe-hex" d="M20 2.5 35.2 11.25v17.5L20 37.5 4.8 28.75v-17.5z" />
          <path className="gframe-v" d="M12.5 13h4.6L20 22.6 22.9 13h4.6L22 28h-4z" />
        </svg>
      </div>
      <span className="gframe-bar" aria-hidden="true" />
    </div>
  );
}
