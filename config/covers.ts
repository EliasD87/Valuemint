/**
 * The pictures a collection is known by, named rather than discovered.
 *
 * ── EDIT THIS FILE TO CHANGE A COLLECTION'S THUMBNAILS ───────────────────
 *
 * Keys are collection addresses, lower-cased. Each value is up to four image
 * paths under `public/covers/`, which is what a cover strip shows.
 *
 * Local, not gateway URLs. These used to point at `gateway.pinata.cloud` and
 * `ipfs.filebase.io`, which put a third party in front of the first paint:
 * measured on the home page, seven gateway fetches through `/api/still` for
 * pictures that never change. `metadata/scripts/localise-covers.mjs` fetches
 * and resizes them to 512px WebP — 31.6MB of gateway sources became 1MB
 * committed. Re-run it after adding an entry that points at a gateway.
 *
 * -------------------------------------------------------------------------
 *
 * These used to be worked out: walk four tokens of every collection, read
 * `tokenByIndex`, `ownerOf` and `tokenURI` for each, fetch a metadata document
 * each, and collect the distinct images. Correct, and far too slow to put a
 * picture on screen — the collections rail rendered grey circles with initials
 * in them (`CY`, `HY`, `OC`) for as long as that took, on the first thing a
 * visitor sees.
 *
 * A collection's cover does not change from minute to minute, so nothing about
 * it needs to be derived at page load. Named here, the rail draws artwork on
 * the first paint with no chain read at all.
 *
 * A collection that is NOT listed here still works exactly as before: its cover
 * is assembled from its minted tokens once those reads land. This is a fast
 * path, not a gate — nothing disappears for want of an entry.
 */

/** Lower-cased address -> up to four image URLs. */
export const COLLECTION_COVERS: Record<string, string[]> = {
  // Cybereator — one animated GIF shared by every token.
  /*
    The SAME animated file the tokens use, not a still of it.

    Localising the covers re-encoded each source through sharp, which reads one
    frame unless told otherwise — so Cybereator's cover arrived as a single
    still of the title card, 1 page and 8KB against the source's 33. The card
    sat frozen on a page where the same artwork moves everywhere else.

    Pointing at `/boxes/cybereator.webp` rather than re-encoding it animated:
    it is already committed, already 33 frames, and already what
    `soleArtworkFor` below hands to every token of these two collections. One
    file means the card and the pieces inside it cannot drift, and on the home
    page it is a second reference to something already downloaded.
  */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": [
    "/boxes/cybereator.webp",
  ],

  // TestCybereator — the same artwork, from the same file.
  "0x412d8af16b7ff3fe75e1cd380bd86ef33dd8ad0f": [
    "/boxes/cybereator.webp",
  ],

  /*
    SoDEX Treasure Box, the real contract.

    Same four pictures as the test one below, because it is the same artwork —
    and it needs them for the same reason, which is that its `baseURI` points
    at a host that answers 501. Checked directly: `tokenURI(1)` resolves to
    .../api/v1/nft/token/sobox/1 and that URL returns 501, so nothing here can
    discover a picture from the chain. Without this entry its cards are blank.
  */
  "0x371c4f7f68be3e558b89cc1f0fb113851c76e750": [
    "/covers/371c4f7f-1.webp",
    "/covers/371c4f7f-2.webp",
    "/covers/371c4f7f-3.webp",
    "/covers/371c4f7f-4.webp",
  ],

  // SoDEX Treasure Box — four tiers, four pictures, 5,000-odd tokens.
  "0x761c3dd0f7a9282e9c5d108394ec7f3ab524a213": [
    "/covers/761c3dd0-1.webp",
    "/covers/761c3dd0-2.webp",
    "/covers/761c3dd0-3.webp",
    "/covers/761c3dd0-4.webp",
  ],

  // ValueChain Genesis
  "0x5fadc59297e86acea20bff519aea0f9651cdc90b": [
    "/covers/5fadc592-1.webp",
    "/covers/5fadc592-2.webp",
    "/covers/5fadc592-3.webp",
    "/covers/5fadc592-4.webp",
  ],

  // The Trenches — one picture per depth.
  /*
    The Trenches — the first four depths, Halo to Verdant.

    These have to be changed by hand whenever the collection is re-cut, and
    that is exactly what went wrong: the tiers were re-cut in `tiers.ts` and
    this list still held the four retired CIDs, so the collection card carried
    the old artwork while every token page carried the new. A cover is named
    here precisely so it needs no chain read — the cost of that is this file
    not knowing when the collection underneath it changes.

    Named after the depth, and a re-cut must use NEW filenames. The image
    optimiser caches by path for 30 days (`minimumCacheTTL` in
    next.config.ts), so new pictures under the old `aab0dc8f-1..4.webp` names
    kept serving the retired art from every cache that had seen them
    (2026-09-25).
  */
  "0xaab0dc8f2835ed903b35d2f52ff17c4bc92bec19": [
    "/covers/aab0dc8f-halo.webp",
    "/covers/aab0dc8f-hellion.webp",
    "/covers/aab0dc8f-lunaris.webp",
    "/covers/aab0dc8f-verdant.webp",
  ],

  // Hypno Plush
  "0x01c28095bfffc9973da4c4e8a34e9d5b6649c988": [
    "/covers/01c28095-1.webp",
    "/covers/01c28095-2.webp",
    "/covers/01c28095-3.webp",
    "/covers/01c28095-4.webp",
  ],

  // Orange Companions
  "0xfe7b74f5dbaeea6a0ef0385f572d60083fefe0c0": [
    "/covers/fe7b74f5-1.webp",
    "/covers/fe7b74f5-2.webp",
    "/covers/fe7b74f5-3.webp",
    "/covers/fe7b74f5-4.webp",
  ],

  // SoDex Larpers — one design across the edition.
  "0x0273df41b56e3480886fe8f0451349bec0f8edf6": [
    "/covers/0273df41-1.webp",
  ],

  // The Oracle
  "0xc486e7aa1c971a61c2a9c6b8ccf671acb0ffd064": [
    "/covers/c486e7aa-1.webp",
  ],
};

