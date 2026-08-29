import { NextResponse } from "next/server";
import tradeBuddies from "@/data/trade-buddies.json";
import { assignDesigns, documentFor, type Assignment } from "@/lib/buildMetadata";
import {
  parseManifest,
  type CollectionManifest,
  type ManifestDesign,
} from "@/lib/collectionManifest";
import { gatewayUrl } from "@/lib/pinning";
import { filebaseGateway } from "@/lib/filebase";

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
 * Manifests already fetched, keyed by CID.
 *
 * Content-addressed data can never change under a given CID, so this is cached
 * for the life of the process with no invalidation to get wrong. The assignment
 * is cached alongside it because shuffling the deck is the expensive part and
 * it is identical for every token in the collection.
 */
const cache = new Map<string, { manifest: CollectionManifest; assignments: Assignment[] }>();

/** CIDv1 base32 (`bafy…`) or CIDv0 base58 (`Qm…`). */
const CID = /^(ba[a-z2-7]{57,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;

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
  cache.set(cid, entry);
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
  _request: Request,
  { params }: { params: Promise<{ collection: string; id: string }> },
) {
  const { collection, id } = await params;

  // Token ids start at 1, and must be a plain integer — "01", "1.0" and "1e3"
  // would otherwise index the assignment in surprising ways.
  if (!/^[0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Token id must be a whole number." }, { status: 400 });
  }
  const tokenId = Number(id);

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
