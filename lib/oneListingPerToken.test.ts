import { describe, expect, it } from "vitest";
import { oneListingPerToken } from "@/lib/oneListingPerToken";

const BOX = "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750";
const row = (id: number, price: number, active = true, collection = BOX, tag = "") => ({
  collection,
  id: BigInt(id),
  active,
  listing: { price: BigInt(price) },
  tag,
});

describe("oneListingPerToken", () => {
  /**
   * The case from the live market: two identical 9 SOSO listings on one box,
   * which became two cards sharing a React key.
   */
  it("collapses a token listed twice into one row", () => {
    const out = oneListingPerToken([row(53201, 9), row(53201, 9), row(53204, 9), row(53204, 9)]);
    expect(out.map((r) => r.id)).toEqual([53201n, 53204n]);
  });

  it("gives every surviving row a unique key", () => {
    const out = oneListingPerToken([row(1, 5), row(1, 3), row(2, 4), row(1, 9), row(2, 1)]);
    const keys = out.map((r) => `${r.collection.toLowerCase()}-${r.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps the cheaper of two listings — that is what a buyer pays", () => {
    const out = oneListingPerToken([row(7, 20, true, BOX, "dear"), row(7, 12, true, BOX, "cheap")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.tag).toBe("cheap");
  });

  /** An unfillable 1 SOSO row is not a 1 SOSO piece. */
  it("prefers a fillable listing over a cheaper one that cannot be filled", () => {
    const out = oneListingPerToken([row(7, 1, false, BOX, "dead"), row(7, 50, true, BOX, "live")]);
    expect(out[0]!.tag).toBe("live");
  });

  it("keeps the first of two identical listings, so a refetch is stable", () => {
    const out = oneListingPerToken([row(7, 9, true, BOX, "first"), row(7, 9, true, BOX, "second")]);
    expect(out[0]!.tag).toBe("first");
  });

  /** The winner sits where its token first appeared, not where the winner was. */
  it("does not reorder the feed when a later listing wins", () => {
    const out = oneListingPerToken([row(1, 50), row(2, 5), row(1, 3)]);
    expect(out.map((r) => r.id)).toEqual([1n, 2n]);
    expect(out[0]!.listing!.price).toBe(3n);
  });

  it("treats the same id in two collections as two pieces", () => {
    const out = oneListingPerToken([row(1, 5, true, BOX), row(1, 5, true, "0xabc")]);
    expect(out).toHaveLength(2);
  });

  it("matches a collection address regardless of checksum casing", () => {
    const out = oneListingPerToken([row(1, 5, true, BOX), row(1, 4, true, BOX.toLowerCase())]);
    expect(out).toHaveLength(1);
    expect(out[0]!.listing!.price).toBe(4n);
  });

  it("leaves a feed with no duplicates exactly as it was", () => {
    const rows = [row(3, 1), row(1, 2), row(2, 3)];
    expect(oneListingPerToken(rows)).toEqual(rows);
  });
});
