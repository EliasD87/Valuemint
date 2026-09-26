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
 * says "vs 24h avg" so it is not read as one.
 *
 * **Tiered collections compare like with like.** An average moves with WHICH
 * pieces sold: on Genesis the one sale of a day was a higher tier at 860 while
 * the floor was a Common at 200, and the cell read -76.7% with nothing having
 * got cheaper. So where a collection has tiers, only sales of the FLOOR's tier
 * are averaged (`onlyTier`) — the cheapest Common against what Commons sold
 * for. No sale of that tier in the day is no figure, never a fallback to the
 * other tiers' prices. A sale whose tier could not be read is left out rather
 * than guessed into one.
 *
 * **A sale for next to nothing is not a price.** Under 1% of the floor it is
 * compared with, a "sale" is a transfer dressed as one — a test, a gift, two
 * wallets of the same person — and it wrecks a mean: on 2026-09-26 two test
 * fills at 0.001 and 0.0001 against floors of 1,000 and 200 put Genesis at
 * +149,999,900%. Those are left out, and a day with nothing else sold shows
 * no figure at all, exactly as a day with no sales does.
 */

/** Below this fraction of the floor, a sale is not treated as a price. */
export const DUST_BELOW_FLOOR_DIVISOR = 100n;

export interface SaleSample {
  /** Per unit. */
  priceWei: bigint;
  /** Units in the sale; 1 for an ERC-721. */
  amount: bigint;
  blockNumber: bigint;
  /** The sold piece's tier, where the collection has tiers and it was read. */
  tier?: string;
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
  /** Average only this tier's sales. Absent: every sale counts. */
  onlyTier?: string,
  /** Leave out sales priced under this, per unit. See the note at the top. */
  minPriceWei: bigint = 0n,
): { averageWei: bigint; sales: number } | undefined {
  if (head === undefined) return undefined;
  const from = head > BigInt(blocksPerDay) ? head - BigInt(blocksPerDay) : 0n;

  let total = 0n;
  let units = 0n;
  let count = 0;
  for (const s of sales) {
    if (s.priceWei <= 0n || s.amount <= 0n || s.priceWei < minPriceWei) continue;
    if (onlyTier !== undefined && s.tier !== onlyTier) continue;
    /** No upper bound: the index can be a block ahead of a polled head. */
    if (s.blockNumber < from) continue;
    total += s.priceWei * s.amount;
    units += s.amount;
    count += 1;
  }
  return units === 0n ? undefined : { averageWei: total / units, sales: count };
}

export interface TierComparison extends FloorVsSales {
  tier: string;
}

/**
 * Tier by tier, then the average of the tiers — the owner's rule, 2026-09-25.
 *
 * For every tier with a live listing: that tier's floor now against the
 * average price that tier sold for in the last 24 hours, as a percentage. A
 * tier that sold nothing in the day, or has nothing listed, has no percentage
 * and is left out. The figure is the plain mean of the percentages that remain
 * — each tier counts once, however many of it sold, so a busy Common market
 * cannot drown out the one Rare that traded.
 *
 * Undefined when no tier has both a listing and a sale.
 */
export function floorVsSalesByTier(
  sales: readonly SaleSample[],
  /** Each tier's cheapest live listing — `useFloors().tierRowsFor`. */
  floors: ReadonlyArray<{ tier: string; price: bigint }>,
  head: bigint | undefined,
  blocksPerDay: number,
): { percent: number; tiers: TierComparison[] } | undefined {
  const tiers = floors.flatMap((f): TierComparison[] => {
    const r = floorVsSales(sales, f.price, head, blocksPerDay, f.tier);
    return r === undefined ? [] : [{ ...r, tier: f.tier }];
  });
  if (tiers.length === 0) return undefined;

  /**
   * Averaged in whole basis points, which each tier's figure already is. As
   * percentages the halves go wrong in floating point — 5.26 and 11.11 mean
   * 8.185, and 8.185 * 100 is 818.4999…, which rounds the wrong way.
   */
  const bps = tiers.reduce((sum, t) => sum + Math.round(t.percent * 100), 0);
  return { percent: Math.round(bps / tiers.length) / 100, tiers };
}

export function floorVsSales(
  sales: readonly SaleSample[],
  floorWei: bigint | undefined,
  head: bigint | undefined,
  blocksPerDay: number,
  /** The floor piece's tier, on a tiered collection. See the note at the top. */
  onlyTier?: string,
): FloorVsSales | undefined {
  if (floorWei === undefined) return undefined;
  const avg = averageSale(sales, head, blocksPerDay, onlyTier, floorWei / DUST_BELOW_FLOOR_DIVISOR);
  if (avg === undefined) return undefined;

  /** Basis points in bigint first: two 18-digit figures lose a 1% gap as floats. */
  const bps = ((floorWei - avg.averageWei) * 10_000n) / avg.averageWei;
  return { floorWei, averageWei: avg.averageWei, sales: avg.sales, percent: Number(bps) / 100 };
}
