import { describe, expect, it } from "vitest";
import { parseEther, zeroAddress } from "viem";
import { summarise, type CursorRow, type FloorRow } from "./exploreSummary";
import type { IndexedEvent } from "./indexEvents";
import { SECONDS_PER_BLOCK } from "@/config/chain";

/**
 * The Explore figures (2026-10-09). Volume and sales by window, floors from
 * the newest snapshot only, and the floor's move against a day before. Built
 * from rows shaped exactly as the index stores them.
 */

const SELLER = "0x1111111111111111111111111111111111111111";
const BUYER = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const A = "0x5fadc59297e86acea20bff519aea0f9651cdc90b";
const B = "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30";

const NOW = new Date("2026-10-09T12:00:00Z");
const HEAD = 1_000_000;
const CURSOR: CursorRow = { last_block: HEAD, updated_at: NOW.toISOString() };
const BLOCKS_PER_HOUR = Math.round(3600 / SECONDS_PER_BLOCK);

let n = 0;
/** A sale of `tokenId` at `price` SOSO, `hoursAgo` before NOW, as the index stores it. */
function sale(collection: string, tokenId: number, price: string, hoursAgo: number, buyer = BUYER): IndexedEvent {
  n += 1;
  return {
    tx_hash: `0x${n.toString(16).padStart(64, "0")}`,
    log_index: 0,
    kind: "fulfilled",
    order_hash: `0x${n.toString(16).padStart(64, "a")}`,
    block_number: HEAD - Math.round(hoursAgo * BLOCKS_PER_HOUR),
    collection,
    token_id: String(tokenId),
    args: {
      orderHash: `0x${n.toString(16).padStart(64, "a")}`,
      offerer: SELLER,
      recipient: buyer,
      offer: [{ itemType: 2, token: collection, identifier: String(tokenId), amount: "1" }],
      consideration: [
        { itemType: 0, token: zeroAddress, identifier: "0", amount: parseEther(price).toString(), recipient: SELLER },
      ],
    } as never,
  };
}

const floor = (collection: string, hoursAgo: number, soso: string | null, listed: number): FloorRow => ({
  collection,
  bucket: new Date(Math.floor((NOW.getTime() - hoursAgo * 3_600_000) / 3_600_000) * 3_600_000).toISOString(),
  floor_wei: soso === null ? null : parseEther(soso).toString(),
  listed,
});

describe("summarise", () => {
  const events = [
    sale(A, 1, "10", 2),
    sale(A, 2, "20", 30),
    sale(A, 3, "5", 24 * 10, OTHER),
    sale(B, 9, "100", 1),
  ];
  const floors = [floor(A, 24, "8", 3), floor(A, 0, "10", 4), floor(B, 0, "90", 2)];
  const s = summarise({ events, floors, cursor: CURSOR, now: NOW });

  it("totals every sale, and counts buyers and sellers once each", () => {
    expect(s.totals.sales).toBe(4);
    expect(BigInt(s.totals.volumeWei)).toBe(parseEther("135"));
    expect(s.totals.traders).toBe(3);
    expect(s.totals.forSale).toBe(6);
  });

  it("splits volume and sales into the day, the week and all time", () => {
    const a = s.collections.find((c) => c.address === A)!;
    expect(a.sales).toEqual({ day: 1, week: 2, all: 3 });
    expect(BigInt(a.volume.day)).toBe(parseEther("10"));
    expect(BigInt(a.volume.week)).toBe(parseEther("30"));
    expect(BigInt(a.volume.all)).toBe(parseEther("35"));
  });

  it("takes the floor from the newest snapshot and its move from a day before", () => {
    const a = s.collections.find((c) => c.address === A)!;
    expect(BigInt(a.floorWei!)).toBe(parseEther("10"));
    expect(a.listed).toBe(4);
    expect(a.floorChange).toBe(25);
  });

  it("orders collections by all-time volume", () => {
    expect(s.collections.map((c) => c.address)).toEqual([B, A]);
  });

  it("lists the newest sales first", () => {
    expect(s.latest.map((x) => x.tokenId)).toEqual(["9", "1", "2", "3"]);
  });

  it("gives no floor to a collection missing from the newest snapshot", () => {
    const later = summarise({ events: [], floors: [floor(A, 3, "10", 4), floor(B, 0, "90", 2)], cursor: CURSOR, now: NOW });
    expect(later.collections.find((c) => c.address === A)).toBeUndefined();
    expect(later.totals.forSale).toBe(2);
  });

  it("shows no floors at all when the snapshots have stopped", () => {
    const stale = summarise({ events: [], floors: [floor(A, 5, "10", 4)], cursor: CURSOR, now: NOW });
    expect(stale.collections).toEqual([]);
    expect(stale.totals.forSale).toBe(0);
  });
});
