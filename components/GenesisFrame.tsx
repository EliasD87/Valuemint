import type { ReactNode } from "react";
import "./GenesisFrame.css";

const GENESIS = "0x5fadc59297e86acea20bff519aea0f9651cdc90b";

/** Whether this collection's pieces are drawn in the Genesis frame. */
export function hasGenesisFrame(collection: string | undefined): boolean {
  return collection?.toLowerCase() === GENESIS;
}

const TONES = ["common", "rare", "epic", "legendary"] as const;
type Tone = (typeof TONES)[number];

/**
 * A Genesis piece as the collection page presents it — the owner's Hypebeast
 * card reference, second pass (2026-10-28: "the cards do not look like what I
 * sent you … make it interactive and a lot better").
 *
 * The token card itself becomes the metal card (`.tcard.is-framed`, and it
 * tilts through TiltCard); this draws what sits on it: a recessed window lit
 * round its inside edge in the tier's neon, the helmet cut out and floating
 * over a spray-painted backdrop in the tier's colour, and a nameplate —
 * "ValueChain Genesis", the tier, a lit V monogram — with a light at the foot.
 *
 * Every design in a tier is the same picture since the art went on chain, so
 * the window draws the tier's own cutout and backdrop (public/art/genesis/
 * frame-1, made by metadata/genesis-redesign/frame) rather than the token's
 * image, the way TrenchesFrame draws its depth. Anything without a tier — a
 * sealed piece, a document still loading — falls back to the card's own art.
 *
 * Presentation only: the NFT's image is untouched. Motion reads TiltCard's
 * --gx/--gy; with a touch screen or reduced motion the card is simply still.
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
  /** The card's own art, drawn when there is no tier picture to use. */
  children: ReactNode;
}) {
  const key = tier?.toLowerCase();
  const tone: Tone | undefined = TONES.find((t) => t === key);
  return (
    <div className="gframe" data-tone={tone ?? (sealedLabel !== undefined ? "sealed" : "common")}>
      <div className="gframe-window">
        {tone !== undefined ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="gframe-bg" src={`/art/genesis/frame-1/bg-${tone}.webp`} alt="" aria-hidden="true" decoding="async" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="gframe-art" src={`/art/genesis/frame-1/cut-${tone}.webp`} alt={`${tier} helmet`} decoding="async" />
          </>
        ) : (
          children
        )}
        <span className="gframe-neon" aria-hidden="true" />
        <span className="gframe-glint" aria-hidden="true" />
      </div>
      <div className="gframe-plate">
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
