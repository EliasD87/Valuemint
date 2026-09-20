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
   * The tier's accent, used for its glow, name and unlocked state.
   *
   * Sampled from each tier's own artwork, so the card is the colour of the
   * picture on it rather than a colour assigned to its rank.
   *
   * Not the most COMMON colour — that is the sepia wash all ten share, and
   * picking it gave ten browns within a few percent of each other. Each hue is
   * scored by how far it exceeds the baseline the whole set has in common, so
   * what surfaces is what makes a piece different: Architect's teal, Oracle's
   * violet, Leviathan's cosmic blue. Saturation and lightness are then clamped
   * to a usable band, because a colour lifted straight out of a wash is often
   * too dark or too weak to carry a border.
   *
   * The honest consequence: seven of the ten really are warm, because the art
   * really is ink and wash. That is faithful to the pictures and it does mean
   * the ladder reads less as a progression than a designed ramp would. If the
   * progression matters more than the likeness, this column is the only thing
   * to change.
   *
   * All ten are checked against the card's own ground (#17171c) at 4.42:1 to
   * 8.46:1. The Trenches page is dark in both themes, so they are never asked
   * to hold up on white.
   */
  colour: string;
  /** IPFS CID of this tier's artwork, stored on Filebase. */
  image: string;
  blurb: string;
}

export const TIERS: Tier[] = [
  { n: 1,  name: "Scout",     min: 0,           colour: "#c08859", image: "Qmduq6Jncodso95dfBu85GySMYrLNt1TVQhjGsawUTupRa", blurb: "You showed up and traded." },
  { n: 2,  name: "Trader",    min: 1_000,       colour: "#c89f6e", image: "QmZ7KknaVYGsDv4X59JEWj8h8ELwvHchCutiog35oqD1xF", blurb: "Enough volume to be doing this on purpose." },
  { n: 3,  name: "Operator",  min: 10_000,      colour: "#cf844a", image: "QmYWKeeNfDRnAkRjmc6WXBAegrPqvmDnTpFd4Vrtvc7jQF", blurb: "You know the routes and you run them." },
  { n: 4,  name: "Architect", min: 50_000,      colour: "#59b5c0", image: "QmP8f2gWdK893BLUgt5G4rAYUMcNNPxPLBcoQT28EYUckx", blurb: "Building a position, not just taking one." },
  { n: 5,  name: "Oracle",    min: 250_000,     colour: "#b389d2", image: "Qmd96VjHD7JcGcfP6X6RrZk2eWiUNeYetK3AkpFyQEBmYC", blurb: "You see it before the book does." },
  { n: 6,  name: "Titan",     min: 1_000_000,   colour: "#c16658", image: "QmV4vL48iWiNtcTYVLeAGfTh3XetpWXHD9ANKjcY9MZiAs", blurb: "Seven figures through your hands." },
  { n: 7,  name: "Magnate",   min: 5_000_000,   colour: "#c89857", image: "QmUZXQ4sSjJjGbFHA7McUvCxGnh1FMUqGRQwR93ujY1mCf", blurb: "Size that moves other people's prices." },
  { n: 8,  name: "Overlord",  min: 15_000_000,  colour: "#c36255", image: "QmZKA6qZZWh1Ak3Kx2DZHUCpeCj3kTsyYfohLThiV5rLi5", blurb: "The market makes room for you." },
  { n: 9,  name: "Sovereign", min: 50_000_000,  colour: "#cfad80", image: "QmaEcsV4dSA3j3eaY2QEKiaZFqtcDLm3XgtakmrCWGMLs6", blurb: "You do not follow the flow. It follows you." },
  { n: 10, name: "Leviathan", min: 150_000_000, colour: "#5982c0", image: "QmfTus5xh3ZnNvFjsCv5TFpQofPgf57cc7NGjVCzonQgAg", blurb: "The thing the depth is famous for." },
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
