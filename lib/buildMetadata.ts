/**
 * Turns a set of designs into one metadata document per token.
 *
 * Ported from the generator used for the first collection, and deliberately kept
 * deterministic: the same designs and the same seed always produce the same
 * assignment. That is what lets a creator publish their seed and let holders
 * verify the rare pieces were not steered into the creator's own reserve.
 */

export interface DesignInput {
  /** File name inside the pinned image directory, e.g. `01-origin.jpg`. */
  file: string;
  name: string;
  /** How many of the supply carry this design. */
  count: number;
  tier?: string;
}

export interface BuildOptions {
  collectionName: string;
  description: string;
  designs: DesignInput[];
  imagesCid: string;
  /** Built from the images CID, so the URL a browser loads is known to work. */
  gateway: (cid: string, path: string) => string;
  seed: string;
  externalUrl?: string;
}

export interface TokenDocument {
  tokenId: number;
  design: string;
  edition: string;
  json: string;
}

/** xmur3 + mulberry32: small, well-behaved, and identical across runtimes. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^= h >>> 16) >>> 0;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which design and edition each token id carries. Index 0 is token #1. */
export interface Assignment {
  design: DesignInput;
  edition: number;
}

/**
 * The design each token gets, and nothing else.
 *
 * Split out from `buildMetadata` so a server can answer "what is token #742?"
 * without building the other 999 documents. The shuffle has to run over the
 * whole deck either way - that is what makes it deterministic - but stringifying
 * every document to serve one is pure waste.
 */
export function assignDesigns(designs: DesignInput[], seed: string): Assignment[] {
  if (designs.length === 0) throw new Error("Add at least one design.");
  for (const d of designs) {
    if (!Number.isInteger(d.count) || d.count < 1) {
      throw new Error(`"${d.name}" needs a whole edition count of 1 or more.`);
    }
  }

  // Shuffling a deck built from the counts guarantees the totals land exactly on
  // what was declared - picking per token would only approach them.
  const deck = designs.flatMap((d) => Array.from({ length: d.count }, () => d));
  const random = seededRandom(seed);

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }

  const seen = new Map<string, number>();
  return deck.map((design) => {
    const edition = (seen.get(design.name) ?? 0) + 1;
    seen.set(design.name, edition);
    return { design, edition };
  });
}

/** The metadata document for one token, given its assignment. */
export function documentFor(
  options: Omit<BuildOptions, "designs" | "seed">,
  assignment: Assignment,
  tokenId: number,
): Record<string, unknown> {
  const { design, edition } = assignment;

  const attributes: Array<{ trait_type: string; value: string | number }> = [
    { trait_type: "Design", value: design.name },
    { trait_type: "Edition", value: `${edition} of ${design.count}` },
    { trait_type: "Editions Minted", value: design.count },
  ];
  if (design.tier !== undefined && design.tier !== "") {
    attributes.splice(1, 0, { trait_type: "Tier", value: design.tier });
  }

  return {
    name: `${options.collectionName} #${tokenId} — ${design.name}`,
    description: options.description,
    // An HTTPS gateway URL so browsers render it, with the canonical URI kept
    // alongside so the CID is never only implied.
    image: options.gateway(options.imagesCid, design.file),
    image_ipfs: `ipfs://${options.imagesCid}/${design.file}`,
    ...(options.externalUrl === undefined ? {} : { external_url: options.externalUrl }),
    attributes,
  };
}

export function buildMetadata(options: BuildOptions): TokenDocument[] {
  const { designs, seed } = options;

  return assignDesigns(designs, seed).map(({ design, edition }, index) => {
    const tokenId = index + 1;

    const doc = documentFor(options, { design, edition }, tokenId);

    return {
      tokenId,
      design: design.name,
      edition: `${edition} of ${design.count}`,
      json: `${JSON.stringify(doc, null, 2)}\n`,
    };
  });
}

/** Total tokens the given designs describe. */
export function supplyOf(designs: DesignInput[]): number {
  return designs.reduce((sum, d) => sum + (Number.isFinite(d.count) ? d.count : 0), 0);
}
