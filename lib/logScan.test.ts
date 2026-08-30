import { beforeEach, describe, expect, it } from "vitest";
import type { AbiEvent, PublicClient } from "viem";
import { resetLogCache, scanLogs } from "./logScan";

/**
 * The scanner replaced `fromBlock: <fixed>, toBlock: "latest"` on a 30-second
 * poll. That form re-read the whole chain every time and grew without bound
 * until it crossed whatever range cap the endpoint enforced — at which point
 * the feed did not slow down, it went empty.
 *
 * So what these tests actually check is the two properties that failure mode
 * needed: that a repeat scan reads only new blocks, and that an endpoint
 * refusing a range makes the scan narrow rather than give up.
 */

const EVENT = { type: "event", name: "Listed", inputs: [] } as unknown as AbiEvent;

interface Call {
  from: bigint;
  to: bigint;
}

/**
 * A stand-in for viem's client. `capBlocks` makes it refuse any range wider
 * than that, the way a real RPC does.
 */
function fakeClient(opts: { head: bigint; capBlocks?: bigint; logsAt?: bigint[] }) {
  const calls: Call[] = [];
  const client = {
    getBlockNumber: async () => opts.head,
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      calls.push({ from: fromBlock, to: toBlock });
      if (opts.capBlocks !== undefined && toBlock - fromBlock + 1n > opts.capBlocks) {
        throw new Error("query returned more than 10000 results");
      }
      return (opts.logsAt ?? [])
        .filter((b) => b >= fromBlock && b <= toBlock)
        .map((b) => ({ args: { at: b }, blockNumber: b }));
    },
  } as unknown as PublicClient;
  return { client, calls };
}

const params = (fromBlock: bigint) => ({
  address: "0x0c0c1209C54fD220BcE31c81a9C044cE5e8928C5" as `0x${string}`,
  event: EVENT,
  fromBlock,
});

describe("scanLogs", () => {
  beforeEach(() => resetLogCache());

  it("walks the whole range in bounded chunks rather than one request", async () => {
    const { client, calls } = fakeClient({ head: 12_000n });
    await scanLogs(client, params(0n));

    expect(calls.length).toBeGreaterThan(1);
    // Every request is bounded; none is "everything since the beginning".
    for (const c of calls) expect(c.to - c.from + 1n).toBeLessThanOrEqual(5_000n);
    // And together they cover the range exactly once, with no gaps.
    expect(calls[0]!.from).toBe(0n);
    expect(calls[calls.length - 1]!.to).toBe(12_000n);
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]!.from).toBe(calls[i - 1]!.to + 1n);
    }
  });

  it("collects the logs it finds across chunks", async () => {
    const { client } = fakeClient({ head: 12_000n, logsAt: [10n, 6_000n, 11_999n] });
    const logs = await scanLogs(client, params(0n));
    expect(logs).toHaveLength(3);
  });

  it("reads only new blocks on a second scan", async () => {
    const first = fakeClient({ head: 10_000n });
    await scanLogs(first.client, params(0n));
    const firstCount = first.calls.length;
    expect(firstCount).toBeGreaterThan(1);

    // Same query, head moved on by 100 blocks.
    const second = fakeClient({ head: 10_100n });
    await scanLogs(second.client, params(0n));

    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]).toEqual({ from: 10_001n, to: 10_100n });
  });

  it("costs no getLogs at all when nothing new has been mined", async () => {
    const first = fakeClient({ head: 8_000n });
    await scanLogs(first.client, params(0n));

    const again = fakeClient({ head: 8_000n });
    const logs = await scanLogs(again.client, params(0n));

    expect(again.calls).toHaveLength(0);
    expect(logs).toEqual([]);
  });

  it("keeps earlier results when resuming", async () => {
    const first = fakeClient({ head: 5_000n, logsAt: [100n] });
    await scanLogs(first.client, params(0n));

    const second = fakeClient({ head: 5_500n, logsAt: [5_200n] });
    const logs = await scanLogs(second.client, params(0n));

    // The log from the first pass is not lost by the second.
    expect(logs).toHaveLength(2);
  });

  it("halves the chunk when the endpoint refuses a range, and still completes", async () => {
    // Refuses anything over 1,000 blocks — narrower than the 5,000 default.
    const { client, calls } = fakeClient({ head: 4_000n, capBlocks: 1_000n });
    const logs = await scanLogs(client, params(0n));

    expect(logs).toEqual([]);
    const accepted = calls.filter((c) => c.to - c.from + 1n <= 1_000n);
    expect(accepted.length).toBeGreaterThan(0);
    // Coverage is still complete despite the retries.
    expect(accepted[accepted.length - 1]!.to).toBe(4_000n);
  });

  it("treats a different query as a different cache entry", async () => {
    const a = fakeClient({ head: 3_000n });
    await scanLogs(a.client, params(0n));

    // Same contract and event, different start block: must not reuse the range
    // already scanned for the other one.
    const b = fakeClient({ head: 3_000n });
    await scanLogs(b.client, params(1_000n));

    expect(b.calls.length).toBeGreaterThan(0);
    expect(b.calls[0]!.from).toBe(1_000n);
  });

  it("gives up rather than looping forever when even a small range fails", async () => {
    const { client } = fakeClient({ head: 4_000n, capBlocks: 1n });
    await expect(scanLogs(client, params(0n))).rejects.toThrow();
  });
});
