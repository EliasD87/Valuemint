import { describe, expect, it } from "vitest";
import {
  meanPrice,
  tradedChange,
  rollingMeans,
  MIN_SALES_PER_WINDOW,
  type WindowSale,
} from "@/lib/salesWindow";
import { BLOCKS_PER_DAY } from "@/config/chain";

const SOSO = 1_000_000_000_000_000_000n;
const HEAD = 14_660_000n;
const DAY = BigInt(BLOCKS_PER_DAY);

/**
 * Blocks in `h` hours, rounded from the real figure.
 *
 * NOT `DAY / 24n`. An hour is 1,743.33 blocks and bigint division truncates it
 * to 1,743, so "three hours back" came out 0.9 blocks short of three hours and
 * the code under test correctly bucketed it as two. The first version of this
 * file asserted the truncated arithmetic and called the implementation wrong.
 */
const hoursBack = (h: number) => BigInt(Math.round((h * BLOCKS_PER_DAY) / 24));

/** A sale `blocksAgo` behind the head. */
const at = (priceWei: bigint, blocksAgo: bigint): WindowSale => ({
  priceWei,
  blockNumber: HEAD - blocksAgo,
});

describe("meanPrice", () => {
  it("is undefined with nothing to average", () => {
    expect(meanPrice([])).toBeUndefined();
  });

  it("averages in wei", () => {
    expect(meanPrice([at(2n * SOSO, 0n), at(4n * SOSO, 0n)])).toBe(3n * SOSO);
  });

  /**
   * Summed through `Number` every price is rounded to 17 significant digits
   * before it is added, which for wei is a loss far above the precision of the
   * answer. These three differ only in their final digits.
   */
  it("does not lose the last digits of a uint256", () => {
    const a = 1_000_000_000_000_000_001n;
    const b = 1_000_000_000_000_000_002n;
    const c = 1_000_000_000_000_000_003n;
    expect(meanPrice([at(a, 0n), at(b, 0n), at(c, 0n)])).toBe(b);
  });

  it("truncates rather than rounding, by at most one wei", () => {
    expect(meanPrice([at(1n, 0n), at(2n, 0n)])).toBe(1n);
  });
});

describe("tradedChange", () => {
  it("is undefined before the chain head is known", () => {
    expect(tradedChange([at(SOSO, 0n)], undefined, 1)).toBeUndefined();
  });

  /**
   * A change needs two figures. A collection that traded yesterday and not
   * today has no 24h change — it has yesterday's price and a quiet day — and
   * substituting a zero or reaching further back would invent a number.
   */
  it("is undefined when the recent window is empty", () => {
    expect(tradedChange([at(SOSO, DAY + 100n)], HEAD, 1)).toBeUndefined();
  });

  it("is undefined when the previous window is empty", () => {
    expect(tradedChange([at(SOSO, 10n)], HEAD, 1)).toBeUndefined();
  });

  it("measures a rise between the two windows", () => {
    const change = tradedChange(
      [at(12n * SOSO, 100n), at(10n * SOSO, DAY + 100n)],
      HEAD,
      1,
    )!;
    expect(change.percent).toBeCloseTo(20, 5);
    expect(change.nowWei).toBe(12n * SOSO);
    expect(change.prevWei).toBe(10n * SOSO);
  });

  it("measures a fall as negative", () => {
    const change = tradedChange([at(8n * SOSO, 50n), at(10n * SOSO, DAY + 50n)], HEAD, 1)!;
    expect(change.percent).toBeCloseTo(-20, 5);
  });

  it("averages several sales inside each window", () => {
    const change = tradedChange(
      [
        at(10n * SOSO, 10n),
        at(20n * SOSO, 20n),
        at(5n * SOSO, DAY + 10n),
        at(15n * SOSO, DAY + 20n),
      ],
      HEAD,
      1,
    )!;
    expect(change.nowWei).toBe(15n * SOSO);
    expect(change.prevWei).toBe(10n * SOSO);
    expect(change.countNow).toBe(2);
    expect(change.countPrev).toBe(2);
  });

  /**
   * A sale in the boundary block must land in exactly one window. Two `>=`
   * comparisons would count it in both and pull each mean toward it.
   *
   * It lands in the RECENT one: a sale exactly twenty-four hours old is inside
   * "the last twenty-four hours", and the boundary has to belong somewhere.
   */
  it("puts a boundary sale in one window only", () => {
    const change = tradedChange(
      [at(10n * SOSO, 0n), at(30n * SOSO, DAY), at(20n * SOSO, DAY + 1n)],
      HEAD,
      1,
    )!;
    expect(change.countNow).toBe(2);
    expect(change.countPrev).toBe(1);
    expect(change.nowWei).toBe(20n * SOSO);
    expect(change.prevWei).toBe(20n * SOSO);
  });

  it("ignores anything older than two days", () => {
    const change = tradedChange(
      [at(10n * SOSO, 10n), at(10n * SOSO, DAY + 10n), at(999n * SOSO, DAY * 3n)],
      HEAD,
      1,
    )!;
    expect(change.countPrev).toBe(1);
    expect(change.percent).toBe(0);
  });

  it("drops zero-priced sales rather than averaging them in", () => {
    const change = tradedChange(
      [at(0n, 10n), at(10n * SOSO, 20n), at(10n * SOSO, DAY + 10n)],
      HEAD,
      1,
    )!;
    expect(change.countNow).toBe(1);
  });

  it("reports the counts it averaged, so a caller can judge the sample", () => {
    const change = tradedChange([at(SOSO, 5n), at(SOSO, DAY + 5n)], HEAD, 1)!;
    expect(change).toMatchObject({ countNow: 1, countPrev: 1 });
  });
});

