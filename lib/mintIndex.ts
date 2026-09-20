/**
 * What /mint should be showing right now.
 *
 * A pure rule with a name, because the bug it replaces was not a rendering
 * mistake — it was a missing distinction. The page asked `open.length === 0`
 * and drew an empty state, and that expression is true in three unrelated
 * situations:
 *
 *   1. no collections are known yet;
 *   2. collections are known but nothing has been read from the chain, so
 *      `publicMintEnabled` is undefined for every one of them;
 *   3. everything has been read and genuinely nothing is open.
 *
 * Only the third is what "Nothing is minting at the moment." claims. Somebody
 * arriving during the first two was told, with a heading and a paragraph
 * explaining it, that there was nothing to mint — and then it sometimes filled
 * in seconds later.
 *
 * The two loading flags are not interchangeable and that is the whole point.
 * `listLoading` is "is there anything to show at all", and it goes false the
 * instant `known.ts` is merged, with no network involved. `statePending` is "do
 * we know what those collections are doing", which only the multicall can
 * settle. This page is decided entirely by `publicMintEnabled`, so it is the
 * second flag that governs it.
 */
export type MintIndexState = "settling" | "empty" | "list";

export function mintIndexState({
  listLoading,
  statePending,
  known,
  open,
}: {
  /** Nothing is known yet from any source. */
  listLoading: boolean;
  /** The list is in hand; its on-chain state is not. */
  statePending: boolean;
  /** How many collections are known, whatever their state. */
  known: number;
  /** How many of them report `publicMintEnabled === true`. */
  open: number;
}): MintIndexState {
  /** Something is already open. Never go back to skeletons over it. */
  if (open > 0) return "list";

  if (listLoading) return "settling";

  /**
   * Known collections whose state has not landed. The honest answer is "not
   * known", not "nothing" — and `known === 0` deliberately falls through to
   * `empty` instead, or a chain with no collections on it would show
   * skeletons forever waiting for a read that is never issued.
   */
  if (known > 0 && statePending) return "settling";

  return "empty";
}
