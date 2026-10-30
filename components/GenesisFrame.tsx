import type { ReactNode } from "react";
import "./GenesisFrame.css";

const GENESIS = "0x5fadc59297e86acea20bff519aea0f9651cdc90b";

/** Whether this collection's pieces are drawn in the Genesis frame. */
export function hasGenesisFrame(collection: string | undefined): boolean {
  return collection?.toLowerCase() === GENESIS;
}

/**
 * A Genesis piece as the collection page presents it: the artwork in a window
 * and a nameplate under it — "ValueChain Genesis" and the tier. (A V monogram
 * sat at its right until the owner had it removed, 2026-10-28.)
 *
 * Deliberately plain (owner, 2026-10-28). A metal card with a neon window
 * that tilted toward the pointer was built and pushed the same day, and the
 * owner asked for this simpler one back "without any glowing border or bottom
 * line" — so no lit ring round the window and no light bar at the foot.
 *
 * It sits INSIDE the token card's media slot rather than replacing the card,
 * so price, offers and the link keep working. It follows the theme, and the
 * tier colour is only on the word "Genesis". Sizes are in
 * container units of the slot, so it is the same picture at any width.
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
      </div>
    </div>
  );
}
