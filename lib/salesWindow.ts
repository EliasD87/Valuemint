import { BLOCKS_PER_DAY } from "@/config/chain";

/**
 * What pieces actually sold for, window against window.
 *
 * ---
 *
 * **This is a traded price, not a listing floor, and the difference matters.**
 *
 * A floor is the cheapest thing somebody is ASKING. Nobody has to accept it, it
 * can sit unsold for a week, and one optimistic seller can move it without a
 * single piece changing hands. An average of completed sales is what buyers and
 * sellers actually agreed on. They answer different questions and a page should
 * not label one as the other.
 *
 * The practical consequence is that this needs no recording to be set up
 * first: sales are in the event log and always have been, so a change computed
 * from them is available for the whole history the index holds rather than
 * starting the hour somebody created a table.
 *
 * ---
 *
 * **The mean is fragile on thin volume and the caller must say so.**
 *
 * Two sales in a window, one of them an outlier, and the average moves a long
 * way on no real information. That is not something this module can fix — it
 * is a property of averaging small samples — so every result carries the counts
 * it was computed from, and nothing here decides on its own that a sample was
 * big enough to be worth showing.
 */

export interface WindowSale {
  priceWei: bigint;
  blockNumber: bigint;
}

/**
 * The mean, in wei, done entirely in bigint.
 *
 * A `reduce` through `Number` would round every price to 17 significant digits
 * before adding it — which for figures in wei is a loss well above the
 * precision of the answer. Integer division truncates by at most one wei, which
 * cannot move a figure anybody reads.
 */
export function meanPrice(sales: readonly WindowSale[]): bigint | undefined {
  if (sales.length === 0) return undefined;
  let total = 0n;
  for (const s of sales) total += s.priceWei;
  return total / BigInt(sales.length);
}

export interface TradedChange {
  /** Mean of completed sales in the last 24 hours. */
  nowWei: bigint;
  /** Mean of completed sales in the 24 hours before that. */
  prevWei: bigint;
  percent: number;
  countNow: number;
  countPrev: number;
}

/**
 * The change in traded price between the last day and the day before it.
 *
 * `undefined` unless BOTH windows contain a sale. A change needs two figures,
 * and a window with nothing in it does not have one — substituting a zero, or
 * reaching further back for something to compare against, would both invent a
 * number. A collection that traded yesterday and not today has no 24h change;
 * it has yesterday's price and a quiet day.
 */
export function tradedChange(
  sales: readonly WindowSale[],
  head: bigint | undefined,
): TradedChange | undefined {
  if (head === undefined) return undefined;

  const day = BigInt(BLOCKS_PER_DAY);
  const dayAgo = head > day ? head - day : 0n;
  const twoDaysAgo = head > day * 2n ? head - day * 2n : 0n;

  const recent: WindowSale[] = [];
  const previous: WindowSale[] = [];

  for (const sale of sales) {
    if (sale.priceWei <= 0n) continue;
    /**
     * `>= dayAgo` and `< dayAgo` are exclusive of each other, so a sale in the
     * boundary block lands in exactly one window. Two `>=` comparisons would
     * count it in both and inflate each mean by the same sale.
     */
    if (sale.blockNumber >= dayAgo) recent.push(sale);
    else if (sale.blockNumber >= twoDaysAgo) previous.push(sale);
  }

  const nowWei = meanPrice(recent);
  const prevWei = meanPrice(previous);
  if (nowWei === undefined || prevWei === undefined || prevWei === 0n) return undefined;

  /**
   * Basis points as bigints before any float. Two eighteen-digit numbers
   * subtracted as floats lose a 1% difference entirely.
   */
  const bps = ((nowWei - prevWei) * 10_000n) / prevWei;

  return {
    nowWei,
    prevWei,
    percent: Number(bps) / 100,
    countNow: recent.length,
    countPrev: previous.length,
  };
}

export interface HourBucket {
  /** Hours before the chain head. 0 is the most recent. */
  hoursAgo: number;
  meanWei: bigint;
  count: number;
}

/**
 * Sales averaged per hour, newest last, for drawing.
 *
 * Only hours that CONTAIN a sale get a bucket. An empty hour is not a price of
 * zero and it is not the previous hour's price either — a line drawn through
 * invented points would show a trend the market never had. The gaps simply do
 * not exist in the series, which is why the caller spaces points by time rather
 * than by index.
 */
export function hourlyMeans(
  sales: readonly WindowSale[],
  head: bigint | undefined,
  hours = 24,
): HourBucket[] {
  if (head === undefined || hours <= 0) return [];

  const perHour = BLOCKS_PER_DAY / 24;
  const buckets = new Map<number, WindowSale[]>();

  for (const sale of sales) {
    if (sale.priceWei <= 0n || sale.blockNumber > head) continue;
    const hoursAgo = Math.floor(Number(head - sale.blockNumber) / perHour);
    if (hoursAgo >= hours) continue;
    const list = buckets.get(hoursAgo) ?? [];
    list.push(sale);
    buckets.set(hoursAgo, list);
  }

  return [...buckets.entries()]
    .map(([hoursAgo, list]) => ({
      hoursAgo,
      meanWei: meanPrice(list)!,
      count: list.length,
    }))
    /** Oldest first, so a line is drawn left to right. */
    .sort((a, b) => b.hoursAgo - a.hoursAgo);
}
