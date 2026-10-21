/**
 * SoDEX's Treasure Box live draws, and which boxes count for the next one.
 *
 * SoDEX runs the draws, not this marketplace. The rule, as announced by the
 * owner on 2026-10-20: each round takes a snapshot, and the NEXT round counts
 * only boxes minted after it. An unopened box is one entry; opening a box
 * burns it, so every box that can be listed here is unopened.
 *
 * Box ids are minted in order, so "minted after the snapshot" is simply an id
 * at or above the first one minted after it, read off chain:
 *
 *   snapshot  2026-10-20 12:00:00 UTC = block 15,845,641 (12:00:01)
 *   last box before it   #102,861  block 15,845,624
 *   first box after it   #102,862  block 15,845,653
 *
 * (Mint order checked across the 266 mints around the snapshot.)
 *
 * When SoDEX takes the next snapshot, move `firstEligibleId` and `snapshot` to
 * the new cut-off. If the draws stop or the rule changes, set `enabled` to
 * false: the label is a claim about someone else's rules and must not outlive
 * them.
 */
export const TREASURE_DRAW = {
  enabled: true,
  collection: "0x371c4f7f68be3e558b89cc1f0fb113851c76e750",
  firstEligibleId: 102_862n,
  snapshot: "2026-10-20T12:00:00Z",
} as const;

/** Whether this box counts in SoDEX's next Treasure Box draw. */
export function countsForNextDraw(collection: string | undefined, tokenId: bigint | undefined): boolean {
  if (!TREASURE_DRAW.enabled || collection === undefined || tokenId === undefined) return false;
  return collection.toLowerCase() === TREASURE_DRAW.collection && tokenId >= TREASURE_DRAW.firstEligibleId;
}
