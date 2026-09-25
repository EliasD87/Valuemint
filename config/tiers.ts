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
  /**
   * The tier's accent, used for its glow, rule and progress fill.
   *
   * Sampled from each tier's own artwork: every piece in the 2026-09-25 re-cut
   * is one hooded figure in one element on a white ground, so the dominant
   * saturated hue IS the piece - Hellion's red, Riptide's teal, Eclipse's
   * violet. Saturation and lightness were then lifted into a band that reads
   * on the page's dark surfaces: 4.8:1 (Hellion) to 10.6:1 (Halo) against
   * #111114.
   *
   * On the paper most of these are under 3:1, so the page never lets one
   * stand alone: `styles/trenches.css` draws every swatch and meter segment
   * inside an ink outline, and always next to the tier's name. Text is never
   * set in a tier colour in either theme.
   */
  colour: string;
  /** IPFS CID of this tier's artwork, stored on Filebase. */
  image: string;
  blurb: string;
}

/**
 * Re-cut 2026-09-25: ten hooded spirits, one per element, supplied as
 * 1.png..10.png with the file number as the tier - the owner's call, and #10
 * (the stone and crystal piece) is the best of them. Names follow the art.
 * CIDs from `metadata/scripts/pin-trenches-tiers.mjs`.
 */
export const TIERS: Tier[] = [
  { n: 1,  name: "Halo",     min: 0,           colour: "#e3bd6d", image: "Qmbig99tsfT5WMHzuxDBQFyNtWAJLxHRNmTLQdwAiKiC5B", blurb: "Your first trade. Everyone starts in the light." },
  { n: 2,  name: "Hellion",  min: 1_000,       colour: "#e5484d", image: "QmSBBnkA8BevukNwsMgZDUutm2veo2SpWz2QUZbbXrrfRN", blurb: "A thousand through the book, and a taste for it." },
  { n: 3,  name: "Lunaris",  min: 10_000,      colour: "#6f9cf0", image: "QmbEttxMchgavsjEg8HEtBgRyifrtCQseVkMcbkEHyKQh2", blurb: "Five figures, most of them after dark." },
  { n: 4,  name: "Verdant",  min: 50_000,      colour: "#9fc24c", image: "QmQ56C28wBWRiZvUeN3MJPn8bFZXSHNWvnex3pkWiGGWCa", blurb: "Positions that put down roots." },
  { n: 5,  name: "Inferno",  min: 250_000,     colour: "#f0823a", image: "QmecFkpcLVtEVTSAJjjG5GD9Bc5Xch3RvCMmnzBQsQ7kCt", blurb: "A quarter of a million, through the fire." },
  { n: 6,  name: "Eclipse",  min: 1_000_000,   colour: "#ad7cf0", image: "QmdCnduEn74Cnwog6rL4g4xqJmLha4cQxaieacRc2JaqhJ", blurb: "Seven figures through your hands." },
  { n: 7,  name: "Warlord",  min: 5_000_000,   colour: "#dca13c", image: "QmSvdrqnyTYyjcLwrYBFoWGinVdRZKYqkUUWpeCRwDkeV8", blurb: "Size that moves other people's prices." },
  { n: 8,  name: "Sakura",   min: 15_000_000,  colour: "#ef8aa6", image: "QmdeN1L4RZsK2jHrtDwe8Yhd9HPSoU39GQAiGkRhaeXAMs", blurb: "It blooms for very few wallets." },
  { n: 9,  name: "Riptide",  min: 50_000_000,  colour: "#3fc6bd", image: "QmNgfzXc3aovhsqfALmYFh4r7xLT6aGUWDLwnnQDBQSquY", blurb: "You do not follow the flow. It follows you." },
  { n: 10, name: "Monolith", min: 150_000_000, colour: "#c89b63", image: "QmfLpznH4q97fq2KQifVQhTTAV4AZ1mCJifG1Booj7yoaW", blurb: "The rock the trenches are cut from." },
];

/** Where this tier's artwork lives. */
export const TIER_GATEWAY = "https://ipfs.filebase.io/ipfs";
export const tierImage = (t: Tier) => `${TIER_GATEWAY}/${t.image}`;

/**
 * Every tier a volume has earned, lowest first.
 *
 * A wallet may claim each tier **once**, so a trader who has climbed to
 * Warlord can collect the six below it and come back for Sakura when their
 * volume gets there. That is one claim per (wallet, tier), not one per wallet - the
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
