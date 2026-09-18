import { NextResponse } from "next/server";
import tradeBuddies from "@/data/trade-buddies.json";
import { assignDesigns, documentFor, type Assignment } from "@/lib/buildMetadata";
import {
  parseManifest,
  type CollectionManifest,
  type ManifestDesign,
} from "@/lib/collectionManifest";
import { gatewayUrl } from "@/lib/pinning";
import { TIERS, TIER_GATEWAY, formatVolume } from "@/config/tiers";
import { TIER_STRIDE, TRENCHES_SLUG } from "@/config/trenches";
import { KOLS, KOLS_GATEWAY, KOLS_SLUG, kolForToken } from "@/config/kols";
import { filebaseGateway } from "@/lib/filebase";
import { callerKey, limiter } from "@/lib/rateLimit";

/**
 * Token metadata, generated rather than stored.
 *
 * A pinning account's *file count* runs out long before its storage does, and
 * storing one document per token made a collection cost files in proportion to
 * its supply — so the larger the collection, the sooner creating one failed.
 *
 * Now a collection pins a single manifest describing its designs and shuffle
 * seed, and each token's document is recomputed here on request. One file per
 * collection, whatever the supply.
 *
 * `[collection]` accepts either:
 *   - a manifest CID, which is what /api/pin returns and what new collections'
 *     `baseURI` points at; or
 *   - a slug baked into this app, for collections built before the manifest
 *     existed.
 *
 * The response must be a bare JSON document at `baseURI + tokenId`, because
 * that is exactly what the contract concatenates. No `.json` suffix.
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
 * Collections this route answers without fetching anything.
 *
 * All three are compiled into the bundle - `trade-buddies` from a JSON file,
 * KOLs and The Trenches from `config/`. They cost a map lookup and some
 * arithmetic, never a gateway round trip, so the rate limit that exists to stop
 * this route being an amplification vector does not apply to them.
 *
 * Keep this in step with the branches below. Anything that returns before
 * `loadManifest` belongs here.
 */
