import { describe, expect, it } from "vitest";
import {
  SECONDS_PER_BLOCK,
  bucketVolume,
  grainFor,
  topCollections,
  type Grain,
  type SaleLike,
} from "@/lib/volumeBuckets";

const SOSO = 10n ** 18n;
const HOUR = 3_600_000;

/* UTC cutting, so these hold on any machine whatever its time zone. */
const floorUtc = (ms: number, grain: Grain) => {
  const size = grain === "hour" ? HOUR : grain === "sixHours" ? 6 * HOUR : 24 * HOUR;
  return Math.floor(ms / size) * size;
};
const nextUtc = (start: number, grain: Grain) =>
  start + (grain === "hour" ? HOUR : grain === "sixHours" ? 6 * HOUR : 24 * HOUR);

const NOW = Date.UTC(2026, 8, 23, 15, 30); // 15:30 UTC
const HEAD = 1_000_000n;
/** A block that many hours before now. */
const blockAgo = (hours: number) => HEAD - BigInt(Math.round((hours * 3600) / SECONDS_PER_BLOCK));

const A = "0xAAAA000000000000000000000000000000000000";
const B = "0xbbbb000000000000000000000000000000000000";
const C = "0xcccc000000000000000000000000000000000000";
const D = "0xdddd000000000000000000000000000000000000";

const sale = (collection: string, soso: number, hoursAgo: number, amount = 1n): SaleLike => ({
  kind: "sale",
  collection,
  price: BigInt(soso) * SOSO,
  amount,
  blockNumber: blockAgo(hoursAgo),
});

const run = (rows: SaleLike[], hours: number | undefined, series = [A, B, C].map((a) => a.toLowerCase())) =>
  bucketVolume({ rows, head: HEAD, nowMs: NOW, hours, series, floor: floorUtc, next: nextUtc });

describe("grainFor", () => {
  it("cuts a day into hours and a week into quarter-days", () => {
    expect(grainFor(24, 24)).toBe("hour");
    expect(grainFor(24 * 7, 24 * 7)).toBe("sixHours");
  });

  it("sizes 'everything' to how long everything actually is", () => {
    expect(grainFor(undefined, 30)).toBe("hour");
    expect(grainFor(undefined, 24 * 7)).toBe("sixHours");
    expect(grainFor(undefined, 24 * 40)).toBe("day");
  });
});

describe("bucketVolume", () => {
  it("counts sales only — listings and offers moved no money", () => {
    const rows: SaleLike[] = [
      sale(A, 10, 1),
      { kind: "listed", collection: A, price: 500n * SOSO, amount: 1n, blockNumber: blockAgo(1) },
      { kind: "offer", collection: A, price: 200n * SOSO, amount: 1n, blockNumber: blockAgo(1) },
    ];
    const total = run(rows, 24).buckets.reduce((s, b) => s + b.total, 0n);
    expect(total).toBe(10n * SOSO);
  });

  /** The page's own "SOSO settled" figure is Σ price × amount; the chart must agree with it. */
  it("adds up to price × amount, the same sum the page reports", () => {
    const rows = [sale(A, 10, 1, 3n), sale(B, 7, 2), sale(D, 1, 3)];
    const { buckets } = run(rows, 24);
    expect(buckets.reduce((s, b) => s + b.total, 0n)).toBe((30n + 7n + 1n) * SOSO);
  });

  it("puts every sale in exactly one bucket, by its time", () => {
    const rows = [sale(A, 5, 0.2), sale(A, 5, 1.2), sale(A, 5, 1.4)];
    const { buckets } = run(rows, 24);
    const withSales = buckets.filter((b) => b.sales > 0);
    // 15:30 now: 0.2h ago is 15:18 (the 15:00 bucket), 1.2h and 1.4h ago are 14:18 and 14:06
    expect(withSales.map((b) => new Date(b.start).getUTCHours())).toEqual([14, 15]);
    expect(withSales.map((b) => b.sales)).toEqual([2, 1]);
    expect(buckets.reduce((s, b) => s + b.sales, 0)).toBe(3);
  });

  it("splits each bucket by collection, unnamed ones into Other at index 0", () => {
    const rows = [sale(A, 10, 1), sale(B, 5, 1), sale(C, 2, 1), sale(D, 1, 1)];
    const bucket = run(rows, 24).buckets.find((b) => b.sales > 0)!;
    expect(bucket.parts).toEqual([1n * SOSO, 10n * SOSO, 5n * SOSO, 2n * SOSO]);
    expect(bucket.parts.reduce((s, p) => s + p, 0n)).toBe(bucket.total);
    expect(bucket.byCollection.get(D.toLowerCase())).toBe(1n * SOSO);
  });

  it("matches a collection whatever the casing of its address", () => {
    const rows = [sale(A.toUpperCase().replace("0X", "0x"), 4, 1)];
    const bucket = run(rows, 24).buckets.find((b) => b.sales > 0)!;
    expect(bucket.parts[1]).toBe(4n * SOSO);
  });

  /** A quiet stretch is part of the picture; dropping it would hide the rhythm. */
  it("keeps the empty buckets between busy ones", () => {
    const rows = [sale(A, 1, 1), sale(A, 1, 10)];
    const { buckets } = run(rows, 24);
    expect(buckets.length).toBeGreaterThanOrEqual(24);
    expect(buckets.filter((b) => b.sales === 0).length).toBeGreaterThan(20);
  });

  it("spans the window from its start to now, contiguously", () => {
    const { buckets } = run([sale(A, 1, 1)], 24);
    for (let i = 1; i < buckets.length; i++) expect(buckets[i]!.start).toBe(buckets[i - 1]!.end);
    expect(buckets[0]!.start).toBeLessThanOrEqual(NOW - 24 * HOUR);
    expect(buckets.at(-1)!.end).toBeGreaterThan(NOW);
  });

  it("starts 'everything' at the oldest sale", () => {
    const { buckets, grain } = run([sale(A, 1, 1), sale(A, 1, 30)], undefined);
    expect(grain).toBe("hour");
    expect(buckets[0]!.start).toBe(floorUtc(NOW - 30 * HOUR - 1, "hour"));
  });

  it("returns empty buckets, not nothing, for a window with no sales", () => {
    const { buckets } = run([], 24);
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.every((b) => b.total === 0n)).toBe(true);
  });
});

describe("topCollections", () => {
  it("ranks by settled volume, not by how many times something traded", () => {
    const rows = [sale(A, 1, 1), sale(A, 1, 1), sale(A, 1, 1), sale(B, 100, 1), sale(C, 50, 1)];
    expect(topCollections(rows, 2)).toEqual([B.toLowerCase(), C.toLowerCase()]);
  });

  it("ignores listings, however large", () => {
    const rows: SaleLike[] = [
      sale(A, 5, 1),
      { kind: "listed", collection: B, price: 10_000n * SOSO, amount: 1n, blockNumber: blockAgo(1) },
    ];
    expect(topCollections(rows, 3)).toEqual([A.toLowerCase()]);
  });

  /** The colours come from this order, so it must not depend on row order. */
  it("breaks ties the same way whatever order the rows arrive in", () => {
    // All three settled 5 SOSO. B did it in two sales, so it leads; A and C tie
    // on both counts and fall back to address order.
    const rows = [sale(C, 5, 1), sale(A, 5, 1), sale(B, 2, 1), sale(B, 3, 1)];
    const forward = topCollections(rows, 3);
    const backward = topCollections([...rows].reverse(), 3);
    expect(forward).toEqual(backward);
    expect(forward).toEqual([B, A, C].map((a) => a.toLowerCase()));
  });
});
