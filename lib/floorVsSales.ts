/**
 * Today's floor against what pieces actually sold for over the last 24 hours.
 *
 * The owner's choice, 2026-09-25: the average price of the last day's completed
 * sales, set against the floor right now. Positive when the cheapest thing on
 * offer costs more than the day's trades averaged — asks have moved above what
 * buyers were paying — and negative when it costs less.
 *
 * It is rolling rather than recorded. Nothing has to have been kept for it to
 * work: the sales are in the event log and the floor is live, so tomorrow it
 * is tomorrow's floor against the 24 hours before it, by the same arithmetic,
 * and it never depends on an hourly record being complete or right.
 *
 * ---
 *
 * **What it is not.** It is not the floor's own move over a day, and the label
 * says "vs 24h avg" so it is not read as one. An average moves with WHICH pieces
 * sold as well as with price — one rare piece among commons lifts it — which is
 * why the average and the number of sales ride under the figure: two sales and
 * the percentage is two trades' worth of evidence, and the reader can see that.
 */

export interface SaleSample {
  /** Per unit. */
  priceWei: bigint;
  /** Units in the sale; 1 for an ERC-721. */
  amount: bigint;
  blockNumber: bigint;
}

export interface FloorVsSales {
  floorWei: bigint;
  /** Mean price per unit over the window's sales. */
  averageWei: bigint;
  /** Sales in the window, not units. */
  sales: number;
  percent: number;
}

/**
 * The window's average per-unit sale price, or nothing when nothing sold.
 *
 * Weighted by units, so a sale of ten editions counts as ten pieces at its
 * price rather than as one. `head` undefined is "not known yet" and gives
 * nothing — never the whole history labelled as a day.
 */
export function averageSale(
  sales: readonly SaleSample[],
  head: bigint | undefined,
  blocksPerDay: number,
): { averageWei: bigint; sales: number } | undefined {
  if (head === undefined) return undefined;
  const from = head > BigInt(blocksPerDay) ? head - BigInt(blocksPerDay) : 0n;

  let total = 0n;
  let units = 0n;
  let count = 0;
  for (const s of sales) {
    if (s.priceWei <= 0n || s.amount <= 0n) continue;
    /** No upper bound: the index can be a block ahead of a polled head. */
    if (s.blockNumber < from) continue;
    total += s.priceWei * s.amount;
    units += s.amount;
    count += 1;
  }
  return units === 0n ? undefined : { averageWei: total / units, sales: count };
}

export function floorVsSales(
  sales: readonly SaleSample[],
  floorWei: bigint | undefined,
  head: bigint | undefined,
  blocksPerDay: number,
): FloorVsSales | undefined {
  if (floorWei === undefined) return undefined;
  const avg = averageSale(sales, head, blocksPerDay);
  if (avg === undefined) return undefined;

  /** Basis points in bigint first: two 18-digit figures lose a 1% gap as floats. */
  const bps = ((floorWei - avg.averageWei) * 10_000n) / avg.averageWei;
  return { floorWei, averageWei: avg.averageWei, sales: avg.sales, percent: Number(bps) / 100 };
}
