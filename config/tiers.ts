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
 * Re-cut 2026-10-24: ten characters, one per depth, each already on its own
 * card in its depth's colour (the owner's artwork, pinned as it is under
 * `trenches-art-v2/`). The website shows them inside a dark metal frame
 * (components/TrenchesFrame), which is presentation only, not part of the NFT.
 * The hooded spirits before them (2026-09-25) are still pinned under `trenches/`.
 * CIDs from `KEY_PREFIX=trenches-art-v2 node metadata/scripts/pin-trenches-tiers.mjs`.
 */
export const TIERS: Tier[] = [
  { n: 1,  name: "Halo",     min: 0,           colour: "#e3bd6d", image: "QmfJ8k9Bp17MDDYQLxhhKsipmX2jkSwvBV2oqJm9qdY5fv", blurb: "Your first trade. Everyone starts in the light." },
  { n: 2,  name: "Hellion",  min: 1_000,       colour: "#e5484d", image: "QmTiQUd78YS5zRN2yKhSwKtsteAFu5mG4Ui5N4wxeQA6YM", blurb: "A thousand through the book, and a taste for it." },
  { n: 3,  name: "Lunaris",  min: 10_000,      colour: "#6f9cf0", image: "QmYnfC5ndL9BVRMTSqLMoKojKFZCqnECgrMgiba8k2AraD", blurb: "Five figures, most of them after dark." },
  { n: 4,  name: "Verdant",  min: 50_000,      colour: "#9fc24c", image: "QmaVUa4DMGdoTxiysBKkVgSHvMXqRouCU3DV2x5MEqr8x6", blurb: "Positions that put down roots." },
  { n: 5,  name: "Inferno",  min: 250_000,     colour: "#f0823a", image: "QmQRgoDBvM769BG3U9qe6PPz5w8Tw9H3bn42rUghF4U9Uv", blurb: "A quarter of a million, through the fire." },
  { n: 6,  name: "Eclipse",  min: 1_000_000,   colour: "#ad7cf0", image: "QmNfQmgfiurP41NXXpPvBtjMrEeog12F8TKpcUzHZn3uXM", blurb: "Seven figures through your hands." },
  { n: 7,  name: "Warlord",  min: 5_000_000,   colour: "#dca13c", image: "Qmdz2gfGy8eS2MkXMHigEoK8mgTXB6E7g76nsi3Xp533Ls", blurb: "Size that moves other people's prices." },
  { n: 8,  name: "Sakura",   min: 15_000_000,  colour: "#ef8aa6", image: "QmZhtQukhPBpLm4zqXFBLGRadXxpZLa6fJFHWez43hT8DQ", blurb: "It blooms for very few wallets." },
  { n: 9,  name: "Riptide",  min: 50_000_000,  colour: "#3fc6bd", image: "QmbbLEu2oYFesVixrToo8MbwQ7uTq9bwNBxfJRufQdo3ee", blurb: "You do not follow the flow. It follows you." },
  { n: 10, name: "Monolith", min: 150_000_000, colour: "#c89b63", image: "QmXSgow9eC9YnZc8KvEoghjvEQQux1VoCCYrtKvEuF7N4S", blurb: "The rock the trenches are cut from." },
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
