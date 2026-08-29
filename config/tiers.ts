/**
 * The Trenches — ten tiers, earned by all-time SoDEX volume.
 *
 * Thresholds are on **volume, not rank**, deliberately. Rank moves as other
 * people trade, so a wallet could claim a tier and quietly stop deserving it.
 * Volume only ever goes up, so a tier once earned stays true and the token
 * never becomes a lie about its holder.
 *
 * Shared by the eligibility API and the page so the two cannot disagree about
 * who qualifies for what. The API is authoritative — the page only ever
 * displays what the server decided — but they read the same table.
 */

export interface Tier {
  /** 1-10, low to high. Also the design number in the collection. */
  n: number;
  name: string;
  /** Minimum all-time volume in USD. Tier 1 is any trade at all. */
  min: number;
  /** The tier's accent, used for its glow, name and unlocked state. */
  colour: string;
  /** IPFS CID of this tier's artwork, stored on Filebase. */
  image: string;
  blurb: string;
}

export const TIERS: Tier[] = [
  { n: 1, name: "Ripple", min: 0, colour: "#7dd3fc", image: "Qmcm4fdXCwvnu1tjbZbbhSzHdHJMtxyfFJWa4cnzeG3Kbx", blurb: "You showed up and traded." },
  { n: 2, name: "Wake", min: 1_000, colour: "#38bdf8", image: "QmQUVQTkCcRB5GndhpEds3pu45FNK4Nfoc9AfX2zZ2qZr8", blurb: "Enough to leave a mark behind you." },
  { n: 3, name: "Swell", min: 10_000, colour: "#22d3ee", image: "QmcZrXvsX8FhSFD6y2U4JWpxq2pRZn5G475CNh8RzpvQPK", blurb: "Not a visitor any more." },
  { n: 4, name: "Current", min: 50_000, colour: "#06b6d4", image: "QmZhR1M4Tmnu42Qgz5c5EcjCBJK7JVaTjgXuRNM2LfkiDq", blurb: "Moving with real force." },
  { n: 5, name: "Tide", min: 250_000, colour: "#0891b2", image: "QmNPx8yXmGVpzw1jyMCYLRZusCuEx88XAgUgLy51Lpb9nJ", blurb: "Big enough to pull others along." },
  { n: 6, name: "Undertow", min: 1_000_000, colour: "#3b82f6", image: "QmQmgJwkrHrszpAsxr7vPfr3uXQQCz22ncxyrUodxx7t7E", blurb: "Seven figures, under the surface." },
  { n: 7, name: "Deep", min: 5_000_000, colour: "#6366f1", image: "QmUWWXAtDq1Eg63ha52XVTKCUzbvf7XFmFdQ7fHH9MCfYB", blurb: "Past where the light reaches." },
  { n: 8, name: "Trench", min: 15_000_000, colour: "#7c3aed", image: "QmRkLiobbJPHp5jy3zgUm4P9KKN8bgZazUNQnfMfeRsWkp", blurb: "Down where the pressure is." },
  { n: 9, name: "Abyss", min: 50_000_000, colour: "#a21caf", image: "QmUBTUBjyo3taHBuvETmsR1a8joBTY4N1YzVhgbm4CKTf5", blurb: "Almost nobody trades here." },
  { n: 10, name: "Leviathan", min: 150_000_000, colour: "#f59e0b", image: "QmWtumg47QsVxthRLnHRxhvrXPJo4agm88M2DgWsQ6ZeFU", blurb: "The thing the depth is famous for." },
];

/** Where this tier's artwork lives. */
export const TIER_GATEWAY = "https://ipfs.filebase.io/ipfs";
export const tierImage = (t: Tier) => `${TIER_GATEWAY}/${t.image}`;

/**
 * Every tier a volume has earned, lowest first.
 *
 * A wallet may claim each tier **once**, so a trader who has climbed to Deep
 * can collect the seven below it and come back for Trench when their volume
 * gets there. That is one claim per (wallet, tier), not one per wallet - the
 * set is meant to be completed over time, and every threshold in it was
 * genuinely passed through.
 */
export function tiersEarned(volumeUsd: number): Tier[] {
  const top = tierFor(volumeUsd);
  return top === undefined ? [] : TIERS.filter((t) => t.n <= top.n);
}

/**
 * The highest tier a volume clears.
 *
 * Returns undefined for a wallet that has never traded — which is different
 * from tier 1. Tier 1 means "traded, but little"; no tier means "no SoDEX
 * account found", and the page says so rather than implying they failed.
 */
export function tierFor(volumeUsd: number): Tier | undefined {
  if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) return undefined;
  // Walk down so the first match is the highest cleared.
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (volumeUsd >= TIERS[i]!.min) return TIERS[i];
  }
  return undefined;
}

/** The next tier up, and what it would take. Undefined at the top. */
export function nextTier(current: Tier | undefined): Tier | undefined {
  if (current === undefined) return TIERS[0];
  return TIERS.find((t) => t.n === current.n + 1);
}

/** Compact USD, e.g. "$5.71M". Volumes here span six orders of magnitude. */
export function formatVolume(usd: number): string {
  if (!Number.isFinite(usd)) return "—";
  const units: Array<[number, string]> = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];
  for (const [size, suffix] of units) {
    if (usd >= size) {
      const v = usd / size;
      // Round numbers get no decimals: the thresholds are $1K and $50M, not
      // "$1.00K" and "$50.00M", which reads like a rounding artefact.
      const digits = Number.isInteger(v) ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
      return `$${v.toFixed(digits)}${suffix}`;
    }
  }
  return `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`;
}
