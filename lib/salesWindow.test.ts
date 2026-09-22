import { describe, expect, it } from "vitest";
import { meanPrice, tradedChange, hourlyMeans, type WindowSale } from "@/lib/salesWindow";
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
    expect(tradedChange([at(SOSO, 0n)], undefined)).toBeUndefined();
  });

  /**
   * A change needs two figures. A collection that traded yesterday and not
   * today has no 24h change — it has yesterday's price and a quiet day — and
   * substituting a zero or reaching further back would invent a number.
   */
  it("is undefined when the recent window is empty", () => {
    expect(tradedChange([at(SOSO, DAY + 100n)], HEAD)).toBeUndefined();
  });

  it("is undefined when the previous window is empty", () => {
    expect(tradedChange([at(SOSO, 10n)], HEAD)).toBeUndefined();
  });

  it("measures a rise between the two windows", () => {
    const change = tradedChange(
      [at(12n * SOSO, 100n), at(10n * SOSO, DAY + 100n)],
      HEAD,
    )!;
    expect(change.percent).toBeCloseTo(20, 5);
    expect(change.nowWei).toBe(12n * SOSO);
    expect(change.prevWei).toBe(10n * SOSO);
  });

  it("measures a fall as negative", () => {
    const change = tradedChange([at(8n * SOSO, 50n), at(10n * SOSO, DAY + 50n)], HEAD)!;
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
    )!;
    expect(change.countPrev).toBe(1);
    expect(change.percent).toBe(0);
  });

  it("drops zero-priced sales rather than averaging them in", () => {
    const change = tradedChange(
      [at(0n, 10n), at(10n * SOSO, 20n), at(10n * SOSO, DAY + 10n)],
      HEAD,
    )!;
    expect(change.countNow).toBe(1);
  });

  it("reports the counts it averaged, so a caller can judge the sample", () => {
    const change = tradedChange([at(SOSO, 5n), at(SOSO, DAY + 5n)], HEAD)!;
    expect(change).toMatchObject({ countNow: 1, countPrev: 1 });
  });
});

describe("hourlyMeans", () => {
  it("is empty before the chain head is known", () => {
    expect(hourlyMeans([at(SOSO, 0n)], undefined)).toEqual([]);
  });

  it("returns oldest first, so a line reads left to right", () => {
    const buckets = hourlyMeans([at(SOSO, 0n), at(2n * SOSO, hoursBack(5))], HEAD);
    expect(buckets.map((b) => b.hoursAgo)).toEqual([5, 0]);
  });

  it("averages the sales inside one hour", () => {
    const buckets = hourlyMeans([at(10n * SOSO, 10n), at(20n * SOSO, 20n)], HEAD);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ meanWei: 15n * SOSO, count: 2 });
  });

  /**
   * An empty hour is not a price of zero, and it is not the previous hour's
   * price either. It gets no bucket at all — a line through invented points
   * would show a trend the market never had.
   */
  it("gives an empty hour no bucket", () => {
    const buckets = hourlyMeans([at(SOSO, 0n), at(SOSO, hoursBack(3))], HEAD);
    expect(buckets.map((b) => b.hoursAgo)).toEqual([3, 0]);
  });

  it("drops anything outside the window", () => {
    expect(hourlyMeans([at(SOSO, hoursBack(30))], HEAD, 24)).toEqual([]);
  });

  it("ignores a sale ahead of the head rather than bucketing it negatively", () => {
    expect(hourlyMeans([{ priceWei: SOSO, blockNumber: HEAD + 50n }], HEAD)).toEqual([]);
  });

  it("refuses a non-positive window", () => {
    expect(hourlyMeans([at(SOSO, 0n)], HEAD, 0)).toEqual([]);
  });
});
