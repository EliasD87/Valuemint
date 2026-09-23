/**
 * What a wallet's pieces are worth at their floors, and how many had none.
 *
 * The per-piece rule is the caller's, passed in, so the header can use exactly
 * the one the cards under it use (`floorForTier`). Two rules would mean a
 * header total that the cards beneath it do not add up to.
 *
 * A piece with no comparable listing is counted, not guessed. It adds nothing
 * to the total and is reported as unpriced, so the page can say the figure
 * leaves something out rather than pass off a partial sum as the whole.
 */
export interface FloorValue {
  /** Sum of every priced piece's floor, in wei. */
  total: bigint;
  priced: number;
  unpriced: number;
}

export function valueAtFloor<T>(
  items: readonly T[],
  floorOf: (item: T) => bigint | undefined,
): FloorValue {
  let total = 0n;
  let priced = 0;
  let unpriced = 0;
  for (const item of items) {
    const floor = floorOf(item);
    if (floor === undefined) unpriced += 1;
    else {
      total += floor;
      priced += 1;
    }
  }
  return { total, priced, unpriced };
}
