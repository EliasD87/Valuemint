import tradeBuddies from "@/data/trade-buddies.json";
import { assignDesigns, documentFor, type Assignment } from "@/lib/buildMetadata";
import { parseManifest, type CollectionManifest, type ManifestDesign, supplyOfManifest } from "@/lib/collectionManifest";
import { gatewayUrl } from "@/lib/pinning";
import { TIERS, TIER_GATEWAY, formatVolume } from "@/config/tiers";
import { TIER_STRIDE, TRENCHES_SLUG } from "@/config/trenches";
import { KOLS, KOLS_GATEWAY, KOLS_SLUG, kolForToken } from "@/config/kols";
import { filebaseGateway } from "@/lib/filebase";

/**
 * One token's metadata document, and the manifest cache behind it.
 *
 * Lifted out of `app/api/metadata/[collection]/[id]/route.ts` without a single
 * behavioural change, so that a second route can answer for MANY tokens in one
 * request without holding a second copy of this logic. A drifting copy of the
 * thing a contract's immutable `baseURI` points at is not a risk worth taking:
 * the per-token route and the batch route now compute from the same code, or
 * they compute nothing.
 *
 * Why the batch route exists at all, measured on the live site for a 60-card
 * collection page:
 *
 *     60 per-token requests   11,406 ms cold,  756 ms warm,  32,716 B
 *     1 batched request          713 ms cold,  ~105 ms warm,  1,640 B gzipped
 *
 * The cold column is the one that matters, and the reason for it is structural:
 * sixty requests are up to sixty serverless invocations, and every cold one
 * fetches the manifest from IPFS before it can answer anything. One request is
 * one invocation and one manifest read — and the manifest was always the whole
 * collection anyway. Orange Companions' is 1,306 bytes and describes all 90 of
 * its tokens.
 *
 * Everything here runs on the server. `gatewayUrl` reads `PINATA_GATEWAY`,
 * which is deliberately not public, so this cannot move into the browser —
 * that is what settled batch-endpoint versus compute-in-the-client.
 */

/** Collections whose assignment was shipped with the app, pre-manifest. */
interface BakedIn {
  name: string;
  description: string;
  externalUrl: string;
  imagesCid: string;
  gateway: string;
  designs: Array<{ name: string; number: number; slug: string; count: number }>;
  tokens: number[];
  editions: number[];
}

const BAKED_IN: Record<string, BakedIn> = {
  "trade-buddies": tradeBuddies as BakedIn,
};

/**
 * How many serials of each Trenches depth a trait set covers. Serials run
 * without end, so a set needs a bound; at 97 claimed across all ten depths
 * (2026-09-25) this is ample for an offer that lives 90 days at most. A piece
 * claimed past it is simply not covered by an older offer — never wrongly
 * covered.
 */
export const TRENCHES_SERIALS_PER_DEPTH = 5_000;

/**
 * Every token id this module can compose a document for, per collection — the
 * universe `lib/traitSets.ts` builds trait offers over.
 *
 * Kept beside `tokenDocument` so the two cannot disagree about what exists.
 * Includes ids not minted yet wherever their traits are already fixed (a
 * manifest assigns every id up to its supply), so a trait offer covers pieces
 * minted after it was made. `undefined` for anything this module does not
 * serve.
 */
export async function tokenIdsOf(collection: string): Promise<number[] | undefined> {
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

  if (collection === KOLS_SLUG) return KOLS.map((k) => k.n);
  if (collection === TRENCHES_SLUG) {
    return TIERS.flatMap((t) => range(1, TRENCHES_SERIALS_PER_DEPTH).map((s) => t.n * TIER_STRIDE + s));
  }
  const baked = BAKED_IN[collection];
  if (baked !== undefined) return range(1, baked.tokens.length);
  if (CID.test(collection)) {
    const entry = await loadManifest(collection);
    return entry === undefined ? undefined : range(1, supplyOfManifest(entry.manifest));
  }
  return undefined;
}

/**
 * Collections this answers without fetching anything.
 *
 * All three are compiled into the bundle - `trade-buddies` from a JSON file,
 * KOLs and The Trenches from `config/`. They cost a map lookup and some
 * arithmetic, never a gateway round trip, so the rate limit that exists to stop
 * this being an amplification vector does not apply to them.
 *
 * Keep this in step with the branches below. Anything that returns before
 * `loadManifest` belongs here.
 */
export function servedFromMemory(collection: string): boolean {
  return (
    BAKED_IN[collection] !== undefined ||
    collection === KOLS_SLUG ||
    collection === TRENCHES_SLUG
  );
}

