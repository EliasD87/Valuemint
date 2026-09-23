import type { GuideStep } from "@/config/guide";
import "@/styles/guide.css";

/**
 * A drawing per step.
 *
 * Inline SVG rather than screenshots, and the reasoning is the same one that
 * kept a screen recording out of this guide: a picture of the interface is
 * wrong the week the interface moves, and this one changes most weeks. A
 * diagram of the *mechanism* does not — an allowance has worked the same way
 * since the day the marketplace was written, and will still be true when every
 * button on the site has been repainted.
 *
 * They also cost nothing. The whole set is a few kilobytes of markup with no
 * request behind it, which matters on a page whose entire job is to be the
 * first thing a stranger loads.
 *
 * Every colour comes from a token through a class, so these are drawn twice —
 * once in each theme — without a second file. Nothing here is decorative: each
 * drawing carries the one idea its step is about, and the text beside it says
 * the same thing in words for anyone who cannot see it, which is why they are
 * `aria-hidden`.
 */

const BOX = "0 0 320 170";

/** A line with a head, used for every "and then" in the set. */
function Arrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g className="ga-arrow">
      <line x1={x1} y1={y} x2={x2 - 5} y2={y} />
      <path d={`M${x2 - 7} ${y - 4}L${x2} ${y}L${x2 - 7} ${y + 4}Z`} />
    </g>
  );
}

/** The corner of a card, stood in for rather than drawn — it is not the point. */
function Piece({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect className="ga-panel" x={x} y={y} width={w} height={h} rx="8" />
      <rect className="ga-fill" x={x + 9} y={y + 9} width={w - 18} height={h - 30} rx="5" />
      <rect className="ga-dim-fill" x={x + 9} y={y + h - 16} width={(w - 18) * 0.6} height="6" rx="3" />
    </g>
  );
}

function Chain() {
  return (
    <svg className="ga" viewBox={BOX} aria-hidden="true" focusable="false">
      {/* The button they are looking for, drawn as it reads in the header. */}
      <rect className="ga-solid" x="108" y="10" width="104" height="28" rx="14" />
      <text className="ga-on-solid" x="160" y="28" textAnchor="middle">
        Connect wallet
      </text>

      {/* Vertical, so it is drawn here rather than through `Arrow`. */}
      <g className="ga-arrow">
        <line x1="160" y1="42" x2="160" y2="56" />
        <path d="M156 54L160 61L164 54Z" />
      </g>

      <rect className="ga-panel" x="36" y="66" width="248" height="90" rx="10" />

      {/* The row the wallet will offer to add. */}
      <rect className="ga-mark" x="48" y="78" width="224" height="32" rx="8" />
      <circle className="ga-accent-fill" cx="66" cy="94" r="4" />
      <text className="ga-ink" x="80" y="98">
        ValueChain
      </text>
      <text className="ga-dim" x="260" y="98" textAnchor="end">
        286623
      </text>

      <text className="ga-dim" x="160" y="136" textAnchor="middle">
        SOSO is the coin — and the gas
      </text>
    </svg>
  );
}

function Buy() {
  return (
    <svg className="ga" viewBox={BOX} aria-hidden="true" focusable="false">
      {/* The listing. The price belongs inside the card, where a price is. */}
      <rect className="ga-panel" x="16" y="26" width="112" height="118" rx="8" />
      <rect className="ga-fill" x="26" y="36" width="92" height="66" rx="5" />
      <text className="ga-ink" x="26" y="122">
        150 SOSO
      </text>
      <text className="ga-dim" x="26" y="136">
        listed
      </text>

      <Arrow x1={142} x2={200} y={86} />
      {/* Under the drawing, not beside the arrow. The gap between the two
          cards is 82 units and this label is about 105 — it cannot sit there
          at any height without running into the wallet. */}
      <text className="ga-dim" x="160" y="158" textAnchor="middle">
        one transaction, price as listed
      </text>

      {/* Your wallet, with the piece now in it — accented because it is the
          thing that just changed. */}
      <rect className="ga-panel" x="210" y="34" width="98" height="102" rx="10" />
      <rect className="ga-mark" x="222" y="46" width="74" height="54" rx="6" />
      <text className="ga-dim" x="259" y="122" textAnchor="middle">
        your wallet
      </text>
    </svg>
  );
}

function Offer() {
  return (
    <svg className="ga" viewBox={BOX} aria-hidden="true" focusable="false">
      {/* Your wallet. The money never leaves it, which is the whole point. */}
      <rect className="ga-panel" x="12" y="30" width="118" height="100" rx="10" />
      <circle className="ga-mark-stroke" cx="71" cy="70" r="23" />
      <text className="ga-accent" x="71" y="74" textAnchor="middle">
        WSOSO
      </text>
      <text className="ga-dim" x="71" y="114" textAnchor="middle">
        stays here
      </text>

      {/* An allowance, not a transfer — so the line is not a solid one. */}
      <text className="ga-dim" x="175" y="72" textAnchor="middle">
        allowance
      </text>
      <g className="ga-arrow ga-dashed">
        <line x1="142" y1="84" x2="201" y2="84" />
        <path d="M201 80L208 84L201 88Z" />
      </g>

      <Piece x={218} y={30} w={90} h={100} />

      {/* Under the whole drawing, not beside the arrow: at 11px this is 110px
          wide and it ran straight into the card on the right. */}
      <text className="ga-dim" x="160" y="154" textAnchor="middle">
        nothing is held by anyone else
      </text>
    </svg>
  );
}

function Sell() {
  return (
    <svg className="ga" viewBox={BOX} aria-hidden="true" focusable="false">
      <Piece x={12} y={42} w={72} h={80} />
      <text className="ga-dim" x="48" y="142" textAnchor="middle">
        yours
      </text>

      <Arrow x1={92} x2={122} y={82} />

      {/* The one-time approval: a key, because that is what it is. */}
      <circle className="ga-mark-stroke" cx="160" cy="82" r="26" />
      <circle className="ga-accent-stroke" cx="154" cy="76" r="6" />
      <path className="ga-accent-stroke" d="M158 80l10 10M164 86l-4 4M168 90l-3 3" />
      <text className="ga-dim" x="160" y="142" textAnchor="middle">
        approve once
      </text>

      <Arrow x1={196} x2={226} y={82} />

      {/* The order itself, written to the chain rather than to a server. */}
      <rect className="ga-panel" x="236" y="46" width="72" height="72" rx="8" />
      <rect className="ga-dim-fill" x="248" y="60" width="48" height="6" rx="3" />
      <rect className="ga-dim-fill" x="248" y="74" width="48" height="6" rx="3" />
      <rect className="ga-dim-fill" x="248" y="88" width="30" height="6" rx="3" />
      <text className="ga-dim" x="272" y="142" textAnchor="middle">
        on chain
      </text>
    </svg>
  );
}

const ART: Record<GuideStep["id"], () => React.ReactElement> = {
  chain: Chain,
  buy: Buy,
  offer: Offer,
  sell: Sell,
};

export function GuideArt({ id }: { id: string }) {
  const Drawing = ART[id];
  return Drawing === undefined ? null : <Drawing />;
}
