import type { DesignInput } from "@/lib/buildMetadata";

/**
 * A whole collection, described in about a kilobyte.
 *
 * This is what replaced pinning one metadata document per token. A 1000-piece
 * collection used to cost 1000 pinned files; the pinning account's *file count*
 * is the binding limit long before its storage is, so supply — the one thing a
 * creator is most likely to want large — was exactly what broke first.
 *
 * The assignment is a seeded shuffle, so it can be recomputed from these few
 * fields instead of stored. One file per collection, whatever the supply.
 *
 * The manifest is itself pinned, and its CID is what the contract's `baseURI`
 * points at. That keeps the collection self-describing: anyone with the CID can
 * regenerate every token's metadata and check it matches, without trusting this
 * server.
 */
export interface ManifestDesign extends DesignInput {
  /** v2 only: this image's own CID. */
  cid?: string;
}

export interface CollectionManifest {
  /**
   * Schema version.
   *
   *   1 - one directory CID for all artwork; each design is a file inside it.
   *       Pinata pins directories, so this is what its uploads produce.
   *   2 - one CID per design. Filebase's S3 API addresses objects individually
   *       and returns no directory CID, so artwork stored there is described
   *       this way. Also strictly more portable: every image is independently
   *       verifiable rather than only as part of a folder.
   *
   * Both are readable forever. A manifest is immutable once pinned, so old ones
   * must keep working no matter what the current uploader writes.
   */
  v: 1 | 2;
  name: string;
  description: string;
  externalUrl?: string;
  /** v1 only: directory CID holding every image. */
  imagesCid?: string;
  /** Where to fetch CIDs from. Absent means the app's configured gateway. */
  gateway?: string;
  /** Publishing this is what lets a holder verify the rarity was not steered. */
  seed: string;
  designs: ManifestDesign[];
}

/** Rejects anything that is not a manifest we can safely expand. */
/**
 * The most tokens one manifest may describe.
 *
 * Exported because `/api/pin` has to refuse at the same number this refuses at.
 * It did not: the writer accepted 100,000 and this reader stopped at 10,000, so
 * a creator could pin a manifest for 50,000 tokens, watch it succeed, deploy a
 * collection against it — and `baseURI` is immutable — and every token in it
 * would answer 404 forever, with no way back. A ceiling enforced on one side of
 * a write/read pair is not a ceiling; it is a trap.
 */
export const MAX_MANIFEST_SUPPLY = 10_000;

export function parseManifest(value: unknown): CollectionManifest | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const m = value as Record<string, unknown>;

  const version = m.v === 1 || m.v === 2 ? m.v : undefined;
  if (version === undefined) return undefined;
  if (typeof m.name !== "string" || typeof m.description !== "string") return undefined;
  if (typeof m.seed !== "string") return undefined;
  // v1 addresses art through a shared directory CID; v2 through per-design ones.
  if (version === 1 && typeof m.imagesCid !== "string") return undefined;
  if (!Array.isArray(m.designs) || m.designs.length === 0 || m.designs.length > 100) return undefined;

  const designs: ManifestDesign[] = [];
  let supply = 0;

  for (const raw of m.designs) {
    if (typeof raw !== "object" || raw === null) return undefined;
    const d = raw as Record<string, unknown>;
    if (typeof d.file !== "string" || typeof d.name !== "string") return undefined;
    if (typeof d.count !== "number" || !Number.isInteger(d.count) || d.count < 1) return undefined;
    if (version === 2 && (typeof d.cid !== "string" || d.cid === "")) return undefined;
    // A hostile manifest could otherwise ask for a deck of a billion entries and
    // hold the request open while it is shuffled.
    supply += d.count;
    /**
     * Lowered from 100,000 on 2026-09-16.
     *
     * The ceiling is not about storage — a manifest declaring a million tokens
     * is still about a kilobyte, because the count is a number rather than a
     * list. It is about what `assignDesigns` then materialises: one object per
     * token, held in the metadata route's cache. The old ceiling let a handful
     * of pinned manifests exhaust a lambda's memory. 10,000 is past anything a
     * real collection here has reached by two orders of magnitude.
     */
    if (supply > MAX_MANIFEST_SUPPLY) return undefined;
    designs.push({
      file: d.file,
      name: d.name,
      count: d.count,
      ...(typeof d.cid === "string" && d.cid !== "" ? { cid: d.cid } : {}),
      ...(typeof d.tier === "string" && d.tier !== "" ? { tier: d.tier } : {}),
    });
  }

  return {
    v: version,
    name: m.name,
    description: m.description,
    /**
     * Same `https:` rule `gateway` below already gets.
     *
     * This is emitted as `external_url` in the metadata document, which
     * explorers and other marketplaces render as a link. ValueMint never renders
     * it, so the exposure is to third-party consumers — which is a reason to
     * validate it rather than a reason to skip it.
     */
    ...(typeof m.externalUrl === "string" && /^https:\/\//.test(m.externalUrl)
      ? { externalUrl: m.externalUrl }
      : {}),
    ...(typeof m.imagesCid === "string" ? { imagesCid: m.imagesCid } : {}),
    ...(typeof m.gateway === "string" && /^https:\/\//.test(m.gateway) ? { gateway: m.gateway } : {}),
    seed: m.seed,
    designs,
  };
}

/** Total tokens a manifest describes. */
export function supplyOfManifest(manifest: CollectionManifest): number {
  return manifest.designs.reduce((n, d) => n + d.count, 0);
}