/**
 * Manifests already fetched, keyed by CID.
 *
 * Content-addressed data can never change under a given CID, so this is cached
 * for the life of the process with no invalidation to get wrong. The assignment
 * is cached alongside it because shuffling the deck is the expensive part and
 * it is identical for every token in the collection.
 */
const cache = new Map<string, { manifest: CollectionManifest; assignments: Assignment[] }>();

/**
 * A ceiling on that cache.
 *
 * "Cached for the life of the process with no invalidation" was true and also
 * unbounded: every distinct CID ever requested stayed resident. Manifests are
 * about a kilobyte, so this is not a fast leak, but nothing stopped a caller
 * pinning manifests and walking the map upward.
 *
 * Insertion-ordered eviction. A Map iterates in insertion order, so the oldest
 * entry is `keys().next()`. Not an LRU - a hit does not promote - which is the
 * right trade here: the working set is the handful of collections actually
 * being browsed, and an LRU's bookkeeping buys nothing at this size.
 */
const MAX_CACHED_MANIFESTS = 200;

/**
 * The cache is bounded by what it *holds*, not by how many things it holds.
 *
 * It used to evict on entry count alone, and the comment justifying 200
 * reasoned about manifest size — "manifests are about a kilobyte". But a
 * manifest is not what is retained: `assignDesigns` expands it into one object
 * per token, so a single entry's cost scales with declared supply, not with the
 * document. 200 entries of 100,000 tokens is twenty million objects.
 *
 * Both limits now apply, whichever binds first. A few large collections evict
 * each other; many small ones coexist, which is the case this cache exists for.
 */
const MAX_CACHED_ASSIGNMENTS = 200_000;

let cachedAssignments = 0;

function remember(cid: string, entry: { manifest: CollectionManifest; assignments: Assignment[] }) {
  const evictOldest = () => {
    const oldest = cache.keys().next();
    if (oldest.done) return false;
    cachedAssignments -= cache.get(oldest.value)?.assignments.length ?? 0;
    cache.delete(oldest.value);
    return true;
  };

  while (
    (cache.size >= MAX_CACHED_MANIFESTS ||
      cachedAssignments + entry.assignments.length > MAX_CACHED_ASSIGNMENTS) &&
    cache.size > 0
  ) {
    if (!evictOldest()) break;
  }

  /**
   * One collection larger than the whole budget is served but not kept —
   * caching it would evict everything else on every request for it.
   */
  if (entry.assignments.length > MAX_CACHED_ASSIGNMENTS) return;

  cache.set(cid, entry);
  cachedAssignments += entry.assignments.length;
}

