import { describe, expect, it, vi } from "vitest";
import { parseEther, zeroAddress } from "viem";
import { capCandidates, MAX_CANDIDATE_ORDERS, MAX_ORDERS_PER_OFFERER } from "./orderBook";
import type { ReadOrder } from "./seaport";

/**
 * The caps are a security control, not a performance tweak.
 *
 * `validate()` is permissionless and costs a fraction of a cent on this chain,
 * and `validate(Order[])` takes an array — so one cheap transaction can publish
 * thousands of shaped-but-worthless orders. Without a per-offerer quota those
 * evict every genuine listing on the chain from every visitor's page, and with
 * a bidder's own bids evicted, `useOwnOfferExposure` reports zero exposure and
 * the next `allow()` silently revokes the cover for bids already on chain.
 *
 * These tests exist because the rule now has two callers. It was inlined in the
 * log-scan path, where the index would have walked straight past it.
 */

const order = (maker: string): ReadOrder => ({
  kind: "listing",
  collection: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
  tokenId: 1n,
  maker: maker as `0x${string}`,
  currency: zeroAddress,
  priceWei: parseEther("1"),
  amount: 1n,
  endTime: 0n,
});

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as const;

const candidate = (maker: string, blockNumber: bigint) => ({
  blockNumber,
  read: order(maker),
});

describe("capCandidates", () => {
  it("returns newest first", () => {
    const kept = capCandidates([
      candidate(addr(1), 10n),
      candidate(addr(1), 30n),
      candidate(addr(1), 20n),
    ]);

    expect(kept.map((c) => c.blockNumber)).toEqual([30n, 20n, 10n]);
  });

  it("keeps everything when nothing is over the cap", () => {
    const all = Array.from({ length: 50 }, (_, i) => candidate(addr(i), BigInt(i)));
    expect(capCandidates(all)).toHaveLength(50);
  });

  /**
   * The flood displaces itself rather than everyone: a spammer buries their own
   * orders, not the genuine listing published an hour earlier.
   */
  it("bounds one offerer to its quota, whatever it publishes", () => {
    const spam = Array.from({ length: 1_000 }, (_, i) => candidate(addr(1), BigInt(1_000 + i)));
    const genuine = candidate(addr(2), 1n); // older than every one of them

    const kept = capCandidates([...spam, genuine]);

    expect(kept.filter((c) => c.read.maker === addr(1))).toHaveLength(MAX_ORDERS_PER_OFFERER);
    expect(kept).toContain(genuine);
  });

  it("never returns more than the global cap", () => {
    /** Enough distinct offerers that the per-offerer quota is not what binds. */
    const all = Array.from({ length: 3_000 }, (_, i) =>
      candidate(addr(i % 500), BigInt(i)),
    );

    expect(capCandidates(all)).toHaveLength(MAX_CANDIDATE_ORDERS);
  });

  it("says so when it drops anything", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const all = Array.from({ length: MAX_CANDIDATE_ORDERS + 1 }, (_, i) =>
      candidate(addr(i), BigInt(i)),
    );

    capCandidates(all);

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  /** Addresses differing only in case are one offerer, or the quota is free to bypass. */
  it("treats a maker's address case-insensitively", () => {
    const lower = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const upper = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    const mixed = Array.from({ length: 400 }, (_, i) =>
      candidate(i % 2 === 0 ? lower : upper, BigInt(i)),
    );

    expect(capCandidates(mixed)).toHaveLength(MAX_ORDERS_PER_OFFERER);
  });

  it("does not mutate what it is given", () => {
    const all = [candidate(addr(1), 1n), candidate(addr(2), 9n)];
    const copy = [...all];

    capCandidates(all);

    expect(all).toEqual(copy);
  });

  it("returns nothing for nothing", () => {
    expect(capCandidates([])).toEqual([]);
  });
});
