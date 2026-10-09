import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Hex, type TransactionReceipt } from "viem";
import { SEAPORT } from "@/config/seaport";
import { rememberWithdrawals, withdrawnServerSnapshot, withdrawnSnapshot } from "./pendingOrders";

/**
 * A withdrawn offer stayed on screen, Withdraw button and all, until the index
 * or the next status read caught up (2026-10-09). The cancel's own receipt now
 * takes it off at once. Module state is shared across these tests, so each
 * uses its own hashes and makers.
 */

const ORDER_CANCELLED = parseAbiItem(
  "event OrderCancelled(bytes32 orderHash, address indexed offerer, address indexed zone)",
);
const COUNTER_INCREMENTED = parseAbiItem("event CounterIncremented(uint256 newCounter, address indexed offerer)");
const ZERO = "0x0000000000000000000000000000000000000000" as const;

const hash = (byte: string) => `0x${byte.repeat(32)}` as Hex;

function cancelLog(orderHash: Hex, offerer: `0x${string}`, address: string = SEAPORT) {
  return {
    address,
    topics: encodeEventTopics({ abi: [ORDER_CANCELLED], args: { offerer, zone: ZERO } }),
    data: encodeAbiParameters([{ type: "bytes32" }], [orderHash]),
  };
}

function counterLog(offerer: `0x${string}`) {
  return {
    address: SEAPORT,
    topics: encodeEventTopics({ abi: [COUNTER_INCREMENTED], args: { offerer } }),
    data: encodeAbiParameters([{ type: "uint256" }], [1n]),
  };
}

const receipt = (logs: unknown[], status: "success" | "reverted" = "success", blockNumber = 500n) =>
  ({ status, blockNumber, logs }) as unknown as TransactionReceipt;

describe("rememberWithdrawals", () => {
  it("takes every cancelled order out, by hash", () => {
    const maker = "0x1111111111111111111111111111111111111111";
    rememberWithdrawals(receipt([cancelLog(hash("a1"), maker), cancelLog(hash("A2"), maker)]));
    const { hashes } = withdrawnSnapshot();
    expect(hashes.has(hash("a1"))).toBe(true);
    expect(hashes.has(hash("a2"))).toBe(true);
  });

  it("voids a maker's orders up to the block they cancelled everything", () => {
    const maker = "0x2222222222222222222222222222222222222222";
    rememberWithdrawals(receipt([counterLog(maker)], "success", 777n));
    expect(withdrawnSnapshot().voidedAfter.get(maker)).toBe(777n);
  });

  it("ignores a reverted cancel, and anything not from Seaport", () => {
    const maker = "0x3333333333333333333333333333333333333333";
    rememberWithdrawals(receipt([cancelLog(hash("b1"), maker)], "reverted"));
    rememberWithdrawals(receipt([cancelLog(hash("b2"), maker, maker)]));
    const { hashes } = withdrawnSnapshot();
    expect(hashes.has(hash("b1"))).toBe(false);
    expect(hashes.has(hash("b2"))).toBe(false);
  });

  it("hands React the same snapshot until something changes", () => {
    const before = withdrawnSnapshot();
    rememberWithdrawals(receipt([]));
    expect(withdrawnSnapshot()).toBe(before);
    expect(withdrawnServerSnapshot()).toBe(withdrawnServerSnapshot());
  });
});