/** CIDv1 base32 (`bafy…`) or CIDv0 base58 (`Qm…`). */
export const CID = /^(ba[a-z2-7]{57,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;

/** Whether a request for this collection will have to leave the process. */
export function willFetch(collection: string): boolean {
  return !servedFromMemory(collection) && !cache.has(collection);
}

/** A manifest is about a kilobyte; anything far larger is not one. */
const MAX_MANIFEST_BYTES = 256 * 1024;

/**
 * Gateways a manifest might be reachable through, in order.
 *
 * A dedicated Pinata gateway only serves content pinned to *that* Pinata
 * account, so it returns 404 for anything stored on Filebase — and vice versa.
 * Collections created before the storage switch live on one, new ones on the
 * other, and both must keep resolving forever because a contract's `baseURI`
 * is immutable.
 *
 * This is a fixed list compiled into the app, never anything the caller
 * supplies, so it cannot be steered at an arbitrary host.
 */
const MANIFEST_GATEWAYS: Array<(cid: string) => string> = [
  (cid) => gatewayUrl(cid),
  filebaseGateway,
  (cid) => `https://ipfs.io/ipfs/${cid}`,
];


/**
 * Where a CID is fetched from for this manifest.
 *
 * Shared by the revealed and unrevealed paths deliberately: they resolve the
 * same CIDs from the same place, and two copies of this would eventually
 * disagree about the trailing slash.
 */
function toGateway(manifest: CollectionManifest, cid: string, path: string): string {
  if (manifest.gateway === undefined) return gatewayUrl(cid, path);
  const base = manifest.gateway.replace(/\/+$/, "");
  return `${base}/${cid}${path === "" ? "" : `/${path}`}`;
}

/**
 * What each token carries: the explicit list when the manifest has one, the
 * seeded shuffle otherwise.
 *
 * v3 manifests may name the assignment outright instead of deriving it, so a
 * collection can be minted before its rarity is public — see
 * `CollectionManifest.assignment`. Editions are numbered exactly as the shuffle
 * numbers them, by counting occurrences in order, so a token's "3 of 15" means
 * the same thing whichever way it was assigned.
 */
function assignmentsFor(manifest: CollectionManifest): Assignment[] {
  if (manifest.assignment === undefined) {
    return assignDesigns(manifest.designs, manifest.seed);
  }

  const seen = new Map<string, number>();
  return manifest.assignment.map((index) => {
    const design = manifest.designs[index]!;
    const edition = (seen.get(design.name) ?? 0) + 1;
    seen.set(design.name, edition);
    return { design, edition };
  });
}

export async function loadManifest(cid: string) {
  const hit = cache.get(cid);
  if (hit !== undefined) return hit;

  let text: string | undefined;
  for (const toUrl of MANIFEST_GATEWAYS) {
    try {
      const res = await fetch(toUrl(cid), { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) continue;

      const length = Number(res.headers.get("content-length") ?? "0");
      if (Number.isFinite(length) && length > MAX_MANIFEST_BYTES) return undefined;

      text = (await res.text()).slice(0, MAX_MANIFEST_BYTES);
      break;
    } catch {
      // Try the next gateway rather than failing the whole request on one
      // slow or unreachable host.
    }
  }
  if (text === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }

  const manifest = parseManifest(parsed);
  if (manifest === undefined) return undefined;

  const entry = { manifest, assignments: assignmentsFor(manifest) };
  remember(cid, entry);
  return entry;
}

/** What a caller gets back: a document, or the status and message to answer with. */
export type DocumentResult =
  | { ok: true; document: unknown }
  | { ok: false; status: number; error: string };

const NO_SUCH_TOKEN = {
  ok: false as const,
  status: 404,
  error: "No such token in this collection.",
};

/**
 * The document for one token, from whichever branch describes its collection.
 *
 * Deliberately takes an already-validated numeric id: both callers check the
 * id's shape before getting here, because "01", "1.0" and "1e3" would index an
 * assignment in surprising ways.
 */
export async function tokenDocument(
  collection: string,
  tokenId: number,
): Promise<DocumentResult> {
  // --- the KOL portraits -------------------------------------------------
  /**
   * A growing set, so the roster lives in the app rather than a pinned
   * manifest — see `config/kols.ts`. Token id is the entry's position, and a
   * token minted beyond the current roster resolves to nothing until its entry
   * is added, which is the honest answer rather than a placeholder.
   */
  if (collection === KOLS_SLUG) {
    const kol = kolForToken(tokenId);
    if (kol === undefined) return NO_SUCH_TOKEN;

    return {
      ok: true,
      document: {
        name: kol.name,
        description:
          `${kol.name} — one of one, made for the people who show up on SoDEX. ` +
          `Given, never sold.`,
        image: `${KOLS_GATEWAY}/${kol.image}`,
        image_ipfs: `ipfs://${kol.image}`,
        external_url: "https://www.valuemint.store/kols",
        attributes: [
          { trait_type: "Name", value: kol.name },
          { trait_type: "Edition", value: "1 of 1" },
          { trait_type: "Number", value: kol.n, display_type: "number" },
        ],
      },
    };
  }

  // --- the Trenches -----------------------------------------------------
  /**
   * Alone among the collections here, a Trenches token's design is not decided
   * by a shuffle — it is decided by the volume the claimant had, and recorded
   * on chain at claim time. The tier is encoded in the token id
   * (`tier * TIER_STRIDE + serial`), so it is readable without an RPC call and
   * cannot drift from what the contract minted.
   */
  if (collection === TRENCHES_SLUG) {
    const tierNumber = Math.floor(tokenId / TIER_STRIDE);
    const serial = tokenId % TIER_STRIDE;
    const tier = TIERS.find((t) => t.n === tierNumber);

    if (tier === undefined || serial < 1) return NO_SUCH_TOKEN;

    return {
      ok: true,
      document: {
        name: `${tier.name} #${serial}`,
        description:
          `${tier.blurb} Depth ${tierNumber} of ${TIERS.length} in The Trenches — earned by ` +
          `all-time SoDEX trading volume and claimed on chain, so the tier this wallet holds ` +
          `is the tier it earned.`,
        image: `${TIER_GATEWAY}/${tier.image}`,
        image_ipfs: `ipfs://${tier.image}`,
        external_url: "https://www.valuemint.store/trenches",
        attributes: [
          { trait_type: "Depth", value: tier.name },
          { trait_type: "Depth Number", value: tierNumber, display_type: "number" },
          {
            trait_type: "Volume Threshold",
            value: tier.min === 0 ? "Any trade" : formatVolume(tier.min),
          },
          { trait_type: "Serial", value: serial, display_type: "number" },
        ],
      },
    };
  }

  // --- collections shipped with the app ---------------------------------
  const baked = BAKED_IN[collection];
  if (baked !== undefined) {
    if (tokenId < 1 || tokenId > baked.tokens.length) return NO_SUCH_TOKEN;

    const design = baked.designs[baked.tokens[tokenId - 1]!]!;
    const edition = baked.editions[tokenId - 1]!;
    return {
      ok: true,
      document: {
        name: `${baked.name} #${tokenId} — ${design.name}`,
        description: baked.description,
        image: `${baked.gateway}/${baked.imagesCid}/${design.slug}.jpg`,
        image_ipfs: `ipfs://${baked.imagesCid}/${design.slug}.jpg`,
        external_url: baked.externalUrl,
        attributes: [
          { trait_type: "Design", value: design.name },
          { trait_type: "Design Number", value: design.number, display_type: "number" },
          { trait_type: "Edition", value: `${edition} of ${design.count}` },
          { trait_type: "Editions Minted", value: design.count, display_type: "number" },
        ],
      },
    };
  }

  // --- collections described by a pinned manifest ------------------------
  if (!CID.test(collection)) {
    return { ok: false, status: 404, error: "Unknown collection." };
  }

  const entry = await loadManifest(collection);
  if (entry === undefined) {
    return { ok: false, status: 404, error: "That collection manifest could not be read." };
  }

  const { manifest, assignments } = entry;

  /**
   * The supply is what `designs` declares, which is NOT always what
   * `assignments` covers.
   *
   * A v3 manifest can stop its assignment short of the supply: those tokens
   * exist and can be minted, their rarity simply is not public yet. Bounding
   * on `assignments.length` would 404 them — the collection would look like it
   * had fewer tokens than it does, and a freshly minted one would have no
   * metadata at all.
   */
  const supply = supplyOfManifest(manifest);
  if (tokenId < 1 || tokenId > supply) return NO_SUCH_TOKEN;

  if (tokenId > assignments.length) {
    const hidden = manifest.hidden;
    /** `parseManifest` refuses a short assignment without one, so this cannot happen. */
    if (hidden === undefined) return NO_SUCH_TOKEN;

    return {
      ok: true,
      document: {
        name: `${manifest.name} #${tokenId}`,
        description: manifest.description,
        image: toGateway(manifest, hidden.cid, ""),
        image_ipfs: `ipfs://${hidden.cid}`,
        ...(manifest.externalUrl === undefined ? {} : { external_url: manifest.externalUrl }),
        /**
         * No Design and no Tier — not even "Unknown".
         *
         * A trait saying the rarity is unrevealed is still a trait, and
         * marketplaces index and filter on those: a collection would end up
         * with a browsable "Unrevealed" rarity bucket whose size announces
         * exactly how many are left. Absent traits leak nothing.
         */
        attributes: [{ trait_type: "Status", value: "Unrevealed" }],
      },
    };
  }

  const assignment = assignments[tokenId - 1]!;
  const design = assignment.design as ManifestDesign;

  // v2 gives every design its own CID; v1 addresses them inside one directory.
  // Resolving both here keeps already-deployed collections working forever,
  // which matters more than usual: their baseURI is immutable.
  const perFileCid = design.cid;
  const imageCid = perFileCid ?? manifest.imagesCid ?? "";
  const imagePath = perFileCid === undefined ? design.file : "";

  return {
    ok: true,
    document: documentFor(
      {
        collectionName: manifest.name,
        description: manifest.description,
        imagesCid: imageCid,
        gateway: (cid, path) => toGateway(manifest, cid, path),
        ...(manifest.externalUrl === undefined ? {} : { externalUrl: manifest.externalUrl }),
      },
      { design: { ...design, file: imagePath }, edition: assignment.edition },
      tokenId,
    ),
  };
}

/** Shared by both routes, so a batched document is cached exactly as a single one is. */
export const CACHE_HEADERS = {
  // The assignment is fixed by a published seed and can never change for a
  // given token, so this is safe to cache hard and far.
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  // Marketplaces and explorers fetch this from their own origins.
  "Access-Control-Allow-Origin": "*",
} as const;