describe("rollingMeans", () => {
  it("is empty before the chain head is known", () => {
    expect(rollingMeans([at(SOSO, 0n)], undefined)).toEqual([]);
  });

  it("refuses a non-positive span", () => {
    expect(rollingMeans([at(SOSO, 0n)], HEAD, 0)).toEqual([]);
  });

  it("returns oldest first, so a line reads left to right", () => {
    const points = rollingMeans([at(SOSO, 0n), at(SOSO, hoursBack(30))], HEAD);
    const hours = points.map((p) => p.hoursAgo);
    expect(hours).toEqual([...hours].sort((a, b) => b - a));
  });

  /**
   * THE INVARIANT THIS MODULE EXISTS FOR.
   *
   * The curve's first and last points are exactly the two figures the
   * percentage compares, so a negative change cannot render as a rising line.
   */
  it("ends at the figures tradedChange compares", () => {
    const sales = [
      at(10n * SOSO, 10n),
      at(20n * SOSO, hoursBack(5)),
      at(30n * SOSO, hoursBack(30)),
      at(50n * SOSO, hoursBack(40)),
    ];
    const change = tradedChange(sales, HEAD, 1)!;
    const points = rollingMeans(sales, HEAD, 24);

    expect(points.at(-1)!.meanWei).toBe(change.nowWei);
    expect(points[0]!.meanWei).toBe(change.prevWei);
  });

  it("falls when the change is negative", () => {
    // Expensive sales two days ago, cheap ones today.
    const sales = [
      at(5n * SOSO, 10n),
      at(5n * SOSO, hoursBack(6)),
      at(50n * SOSO, hoursBack(30)),
      at(50n * SOSO, hoursBack(40)),
    ];
    const change = tradedChange(sales, HEAD, 1)!;
    const points = rollingMeans(sales, HEAD, 24);

    expect(change.percent).toBeLessThan(0);
    expect(points.at(-1)!.meanWei).toBeLessThan(points[0]!.meanWei);
  });

  it("rises when the change is positive", () => {
    const sales = [
      at(50n * SOSO, 10n),
      at(50n * SOSO, hoursBack(6)),
      at(5n * SOSO, hoursBack(30)),
      at(5n * SOSO, hoursBack(40)),
    ];
    const change = tradedChange(sales, HEAD, 1)!;
    const points = rollingMeans(sales, HEAD, 24);

    expect(change.percent).toBeGreaterThan(0);
    expect(points.at(-1)!.meanWei).toBeGreaterThan(points[0]!.meanWei);
  });

  /**
   * A window with nothing in it is not a gap in a trend — it is a day with
   * nothing to average, and carrying the last value forward would draw a flat
   * stretch the market never had.
   */
  it("gives an empty window no point", () => {
    // One sale only: windows that do not contain it produce nothing.
    const points = rollingMeans([at(SOSO, 10n)], HEAD, 24);
    expect(points.length).toBeLessThan(25);
    expect(points.every((p) => p.count > 0)).toBe(true);
  });

  it("reports the sales behind each point", () => {
    const points = rollingMeans([at(10n * SOSO, 5n), at(20n * SOSO, 6n)], HEAD, 24);
    expect(points.at(-1)).toMatchObject({ meanWei: 15n * SOSO, count: 2 });
  });

  it("drops zero-priced sales rather than averaging them in", () => {
    const points = rollingMeans([at(0n, 5n), at(10n * SOSO, 6n)], HEAD, 24);
    expect(points.at(-1)).toMatchObject({ meanWei: 10n * SOSO, count: 1 });
  });
});

describe("tradedChange volume floor", () => {
  const busy = (n: number, priceWei: bigint, blocksAgo: bigint) =>
    Array.from({ length: n }, (_, i) => at(priceWei, blocksAgo + BigInt(i)));

  it("hides a change when the recent window is too thin", () => {
    const sales = [...busy(2, 10n * SOSO, 10n), ...busy(9, 10n * SOSO, DAY + 10n)];
    expect(tradedChange(sales, HEAD)).toBeUndefined();
  });

  /**
   * Both sides, not the total. A hundred sales today against one yesterday is
   * today's price beside a single trade, and the percentage would be decided
   * entirely by whatever that one piece went for.
   */
  it("hides a change when only the previous window is thin", () => {
    const sales = [...busy(40, 10n * SOSO, 10n), ...busy(1, 50n * SOSO, DAY + 10n)];
    expect(tradedChange(sales, HEAD)).toBeUndefined();
  });

  it("shows a change once both windows reach the floor", () => {
    const n = MIN_SALES_PER_WINDOW;
    const sales = [...busy(n, 12n * SOSO, 10n), ...busy(n, 10n * SOSO, DAY + 10n)];
    const change = tradedChange(sales, HEAD)!;
    expect(change.percent).toBeCloseTo(20, 5);
    expect(change.countNow).toBe(n);
    expect(change.countPrev).toBe(n);
  });

  it("can be lowered by a caller that wants the raw arithmetic", () => {
    const sales = [at(12n * SOSO, 10n), at(10n * SOSO, DAY + 10n)];
    expect(tradedChange(sales, HEAD)).toBeUndefined();
    expect(tradedChange(sales, HEAD, 1)).toBeDefined();
  });
});
