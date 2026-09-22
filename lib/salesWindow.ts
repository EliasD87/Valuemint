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


/**
 * The mean of sales in a block range, `low` inclusive and `high` exclusive.
 *
 * Every window in this file goes through here, and that is the point rather
 * than tidiness: the percentage and the curve beside it are computed from the
 * same boundaries, so they cannot drift into disagreeing about which sale
 * belongs to which day.
 *
 * `high` omitted means no upper bound. The most recent window needs that — a
 * sale can sit a block or two ahead of the head in hand, because the head is
 * polled and the index is not, and capping at the head would silently drop it.
 */
function meanBetween(
  sales: readonly WindowSale[],
  low: bigint,
  high?: bigint,
): { meanWei: bigint; count: number } | undefined {
  let total = 0n;
  let count = 0;
  for (const s of sales) {
    if (s.priceWei <= 0n) continue;
    if (s.blockNumber < low) continue;
    if (high !== undefined && s.blockNumber >= high) continue;
    total += s.priceWei;
    count += 1;
  }
  return count === 0 ? undefined : { meanWei: total / BigInt(count), count };
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
 * How many sales a window needs before its mean is worth publishing.
 *
 * Below this the figure is noise wearing a percentage sign. One sale and the
 * "average" is that sale; two and an unusual one drags it halfway; three is the
 * point where a single outlier stops being able to set the answer on its own.
 *
 * It is deliberately a floor rather than a comfortable sample. Collections here
 * trade thinly — measured on Cybereator, the busiest, the quieter of two
 * adjacent days held four sales — so a threshold of five or ten would hide the
 * figure almost everywhere and the cell would be a rumour of a feature. Three
 * is the smallest number that rules out the cases where the mean is obviously
 * meaningless, and raising it later is one constant.
 */
export const MIN_SALES_PER_WINDOW = 3;

/**
 * The change in traded price between the last day and the day before it.
 *
 * `undefined` unless BOTH windows hold at least `minSales`. A change needs two
 * figures and each has to be worth something: a window with nothing in it does
 * not have one at all, and a window with one sale in it has a number that is
 * not an average of anything. Substituting a zero, or reaching further back for
 * something to compare against, would both invent an answer. A collection that
 * traded yesterday and not today has no 24h change; it has yesterday's price
 * and a quiet day.
 */
export function tradedChange(
  sales: readonly WindowSale[],
  head: bigint | undefined,
  minSales: number = MIN_SALES_PER_WINDOW,
): TradedChange | undefined {
  if (head === undefined) return undefined;

  const day = BigInt(BLOCKS_PER_DAY);
  const dayAgo = head > day ? head - day : 0n;
  const twoDaysAgo = head > day * 2n ? head - day * 2n : 0n;

  /**
   * `low` inclusive and `high` exclusive on both, so a sale in the boundary
   * block lands in exactly one window. Two `>=` comparisons would count it in
   * both and inflate each mean by the same sale.
   */
  const recent = meanBetween(sales, dayAgo);
  const previous = meanBetween(sales, twoDaysAgo, dayAgo);
  if (recent === undefined || previous === undefined || previous.meanWei === 0n) {
    return undefined;
  }
  /**
   * Both sides, not the total. A hundred sales today against one yesterday is
   * not a comparison — it is today's price beside a single trade, and the
   * percentage would be entirely decided by whatever that one piece went for.
   */
  if (recent.count < minSales || previous.count < minSales) return undefined;

  const nowWei = recent.meanWei;
  const prevWei = previous.meanWei;

  /**
   * Basis points as bigints before any float. Two eighteen-digit numbers
   * subtracted as floats lose a 1% difference entirely.
   */
  const bps = ((nowWei - prevWei) * 10_000n) / prevWei;

  return {
    nowWei,
    prevWei,
    percent: Number(bps) / 100,
    countNow: recent.count,
    countPrev: previous.count,
  };
}

export interface RollingPoint {
  /** Hours before the chain head at which this window ENDS. 0 is the newest. */
  hoursAgo: number;
  /** Mean of the 24 hours ending there. */
  meanWei: bigint;
  count: number;
}

/**
 * A rolling 24-hour mean, stepped an hour at a time, oldest first.
 *
 * ---
 *
 * **This exists so the curve and the percentage cannot contradict each other.**
 *
 * The first version plotted an HOURLY mean over the last day beside a figure
 * comparing that day against the one before. Both were correct and they looked
 * like a contradiction: prices climbed through the day, so the line rose, while
 * the day still averaged below the previous one, so the number was red. A
 * rising curve next to a red figure is indefensible whatever the arithmetic
 * says.
 *
 * Rolling fixes it by construction rather than by tuning. The window ending
 * `0` hours ago is exactly `tradedChange`'s recent window, and the one ending
 * `24` hours ago is exactly its previous window — same helper, same
 * boundaries — so the curve BEGINS at `prevWei` and ENDS at `nowWei`. If the
 * figure is negative the line finishes lower than it started. There is no
 * arrangement of sales that can make them disagree.
 *
 * A window with no sales in it yields no point. That is not a gap in a trend,
 * it is a day with nothing to average, and carrying the previous value forward
 * would draw a flat stretch the market never had.
 */
export function rollingMeans(
  sales: readonly WindowSale[],
  head: bigint | undefined,
  spanHours = 24,
): RollingPoint[] {
  if (head === undefined || spanHours <= 0) return [];

  const day = BigInt(BLOCKS_PER_DAY);
  const perHour = BLOCKS_PER_DAY / 24;
  const out: RollingPoint[] = [];

  /** Oldest first, so a line is drawn left to right. */
  for (let hoursAgo = spanHours; hoursAgo >= 0; hoursAgo--) {
    const offset = BigInt(Math.round(hoursAgo * perHour));
    const high = hoursAgo === 0 ? undefined : head - offset;
    const lowRaw = head - offset - day;
    const low = lowRaw > 0n ? lowRaw : 0n;

    const window = meanBetween(sales, low, high);
    if (window !== undefined) {
      out.push({ hoursAgo, meanWei: window.meanWei, count: window.count });
    }
  }

  return out;
}
