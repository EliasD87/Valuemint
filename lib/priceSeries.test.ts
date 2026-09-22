import { describe, expect, it } from "vitest";
import { salesToPoints, extentOf, niceTicks, norm, type Sale } from "@/lib/priceSeries";

/**
 * The chart's arithmetic. Every case here is one where the obvious
 * implementation divides by zero, plots off the canvas, or draws a confident
 * axis over nothing.
 */

const SOSO = 1_000_000_000_000_000_000n;
const HEAD = 14_660_000n;

const sale = (priceWei: bigint, blocksAgo: bigint, tokenId = 1n): Sale => ({
  priceWei,
  blockNumber: HEAD - blocksAgo,
  tokenId,
});

describe("salesToPoints", () => {
  it("draws nothing before the chain head is known", () => {
    expect(salesToPoints([sale(SOSO, 0n)], undefined)).toEqual([]);
  });

  it("returns oldest first, so a line reads left to right", () => {
    const points = salesToPoints(
      [sale(SOSO, 100n, 1n), sale(2n * SOSO, 5000n, 2n), sale(3n * SOSO, 2000n, 3n)],
      HEAD,
    );
    expect(points.map((p) => p.tokenId)).toEqual([2n, 3n, 1n]);
  });

  it("dates a sale from its distance to the head", () => {
    // 1,743 blocks at the measured 2.065s spacing is about an hour.
    const [p] = salesToPoints([sale(SOSO, 1_743n)], HEAD);
    expect(p!.ago / 3600).toBeCloseTo(1, 1);
  });

  /**
   * The head is polled and the index is not, so a sale can legitimately be a
   * block or two AHEAD of the head in hand. Unclamped that is a negative age,
   * which plots off the right edge of the drawing.
   */
  it("clamps a sale newer than the head we hold", () => {
    const ahead: Sale = { priceWei: SOSO, blockNumber: HEAD + 3n, tokenId: 1n };
    expect(salesToPoints([ahead], HEAD)[0]!.ago).toBe(0);
  });

  it("drops zero-priced sales rather than plotting them at the floor", () => {
    expect(salesToPoints([sale(0n, 10n), sale(SOSO, 20n)], HEAD)).toHaveLength(1);
  });

  it("keeps the exact price alongside the lossy plotting value", () => {
    const odd = 9_000_000_000_000_000_001n;
    const [p] = salesToPoints([{ priceWei: odd, blockNumber: HEAD, tokenId: 1n }], HEAD);
    expect(p!.priceWei).toBe(odd);
  });
});

describe("extentOf", () => {
  it("is undefined for an empty series", () => {
    expect(extentOf([])).toBeUndefined();
  });

  it("spans the lowest and highest price", () => {
    const points = salesToPoints(
      [sale(2n * SOSO, 10n), sale(9n * SOSO, 20n), sale(5n * SOSO, 30n)],
      HEAD,
    );
    const e = extentOf(points)!;
    expect(e.minWei).toBe(2n * SOSO);
    expect(e.maxWei).toBe(9n * SOSO);
  });

  /**
   * One sale — or several at the same price — has no range, and every scale
   * built from it divides by zero. It must become a band with the value in the
   * middle, not a degenerate axis.
   */
  it("widens a single-price series into a band", () => {
    const e = extentOf(salesToPoints([sale(4n * SOSO, 10n)], HEAD))!;
    expect(e.maxY).toBeGreaterThan(e.minY);
    expect(e.minWei).toBe(4n * SOSO);
    expect(e.maxWei).toBe(4n * SOSO);
  });

  it("widens several sales that share one price", () => {
    const e = extentOf(salesToPoints([sale(SOSO, 10n), sale(SOSO, 99n)], HEAD))!;
    expect(e.maxY).toBeGreaterThan(e.minY);
  });

  it("gives a single instant a non-zero time span", () => {
    const e = extentOf(salesToPoints([sale(SOSO, 50n), sale(2n * SOSO, 50n)], HEAD))!;
    expect(e.oldest).toBeGreaterThan(e.newest);
  });
});

describe("niceTicks", () => {
  it("returns nothing for an inverted or empty range", () => {
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(9, 2)).toEqual([]);
  });

  it("refuses a non-finite range rather than looping", () => {
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(niceTicks(Number.NaN, 10)).toEqual([]);
  });

  it("steps in round numbers", () => {
    expect(niceTicks(0, 10, 4)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("does not accumulate float drift across a small step", () => {
    // Repeated `v += 0.002` reaches 0.010000000000000002 by the fifth tick,
    // which formats with an extra digit on an axis meant to read as round.
    const ticks = niceTicks(0, 0.01, 5);
    expect(ticks.every((t) => Math.abs(t * 1000 - Math.round(t * 1000)) < 1e-9)).toBe(true);
  });

  it("stays inside the range", () => {
    const ticks = niceTicks(3, 17, 4);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(17);
  });

  it("handles a range far below 1", () => {
    const ticks = niceTicks(0.002, 0.009, 3);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((t) => t >= 0.002 && t <= 0.009)).toBe(true);
  });

  it("never returns an unbounded list", () => {
    expect(niceTicks(0, 1e12, 1).length).toBeLessThanOrEqual(33);
  });
});

describe("norm", () => {
  it("maps a value across its span", () => {
    expect(norm(5, 0, 10)).toBeCloseTo(0.5, 6);
  });

  it("centres a degenerate span instead of dividing by zero", () => {
    expect(norm(5, 5, 5)).toBe(0.5);
  });

  /**
   * A floor line comes from a different source than the sale points and can
   * legitimately sit outside their range. Unclamped it draws outside the
   * viewBox, where it simply vanishes with no indication anything was there.
   */
  it("clamps a value below the span", () => {
    expect(norm(-4, 0, 10)).toBe(0);
  });

  it("clamps a value above the span", () => {
    expect(norm(40, 0, 10)).toBe(1);
  });
});
