import { beforeEach, describe, expect, it } from "vitest";
import type { AbiEvent, PublicClient } from "viem";
import { CHUNK, CONFIRMATIONS, resetLogCache, scanLogs } from "./logScan";

/**
 * The scan deliberately stops `CONFIRMATIONS` blocks behind the head, so every
 * coverage assertion below is against the newest *settled* block rather than
 * the head itself. Committing a watermark at the head assumed the head was
 * stable and that both fallback endpoints agreed on it; neither holds.
 */
const settled = (head: bigint) => head - CONFIRMATIONS;

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
    // Derived from CHUNK rather than hardcoded: the property under test is
    // "bounded and contiguous", not the size of the bound, and tuning the chunk
    // for a faster endpoint should not rewrite the test that guards the shape.
    const head = CHUNK * 2n + 2_000n;
    const { client, calls } = fakeClient({ head });
    await scanLogs(client, params(0n));

    expect(calls.length).toBeGreaterThan(1);
    // Every request is bounded; none is "everything since the beginning".
    for (const c of calls) expect(c.to - c.from + 1n).toBeLessThanOrEqual(CHUNK);
    // And together they cover the range exactly once, with no gaps.
    expect(calls[0]!.from).toBe(0n);
    expect(calls[calls.length - 1]!.to).toBe(settled(head));
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]!.from).toBe(calls[i - 1]!.to + 1n);
    }
  });

  it("collects the logs it finds across chunks", async () => {
    // Head pushed past the last log by the confirmation buffer, so all three
    // are inside the settled range and the test still measures collection.
    const { client } = fakeClient({
      head: 12_000n + CONFIRMATIONS,
      logsAt: [10n, 6_000n, 11_999n],
    });
    const logs = await scanLogs(client, params(0n));
    expect(logs).toHaveLength(3);
  });

  it("reads only new blocks on a second scan", async () => {
    // Past one chunk on purpose, so the first pass is a real multi-request walk
    // and the saving the second pass makes is the thing being measured.
    const head = CHUNK + 5_000n;
    const first = fakeClient({ head });
    await scanLogs(first.client, params(0n));
    expect(first.calls.length).toBeGreaterThan(1);

    // Same query, head moved on by 100 blocks.
    const second = fakeClient({ head: head + 100n });
    await scanLogs(second.client, params(0n));

    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]).toEqual({
      from: settled(head) + 1n,
      to: settled(head + 100n),
    });
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
    // Refuses anything over 1,000 blocks — far narrower than the default, which
    // is what the fallback RPC does in production.
    const { client, calls } = fakeClient({ head: 4_000n, capBlocks: 1_000n });
    const logs = await scanLogs(client, params(0n));

    expect(logs).toEqual([]);
    const accepted = calls.filter((c) => c.to - c.from + 1n <= 1_000n);
    expect(accepted.length).toBeGreaterThan(0);
    // Coverage is still complete despite the retries.
    expect(accepted[accepted.length - 1]!.to).toBe(settled(4_000n));
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

  /**
   * The bug this guards against shipped on 2026-09-13 and ran in production for
   * three days. ValueChain's `eth_getLogs` cap dropped from 600,000 blocks to
   * 30,000 between one measurement and the next, so every chunk was refused,
   * halved to something that worked, then doubled straight back to the refused
   * width — half of every scan's requests were failures rediscovering a limit
   * the previous chunk had already found.
   */
  it("does not climb back to a width the endpoint already refused", async () => {
    const cap = CHUNK / 8n;
    const { client, calls } = fakeClient({ head: CHUNK * 4n, capBlocks: cap });
    await scanLogs(client, params(0n));

    const refused = calls.filter((c) => c.to - c.from + 1n > cap);
    // Finding the ceiling costs a few failures; living with it must cost none.
    expect(refused.length).toBeLessThanOrEqual(4);

    // And once found, every later request stays inside it.
    const tail = calls.slice(refused.length + 1);
    for (const c of tail) expect(c.to - c.from + 1n).toBeLessThanOrEqual(cap);
  });

  /**
   * A client that reports how many requests were ever in flight at once, and
   * can be told to fail one particular range the first time it is asked.
   */
  function concurrentClient(opts: { head: bigint; failRangeFrom?: bigint; logsAt?: bigint[] }) {
    const calls: Call[] = [];
    let inFlight = 0;
    let peak = 0;
    const failed = new Set<string>();

    const client = {
      getBlockNumber: async () => opts.head,
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        calls.push({ from: fromBlock, to: toBlock });
        inFlight++;
        peak = Math.max(peak, inFlight);
        // Yield, so requests issued together really do overlap.
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;

        const key = fromBlock.toString();
        if (opts.failRangeFrom === fromBlock && !failed.has(key)) {
          failed.add(key);
          throw new Error("temporary upstream failure");
        }
        return (opts.logsAt ?? [])
          .filter((b) => b >= fromBlock && b <= toBlock)
          .map((b) => ({ args: { at: b }, blockNumber: b }));
      },
    } as unknown as PublicClient;

    return { client, calls, peak: () => peak };
  }

  /**
   * The point of the change. A strictly sequential scan costs one round trip per
   * chunk in series, so its wall time grew with the age of the chain — at
   * ValueChain's block rate, three months of history was ~188 requests
   * back-to-back.
   */
  it("issues requests in parallel once a width is known good", async () => {
    const head = CHUNK * 12n;
    const { client, peak } = concurrentClient({ head });
    await scanLogs(client, params(0n));

    expect(peak()).toBeGreaterThan(1);
  });

  /**
   * ...but not on the first request. Fanning out at a width the endpoint
   * refuses turns one informative failure into eight, every time the cap moves —
   * and ValueChain's cap has already moved once, from 600,000 to under 35,000.
   */
  it("probes with a single request before fanning out", async () => {
    const head = CHUNK * 12n;
    const { client, calls } = concurrentClient({ head });

    // Capture how many had been issued by the time the first one resolved.
    const scan = scanLogs(client, params(0n));
    await new Promise((r) => setTimeout(r, 0));
    const duringFirst = calls.length;
    await scan;

    expect(duringFirst).toBe(1);
  });

  it("still covers the range exactly once, with no gaps, when parallel", async () => {
    const head = CHUNK * 10n + 137n;
    const { client, calls } = concurrentClient({ head });
    await scanLogs(client, params(0n));

    const sorted = [...calls].sort((a, b) => (a.from < b.from ? -1 : 1));
    expect(sorted[0]!.from).toBe(0n);
    expect(sorted[sorted.length - 1]!.to).toBe(settled(head));
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.from).toBe(sorted[i - 1]!.to + 1n);
    }
  });

  /**
   * The failure mode a parallel scan introduces, and the reason the watermark
   * only advances over an unbroken run.
   *
   * If range 3 of a wave fails while 4 through 8 succeed, committing all the
   * successes would move the "everything up to here has been read" mark past
   * blocks nobody fetched. Those logs would then be missing for the life of the
   * page, silently — the scan would never go back for them.
   */
  it("does not skip blocks when one request in a wave fails", async () => {
    const head = CHUNK * 6n;
    // A log inside the range that fails on first attempt.
    const inside = CHUNK * 3n + 10n;
    const { client } = concurrentClient({
      head,
      failRangeFrom: CHUNK * 3n,
      logsAt: [5n, inside, CHUNK * 5n + 1n],
    });

    const logs = await scanLogs(client, params(0n));

    // All three are found: the failed range was retried rather than skipped.
    expect(logs).toHaveLength(3);
    expect((logs as Array<{ blockNumber: bigint }>).some((l) => l.blockNumber === inside)).toBe(true);
  });

  it("carries the learned ceiling into the next scan, not just the current one", async () => {
    const cap = CHUNK / 8n;
    const first = fakeClient({ head: CHUNK * 2n, capBlocks: cap });
    await scanLogs(first.client, params(0n));
    const firstFailures = first.calls.filter((c) => c.to - c.from + 1n > cap).length;
    expect(firstFailures).toBeGreaterThan(0);

    // A different query, same endpoint: it should not rediscover the limit.
    const second = fakeClient({ head: CHUNK * 2n, capBlocks: cap });
    await scanLogs(second.client, params(1n));

    expect(second.calls.filter((c) => c.to - c.from + 1n > cap)).toHaveLength(0);
  });

  /**
   * The reorg / head-lag guard.
   *
   * The watermark used to be the head returned by `eth_blockNumber`. The head
   * can be reorganised away, and the transport is a two-endpoint fallback whose
   * members sit within a block of each other — so the head could be read from
   * one endpoint and the logs served by the other. Either way the newest
   * block's logs were committed over and never re-read, which loses them for
   * the life of the page.
   */
  it("stops short of the head so a reorg or a lagging endpoint cannot lose logs", async () => {
    const head = 10_000n;
    const { client, calls } = fakeClient({ head });
    await scanLogs(client, params(0n));

    for (const c of calls) expect(c.to).toBeLessThanOrEqual(settled(head));
    expect(calls[calls.length - 1]!.to).toBe(settled(head));
  });

  it("reads nothing that is not yet settled on a very young chain", async () => {
    // Head below the buffer means the settled tip is block 0. Asking from block
    // 1 there is asking for blocks that exist but are not settled, and the scan
    // must decline rather than read them — the property, stated without
    // assuming genesis itself is off limits.
    const { client, calls } = fakeClient({ head: CONFIRMATIONS - 1n });
    const logs = await scanLogs(client, params(1n));

    expect(calls).toHaveLength(0);
    expect(logs).toEqual([]);
  });

  /**
   * Two callers, one walk.
   *
   * `useSeaportOrders` and `useActivity` both scan `OrderValidated` and start
   * together on a cold load. Without coalescing they each walked the range, and
   * — because the cached array was handed out by reference — a second
   * concurrent scan could append the same logs into it again. `useSeaportOrders`
   * dedupes by order hash and survived that; `useActivity` does not.
   */
  it("coalesces concurrent scans of the same query into one walk", async () => {
    const head = CHUNK * 3n;
    const { client, calls } = fakeClient({ head, logsAt: [5n, CHUNK + 5n] });

    const [a, b] = await Promise.all([scanLogs(client, params(0n)), scanLogs(client, params(0n))]);

    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);

    // One walk, not two: every range appears exactly once.
    const seen = new Set(calls.map((c) => `${c.from}-${c.to}`));
    expect(seen.size).toBe(calls.length);
  });

  it("does not let a repeat scan duplicate logs it already cached", async () => {
    const first = fakeClient({ head: 5_000n + CONFIRMATIONS, logsAt: [100n] });
    await scanLogs(first.client, params(0n));

    const second = fakeClient({ head: 5_500n + CONFIRMATIONS, logsAt: [100n, 5_200n] });
    const logs = await scanLogs(second.client, params(0n));

    // The cached log plus the new one — not the cached one twice.
    expect(logs).toHaveLength(2);
    const blocks = (logs as Array<{ blockNumber: bigint }>).map((l) => l.blockNumber);
    expect(blocks.filter((b) => b === 100n)).toHaveLength(1);
  });

  /**
   * Recovery, bounded by what the endpoint actually refused.
   *
   * A width that was refused is never tried again — that is the invariant the
   * ceiling exists for. But a session that narrowed because of one dense
   * stretch of logs should not stay narrow for the life of the tab, because log
   * density is attacker-controlled.
   */
  it("climbs back toward the widest width that has actually worked", async () => {
    const cap = CHUNK / 4n;
    // Long enough that the scan makes many clean requests after narrowing.
    const head = CHUNK * 40n;
    const { client, calls } = fakeClient({ head, capBlocks: cap });
    await scanLogs(client, params(0n));

    const widest = calls
      .filter((c) => c.to - c.from + 1n <= cap)
      .reduce((m, c) => (c.to - c.from + 1n > m ? c.to - c.from + 1n : m), 0n);

    // It settled at a real width rather than collapsing toward MIN_CHUNK.
    expect(widest).toBe(cap);
    // And never re-probed a width the endpoint had already refused.
    const refusedWidths = calls.filter((c) => c.to - c.from + 1n > cap).map((c) => c.to - c.from + 1n);
    expect(new Set(refusedWidths).size).toBe(refusedWidths.length);
  });
});
