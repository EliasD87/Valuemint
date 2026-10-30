import { describe, expect, it } from "vitest";
import type { ActivityRow } from "./activityRows";
import { activityQueryKey, decodeRows, encodeRows, type WireRow } from "./activityWire";

/**
 * Every price in the history panels, the stats page and the collection volumes
 * now crosses this format, so a lost digit here is a wrong number everywhere.
 */
const sale: ActivityRow = {
  kind: "sale",
  collection: "0x371c4f7f68be3e558b89cc1f0fb113851c76e750",
  tokenId: 107003n,
  amount: 1n,
  price: 5_980_000_000_000_000_000n,
  from: "0x00000000000000000000000000000000000000a1",
  to: "0x00000000000000000000000000000000000000b2",
  blockNumber: 16_269_933n,
  logIndex: 12,
};

const collectionOffer: ActivityRow = {
  kind: "offer",
  collection: "0x371c4f7f68be3e558b89cc1f0fb113851c76e750",
  tokenId: 0n,
  collectionOffer: true,
  amount: 3n,
  price: 1n,
  from: "0x00000000000000000000000000000000000000c3",
  blockNumber: 1n,
  logIndex: 0,
};

const cancelled: ActivityRow = {
  kind: "cancelled",
  collection: "0x371c4f7f68be3e558b89cc1f0fb113851c76e750",
  tokenId: 2n ** 255n,
  amount: 1n,
  blockNumber: 2n,
  logIndex: 4,
};

describe("activity rows on the wire", () => {
  it("round-trips every kind without losing a wei", () => {
    const rows = [sale, collectionOffer, cancelled];
    expect(decodeRows(JSON.parse(JSON.stringify(encodeRows(rows))) as WireRow[])).toEqual(rows);
  });

  it("keeps a price wider than a JavaScript number exact", () => {
    const big = { ...sale, price: 123_456_789_012_345_678_901_234_567_890n };
    expect(decodeRows(encodeRows([big]))[0]!.price).toBe(big.price);
  });

  it("leaves absent fields absent rather than inventing zeros", () => {
    const [row] = decodeRows(encodeRows([cancelled]));
    expect(row).not.toHaveProperty("price");
    expect(row).not.toHaveProperty("to");
    expect(row).not.toHaveProperty("collectionOffer");
  });

  it("drops a malformed row instead of throwing", () => {
    const wire = [
      ["x", "0x0", "1", "1", null, null, null, "1", 0, 0],
      ["s", "0x0", "not a number", "1", null, null, null, "1", 0, 0],
      "garbage",
      ...encodeRows([sale]),
    ] as unknown as WireRow[];
    expect(decodeRows(wire)).toEqual([sale]);
  });
});

describe("activityQueryKey", () => {
  it("is the same for the same question however it is spelled", () => {
    expect(activityQueryKey({ collection: "0xABCDEF0000000000000000000000000000000001" })).toEqual(
      activityQueryKey({ collection: "0xabcdef0000000000000000000000000000000001", salesOnly: false }),
    );
  });

  it("keeps sales-only apart from the full feed", () => {
    expect(activityQueryKey({ salesOnly: true })).not.toEqual(activityQueryKey({}));
  });
});
