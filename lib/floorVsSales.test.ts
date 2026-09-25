import { describe, expect, it } from "vitest";
import { averageSale, floorVsSales, type SaleSample } from "@/lib/floorVsSales";

const SOSO = 10n ** 18n;
const DAY = 43_200; // blocks, at two seconds
const HEAD = 1_000_000n;

const sale = (soso: number, blocksAgo: number, amount = 1n): SaleSample => ({
  priceWei: BigInt(soso) * SOSO,
  amount,
  blockNumber: HEAD - BigInt(blocksAgo),
});

describe("floorVsSales", () => {
  /** The case that prompted it: Cybereator, floor 185 against four sales averaging 203. */
  it("sets the floor against the day's average sale", () => {
    const r = floorVsSales([sale(200, 10), sale(210, 20), sale(198, 30), sale(204, 40)], 185n * SOSO, HEAD, DAY);
    expect(r?.averageWei).toBe(203n * SOSO);
    expect(r?.sales).toBe(4);
    expect(r?.percent).toBeCloseTo(-8.86, 2);
  });

  it("is positive when the floor sits above what things sold for", () => {
    expect(floorVsSales([sale(100, 5)], 110n * SOSO, HEAD, DAY)?.percent).toBe(10);
  });

  it("only counts the last day", () => {
    const r = floorVsSales([sale(100, 5), sale(1000, DAY + 1)], 100n * SOSO, HEAD, DAY);
    expect(r?.sales).toBe(1);
    expect(r?.percent).toBe(0);
  });

  it("gives nothing when nothing sold, nothing is listed, or the head is unknown", () => {
    expect(floorVsSales([sale(100, DAY + 5)], 100n * SOSO, HEAD, DAY)).toBeUndefined();
    expect(floorVsSales([sale(100, 5)], undefined, HEAD, DAY)).toBeUndefined();
    expect(floorVsSales([sale(100, 5)], 100n * SOSO, undefined, DAY)).toBeUndefined();
  });
});

describe("averageSale", () => {
  it("weights an edition sale by its units", () => {
    // 1 at 10, then 3 at 20: per unit (10 + 60) / 4 = 17.5
    const r = averageSale([sale(10, 1), sale(20, 2, 3n)], HEAD, DAY);
    expect(r?.averageWei).toBe((175n * SOSO) / 10n);
    expect(r?.sales).toBe(2);
  });

  it("ignores zero-priced rows rather than averaging them in", () => {
    expect(averageSale([sale(0, 1), sale(100, 2)], HEAD, DAY)?.averageWei).toBe(100n * SOSO);
  });

  it("keeps a sale a block ahead of a polled head", () => {
    expect(averageSale([sale(100, -1)], HEAD, DAY)?.sales).toBe(1);
  });
});
