import { describe, expect, it } from "vitest";
import { averageSale, floorVsSales, floorVsSalesByTier, type SaleSample } from "@/lib/floorVsSales";

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

describe("floorVsSales on a tiered collection", () => {
  const tiered = (soso: number, tier: string | undefined, blocksAgo = 10): SaleSample => ({
    ...sale(soso, blocksAgo),
    ...(tier === undefined ? {} : { tier }),
  });

  /** The Genesis case: a Common floor of 200, and the day's one sale a higher tier at 860. */
  it("leaves out sales of other tiers", () => {
    expect(floorVsSales([tiered(860, "Epic")], 200n * SOSO, HEAD, DAY, "Common")).toBeUndefined();
    const r = floorVsSales([tiered(860, "Epic"), tiered(190, "Common")], 200n * SOSO, HEAD, DAY, "Common");
    expect(r?.sales).toBe(1);
    expect(r?.averageWei).toBe(190n * SOSO);
    expect(r?.percent).toBe(5.26);
  });

  it("leaves out a sale whose tier could not be read", () => {
    expect(floorVsSales([tiered(100, undefined)], 100n * SOSO, HEAD, DAY, "Common")).toBeUndefined();
  });

  it("counts every sale when no tier is asked for", () => {
    expect(floorVsSales([tiered(860, "Epic"), tiered(190, "Common")], 200n * SOSO, HEAD, DAY)?.sales).toBe(2);
  });
});

describe("floorVsSalesByTier", () => {
  const t = (soso: number, tier: string): SaleSample => ({ ...sale(soso, 10), tier });
  const floor = (tier: string, soso: number) => ({ tier, price: BigInt(soso) * SOSO });

  /** The owner's example: two tiers, each listed and each sold — worked out apart, then averaged. */
  it("works each tier out on its own and averages the percentages", () => {
    const r = floorVsSalesByTier(
      [t(190, "Common"), t(900, "Rare")],
      [floor("Common", 200), floor("Rare", 1000)],
      HEAD,
      DAY,
    );
    expect(r?.tiers.map((x) => [x.tier, x.percent])).toEqual([
      ["Common", 5.26],
      ["Rare", 11.11],
    ]);
    expect(r?.percent).toBe(8.19);
  });

  it("leaves out a tier that sold nothing, and one with nothing listed", () => {
    const r = floorVsSalesByTier(
      [t(190, "Common"), t(5000, "Legendary")],
      [floor("Common", 200), floor("Epic", 1500)],
      HEAD,
      DAY,
    );
    expect(r?.tiers.map((x) => x.tier)).toEqual(["Common"]);
    expect(r?.percent).toBe(5.26);
  });

  /** Each tier counts once: ten Common sales do not outweigh one Rare. */
  it("weights tiers equally, not by how many sold", () => {
    const commons = Array.from({ length: 10 }, () => t(100, "Common"));
    const r = floorVsSalesByTier(
      [...commons, t(1000, "Rare")],
      [floor("Common", 110), floor("Rare", 900)],
      HEAD,
      DAY,
    );
    expect(r?.percent).toBe(0); // (+10% + -10%) / 2
  });

  it("gives nothing when no tier has both a listing and a sale", () => {
    expect(floorVsSalesByTier([t(100, "Rare")], [floor("Common", 200)], HEAD, DAY)).toBeUndefined();
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

describe("sales for next to nothing", () => {
  const cheap = (price: number, tier: string) => ({ priceWei: BigInt(Math.round(price * 1e6)) * 10n ** 12n, amount: 1n, blockNumber: HEAD - 5n, tier });

  it("shows no figure when the day's only sales were dust (2026-09-26, Genesis read +149,999,900%)", () => {
    const r = floorVsSalesByTier(
      [cheap(0.001, "Rare"), cheap(0.0001, "Common")],
      [{ tier: "Rare", price: 1000n * SOSO }, { tier: "Common", price: 200n * SOSO }],
      HEAD,
      DAY,
    );
    expect(r).toBeUndefined();
  });

  it("leaves dust out of a day that also had real sales", () => {
    const r = floorVsSales([cheap(0.001, "Common"), cheap(190, "Common")], 200n * SOSO, HEAD, DAY, "Common");
    expect(r?.sales).toBe(1);
    expect(r?.averageWei).toBe(190n * SOSO);
  });

  it("keeps a real discount, however steep, above 1% of the floor", () => {
    expect(floorVsSales([cheap(3, "Common")], 200n * SOSO, HEAD, DAY, "Common")?.sales).toBe(1);
  });
});
