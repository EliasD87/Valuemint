"use client";

import "@/styles/walletmark.css";

/**
 * A wallet's face: a coloured disc generated from its own address.
 *
 * Addresses are the only identity this chain has, and `0x06bd…22D6` beside
 * `0x0698…F4a0` is two pieces of punctuation. A mark makes them different at a
 * glance, which is the whole job — it is recognition, not information, and
 * nothing here should ever be read as a claim about who anybody is.
 *
 * Generated, never fetched. Deterministic from the address, so the same wallet
 * wears the same face on every page and in every session, and the page stays
 * at zero requests.
 *
 *
 * ON COLOUR
 * ---------
 * This is the second deliberate exception to "only tokens carry colour", and
 * for the reason `--rainbow` is the first: the hue *is* the data. A mark tinted
 * from the palette would make every wallet look like every other wallet, which
 * is the one thing it must not do.
 *
 * Every disc is pinned to the same *relative luminance* and only its hue
 * varies. That is not fussiness — the first version picked two hues and gave
 * each a fixed HSL lightness, and HSL lightness is not luminance: a yellow at
 * 48% is four times as bright as a blue at the same number. Measured across
 * all 360 hues, that version produced pattern-on-disc contrast as low as
 * **1.0:1** — a disc whose pattern was simply invisible, for whichever wallets
 * happened to land there.
 *
 * Solving for luminance instead fixes all three contrasts at once. Measured
 * across every hue at `DISC_LUMINANCE`:
 *
 *   pattern on disc          4.4:1 worst case
 *   disc on the light theme  4.8:1
 *   disc on the dark theme   3.6:1
 *
 * So the mark is legible on both grounds for every address there is, and the
 * theme never has to be consulted. The only token involved is the hairline
 * ring.
 */

/** FNV-1a. Fast, deterministic, and dependency-free — a hash, not a digest. */
function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** xorshift32. Enough randomness for five columns of squares. */
function random(seed: number): () => number {
  let state = seed === 0 ? 1 : seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/** sRGB relative luminance of an HSL colour, by the WCAG definition. */
function luminance(hue: number, saturation: number, lightness: number): number {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

/**
 * The HSL lightness that lands a hue on a given luminance.
 *
 * Eighteen halvings, which is exact to well under a percent. Luminance rises
 * monotonically with lightness at a fixed hue and saturation, so a binary
 * search is all this needs.
 */
function lightnessFor(hue: number, saturation: number, target: number): number {
  let low = 0;
  let high = 100;
  for (let i = 0; i < 18; i += 1) {
    const mid = (low + high) / 2;
    if (luminance(hue, saturation, mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

const SATURATION = 58;
/** Solved for: see the contrast figures in the note above. */
const DISC_LUMINANCE = 0.17;

export function WalletMark({ address, size = 22 }: { address: string; size?: number }) {
  const next = random(seedOf(address.toLowerCase()));

  const hue = Math.floor(next() * 360);
  /* Far enough round the wheel to read as a second colour rather than as a
     shade of the first. Only ever used at the near-white end, where hue costs
     almost no luminance and so cannot undo the contrast above. */
  const second = Math.floor((hue + 70 + next() * 140) % 360);

  const disc = `hsl(${hue} ${SATURATION}% ${lightnessFor(hue, SATURATION, DISC_LUMINANCE).toFixed(1)}%)`;
  const ink = `hsl(${second} 70% 97%)`;

  /* Mirrored down the middle, the way every identicon since the first one has
     been: a symmetric pattern reads as a face and a random one reads as dirt. */
  const cells: { x: number; y: number }[] = [];
  for (let x = 0; x < 3; x += 1) {
    for (let y = 0; y < 5; y += 1) {
      if (next() > 0.5) continue;
      cells.push({ x, y });
      if (x < 2) cells.push({ x: 4 - x, y });
    }
  }

  return (
    <span className="wmark" style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <svg viewBox="0 0 5 5" width={size} height={size}>
        <rect width="5" height="5" fill={disc} />
        {cells.map((c) => (
          <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill={ink} />
        ))}
      </svg>
    </span>
  );
}
