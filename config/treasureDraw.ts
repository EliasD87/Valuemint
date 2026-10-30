/**
 * SoDEX's Treasure Box live draws, and which boxes count for the next one.
 *
 * SoDEX runs the draws, not this marketplace. The rule, as the owner stated it
 * on 2026-10-28: every Tuesday at 12:00 UTC a snapshot is taken, and only boxes
 * minted after it count for the next draw, until the following Tuesday's
 * snapshot. An unopened box is one entry; opening a box burns it, so every box
 * that can be listed here is unopened.
 *
 * Box ids are minted in order, so "minted after the snapshot" is simply an id
 * at or above the first one minted after it. That id changes every week and is
 * read off the chain by `/api/draw` (lib/drawCutoff.ts, lib/drawSchedule.ts);
 * pages ask for it through `useNextDraw`. It used to be a constant here, moved
 * by hand, and the label went on marking last week's boxes when nobody did.
 *
 * Known cut-offs, for checking the reader against:
 *   2026-10-20 12:00 UTC  block 15,845,641  first box #102,862
 *   2026-10-27 12:00 UTC  block 16,142,358  first box #116,157
 *
 * If the draws stop or the rule changes, set `enabled` to false: the label is
 * a claim about someone else's rules and must not outlive them.
 */
export const TREASURE_DRAW = {
  enabled: true,
  collection: "0x371c4f7f68be3e558b89cc1f0fb113851c76e750",
} as const;

/**
 * Whether this box counts in SoDEX's next Treasure Box draw, given this week's
 * cut-off. No cut-off yet means no: nothing is badged on a guess.
 */
export function countsForNextDraw(
  collection: string | undefined,
  tokenId: bigint | undefined,
  firstEligibleId: bigint | undefined,
): boolean {
  if (!TREASURE_DRAW.enabled || collection === undefined || tokenId === undefined || firstEligibleId === undefined) {
    return false;
  }
  return collection.toLowerCase() === TREASURE_DRAW.collection && tokenId >= firstEligibleId;
}