/** The named cover for a collection, or nothing if it has not been given one. */
export function coverFor(address: string): string[] | undefined {
  const named = COLLECTION_COVERS[address.toLowerCase()];
  return named !== undefined && named.length > 0 ? named : undefined;
}

/**
 * Collections where every token is the same picture, and we ship that picture.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Cybereator's artwork is one animated file shared by all of its tokens, and
 * serving it has been a running fight. The original is a 6.58 MB GIF on a
 * public IPFS gateway, so `/api/still` re-encodes it — 22 KB for a still,
 * 799 KB and 124 frames for the animation. That works, and it still asks a
 * grid to run 124-frame animations fetched through a proxy from a gateway we
 * do not control.
 *
 * The hero deck already solved this for itself: a 331 KB, 33-frame animated
 * WebP in `public/boxes/`, bundled and served from our own origin, which is
 * the version that has never once failed to play. Pointing the two Cybereator
 * collections at that same file makes their cards use it too — 2.4x smaller,
 * a third of the frames to decode, no gateway, no transform, no swap from a
 * still because there is nothing to swap from.
 *
 * It is only correct for a collection whose tokens genuinely all share one
 * image. Listing a collection here whose pieces differ would show every holder
 * the same picture, so the rule is narrow on purpose and the two entries below
 * are the only ones that qualify.
 */
const SOLE_ARTWORK: Record<string, string> = {
  /** Cybereator — 2,233 tokens, one file. */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": "/boxes/cybereator.webp",

  /** TestCybereator — the same artwork, from the same source file. */
  "0x412d8af16b7ff3fe75e1cd380bd86ef33dd8ad0f": "/boxes/cybereator.webp",
};

/**
 * The one picture every token in this collection uses, if we ship it.
 *
 * `undefined` for everything else, so a caller falls straight through to the
 * token's own metadata exactly as before.
 */
export function soleArtworkFor(address: string | undefined): string | undefined {
  if (address === undefined) return undefined;
  return SOLE_ARTWORK[address.toLowerCase()];
}