function servedFromMemory(collection: string): boolean {
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
const CID = /^(ba[a-z2-7]{57,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;

const HOUR = 60 * 60 * 1000;

/**
 * Generous, because a legitimate crawler warming several collections in one
 * pass is normal traffic and each of those is one miss. It bounds the abusive
 * case rather than shaping the honest one.
 */
const MISSES_PER_HOUR = 120;

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

async function loadManifest(cid: string) {
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

  const entry = { manifest, assignments: assignDesigns(manifest.designs, manifest.seed) };
  remember(cid, entry);
  return entry;
}

const CACHE_HEADERS = {
  // The assignment is fixed by a published seed and can never change for a
  // given token, so this is safe to cache hard and far.
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  // Marketplaces and explorers fetch this from their own origins.
  "Access-Control-Allow-Origin": "*",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ collection: string; id: string }> },
) {
  const { collection, id } = await params;

  /**
   * Rate limited on cache misses only.
   *
   * A hit is a map lookup and costs nothing, so wallets and marketplaces
   * crawling a collection they already warmed are never throttled. A miss
   * fetches from up to three gateways with a 12-second timeout each, and this
   * route is public and unauthenticated - so without a limit it is an
   * amplification vector: cheap requests in, expensive outbound fetches out.
   *
   * The check is deliberately after the id and CID validation below would be
   * too late, so it sits here and only fires when the work is actually going to
   * be done.
   */
  /**
   * A collection answered from memory fetches nothing, so it is never "a miss".
   *
   * This was `!cache.has(collection)` alone, and `cache` is keyed by manifest
   * CID - a slug like `trade-buddies` is never in it, so the answer was always
   * "yes, this will fetch". Every single request for a baked-in collection
   * therefore spent a token from a budget of 120 an hour, and once an hour's
   * worth had gone, every further request got a 429.
   *
   * Measured in production before the fix: `/api/metadata/trade-buddies/1`
   * returned `{"error":"Too many requests."}` on every attempt, twenty seconds
   * apart, while a CID-addressed collection on the same deploy returned 200.
   * Trade Buddies' artwork simply did not load, for anyone.
   *
   * The first version of this fix named `BAKED_IN` alone and missed the other
   * two, which are answered further down by their own branches rather than from
   * that map - so The Trenches, a live collection with claiming open and room
   * for 50,000 tokens, was still spending a token on every single token view.
   * `servedFromMemory` is the one list, so adding a fourth such collection
   * cannot quietly reintroduce this.
   *
   * The gate's own reason for existing - "a miss fetches from up to three
   * gateways with a 12-second timeout each" - never applied here. The data is
   * compiled into the bundle and answered from memory a hundred lines below.
   */
  const willFetch = !servedFromMemory(collection) && !cache.has(collection);
  if (willFetch) {
    const gate = await limiter.take(`meta:${callerKey(request)}`, MISSES_PER_HOUR, HOUR);
    if (!gate.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
      );
    }
  }

  // Token ids start at 1, and must be a plain integer — "01", "1.0" and "1e3"
  // would otherwise index the assignment in surprising ways.
  if (!/^[0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Token id must be a whole number." }, { status: 400 });
  }
  const tokenId = Number(id);

  // --- the KOL portraits -------------------------------------------------
  /**
   * A growing set, so the roster lives in the app rather than a pinned
   * manifest — see `config/kols.ts`. Token id is the entry's position, and a
   * token minted beyond the current roster resolves to nothing until its entry
   * is added, which is the honest answer rather than a placeholder.
   */
  if (collection === KOLS_SLUG) {
    const kol = kolForToken(tokenId);
    if (kol === undefined) {
      return NextResponse.json({ error: "No such token in this collection." }, { status: 404 });
    }

    return NextResponse.json(
      {
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
      { headers: CACHE_HEADERS },
    );
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

    if (tier === undefined || serial < 1) {
      return NextResponse.json({ error: "No such token in this collection." }, { status: 404 });
    }

    return NextResponse.json(
      {
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
      { headers: CACHE_HEADERS },
    );
  }

  // --- collections shipped with the app ---------------------------------
  const baked = BAKED_IN[collection];
  if (baked !== undefined) {
    if (tokenId < 1 || tokenId > baked.tokens.length) {
      return NextResponse.json({ error: "No such token in this collection." }, { status: 404 });
    }
    const design = baked.designs[baked.tokens[tokenId - 1]!]!;
    const edition = baked.editions[tokenId - 1]!;
    return NextResponse.json(
      {
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
      { headers: CACHE_HEADERS },
    );
  }

  // --- collections described by a pinned manifest ------------------------
  if (!CID.test(collection)) {
    return NextResponse.json({ error: "Unknown collection." }, { status: 404 });
  }

  const entry = await loadManifest(collection);
  if (entry === undefined) {
    return NextResponse.json({ error: "That collection manifest could not be read." }, { status: 404 });
  }

  const { manifest, assignments } = entry;
  if (tokenId < 1 || tokenId > assignments.length) {
    return NextResponse.json({ error: "No such token in this collection." }, { status: 404 });
  }

  const assignment = assignments[tokenId - 1]!;
  const design = assignment.design as ManifestDesign;

  // v2 gives every design its own CID; v1 addresses them inside one directory.
  // Resolving both here keeps already-deployed collections working forever,
  // which matters more than usual: their baseURI is immutable.
  const perFileCid = design.cid;
  const imageCid = perFileCid ?? manifest.imagesCid ?? "";
  const imagePath = perFileCid === undefined ? design.file : "";

  const doc = documentFor(
    {
      collectionName: manifest.name,
      description: manifest.description,
      imagesCid: imageCid,
      gateway: (cid, path) =>
        manifest.gateway === undefined
          ? gatewayUrl(cid, path)
          : `${manifest.gateway.replace(/\/+$/, "")}/${cid}${path === "" ? "" : `/${path}`}`,
      ...(manifest.externalUrl === undefined ? {} : { externalUrl: manifest.externalUrl }),
    },
    { design: { ...design, file: imagePath }, edition: assignment.edition },
    tokenId,
  );

  return NextResponse.json(doc, { headers: CACHE_HEADERS });
}
