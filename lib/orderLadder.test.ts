import { describe, expect, it } from "vitest";
import { ladder, spread } from "@/lib/orderLadder";
import type { SeaportOrder } from "@/lib/seaport";

/**
 * The ladder decides what a reader believes they can buy, so the cases that
 * matter are the ones where a plausible shortcut would quietly lie: bigint
 * prices past what a float holds, a collection-wide bid stacked with a
 * token-specific one, and a book sorted the wrong way round.
 */

const COLLECTION = "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30" as `0x${string}`;

/** Only the fields the ladder reads; the rest of a SeaportOrder is irrelevant here. */
function order(priceWei: bigint, tokenId?: bigint): SeaportOrder {
  return {
    priceWei,
    ...(tokenId === undefined ? {} : { tokenId }),
    collection: COLLECTION,
  } as unknown as SeaportOrder;
}

const SOSO = 1_000_000_000_000_000_000n;

describe("ladder", () => {
  it("returns nothing for an empty book", () => {
    expect(ladder([], "ask")).toEqual([]);
  });

  it("puts the cheapest ask first", () => {
    const levels = ladder([order(9n * SOSO, 1n), order(2n * SOSO, 2n), order(5n * SOSO, 3n)], "ask");
    expect(levels.map((l) => l.priceWei)).toEqual([2n * SOSO, 5n * SOSO, 9n * SOSO]);
  });

  it("puts the highest bid first", () => {
    const levels = ladder([order(2n * SOSO), order(9n * SOSO), order(5n * SOSO)], "bid");
    expect(levels.map((l) => l.priceWei)).toEqual([9n * SOSO, 5n * SOSO, 2n * SOSO]);
  });

  it("gathers orders sharing a price onto one level", () => {
    const levels = ladder([order(5n * SOSO, 7n), order(5n * SOSO, 3n), order(9n * SOSO, 1n)], "ask");
    expect(levels).toHaveLength(2);
    expect(levels[0]?.count).toBe(2);
  });

  /**
   * The point of the whole module. Three asks at one price are three named
   * pieces, and a reader choosing which to buy needs to know which.
   */
  it("keeps the token ids behind an ask level, sorted", () => {
    const levels = ladder([order(5n * SOSO, 7n), order(5n * SOSO, 3n)], "ask");
    expect(levels[0]?.tokenIds).toEqual([3n, 7n]);
  });

  it("counts cumulatively from the best price", () => {
    const levels = ladder(
      [order(2n * SOSO, 1n), order(5n * SOSO, 2n), order(5n * SOSO, 3n), order(9n * SOSO, 4n)],
      "ask",
    );
    expect(levels.map((l) => l.cumulative)).toEqual([1, 3, 4]);
  });

  it("ends with the whole side in the last level's cumulative", () => {
    const orders = [order(1n * SOSO), order(2n * SOSO), order(3n * SOSO)];
    expect(ladder(orders, "bid").at(-1)?.cumulative).toBe(3);
  });

  /**
   * A collection-wide bid fills against any piece. Marking the level is the
   * only thing that tells a holder they can take it with the token they own.
   */
  it("marks a level containing a collection-wide bid", () => {
    const levels = ladder([order(5n * SOSO)], "bid");
    expect(levels[0]?.anyToken).toBe(true);
    expect(levels[0]?.tokenIds).toEqual([]);
  });

  it("marks a mixed level and still lists the ids it knows", () => {
    const levels = ladder([order(5n * SOSO), order(5n * SOSO, 42n)], "bid");
    expect(levels[0]).toMatchObject({ anyToken: true, count: 2, tokenIds: [42n] });
  });

  it("does not mark a level of token-specific bids", () => {
    expect(ladder([order(5n * SOSO, 1n)], "bid")[0]?.anyToken).toBe(false);
  });

  /**
   * Prices in wei run past 2^53 for anything over about 0.009 SOSO, so sorting
   * through `Number()` would collapse neighbouring prices into one another.
   * These two differ by a single wei, eighteen digits in.
   */
  it("orders prices that a float could not tell apart", () => {
    const a = 9_000_000_000_000_000_001n;
    const b = 9_000_000_000_000_000_002n;
    expect(Number(a) === Number(b)).toBe(true); // the trap, stated
    const levels = ladder([order(b, 1n), order(a, 2n)], "ask");
    expect(levels.map((l) => l.priceWei)).toEqual([a, b]);
    expect(levels).toHaveLength(2);
  });
});

describe("spread", () => {
  it("is undefined with no bids", () => {
    expect(spread(9n * SOSO, undefined)).toBeUndefined();
  });

  it("is undefined with no asks", () => {
    expect(spread(undefined, 5n * SOSO)).toBeUndefined();
  });

  it("measures the gap between the two best prices", () => {
    const s = spread(10n * SOSO, 8n * SOSO);
    expect(s?.absWei).toBe(2n * SOSO);
    expect(s?.negative).toBe(false);
    expect(s?.percent).toBeCloseTo(20, 5);
  });

  /**
   * The best bid CAN exceed the best ask here, and it is not a bug: the two
   * sides settle in different currencies, nothing matches them automatically,
   * and no holder is obliged to take a bid. It has to render, not throw.
   */
  it("reports a crossed book rather than going negative", () => {
    const s = spread(8n * SOSO, 10n * SOSO);
    expect(s?.negative).toBe(true);
    expect(s?.absWei).toBe(2n * SOSO);
    expect(s?.percent).toBeCloseTo(25, 5);
  });

  it("survives a zero ask without dividing by it", () => {
    expect(spread(0n, 5n * SOSO)).toMatchObject({ percent: 0, negative: true });
  });

  it("is zero when the two meet exactly", () => {
    expect(spread(5n * SOSO, 5n * SOSO)).toMatchObject({ absWei: 0n, percent: 0, negative: false });
  });
});
