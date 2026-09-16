import type { AbiEvent, PublicClient } from "viem";

/**
 * The block the marketplace was deployed in. Nothing it emitted exists before
 * this, so scanning from genesis would be wasted work.
 */
export const FROM_BLOCK = 13_736_386n;

/**
 * How many blocks to ask for at once.
 *
 * Most public RPCs cap `eth_getLogs` by range, by result count, or by both, and
 * they disagree about the limit — and, as this project has now learned twice,
 * the same endpoint disagrees with itself over time.
 *
 * History, all measured against both ValueChain endpoints rather than guessed:
 *
 *   originally      5,000  chosen to be inside every common cap. A full scan of
 *                          the marketplace was 134 requests and 41s, which is
 *                          why a token page could show "No offers yet" over a
 *                          live offer for half a minute.
 *   2026-09-13    100,000  the primary accepted 600,000 blocks in 354ms, so the
 *                          cap looked generous and this was raised to suit.
 *   2026-09-16     20,000  it does not any more. Both endpoints now take 30,000
 *                          and refuse 35,000. At 100,000 every chunk was
 *                          refused, halved four times and retried: 54 requests
 *                          for a full scan, **27 of them failures**.
 *
 * 20,000 sits comfortably inside the measured 30,000 ceiling on both endpoints,
 * and a full scan costs 34 requests and 10.5s with nothing wasted.
 *
 * The number matters less than `ceiling` below, which is what stops the next
 * change of theirs from costing a failure on every chunk again.
 */
export const CHUNK = 20_000n;

/** Below this a range is not worth splitting further — the endpoint is refusing for another reason. */
const MIN_CHUNK = 250n;

/**
 * The largest range this endpoint has actually accepted, learned at runtime.
 *
 * Without this, halving on failure and doubling on success oscillate against
 * each other forever: the scan drops to a size that works, immediately doubles
 * back to the size that just failed, fails again, halves again. That is exactly
 * what shipped on 2026-09-13 — half of every scan's requests were failures
 * whose only purpose was to rediscover a limit the previous chunk had already
 * found.
 *
 * Lowering this is permanent for the life of the page, so an endpoint that
 * tightens its cap costs one failed request per session rather than one per
 * chunk. It is module scope on purpose: every scan on the page shares what any
 * one of them learned.
 */
let ceiling = CHUNK;

interface Cached {
  /** Highest block already scanned, inclusive. */
  through: bigint;
  logs: unknown[];
}

/**
 * Everything already scanned, per query, for the life of the page.
 *
 * This is what turns the scan from O(chain) into O(new blocks). The previous
 * implementation asked for `fromBlock: <fixed>, toBlock: "latest"` on every
 * poll, so the range grew forever and the same millions of blocks were re-read
 * every thirty seconds. That does not degrade gradually — it works until the
 * range crosses the endpoint's cap, and then the feed is simply empty.
 */
const cache = new Map<string, Cached>();

function keyOf(params: ScanParams): string {
  return JSON.stringify({
    a: params.address,
    e: params.event.name,
    g: params.args ?? null,
    f: params.fromBlock.toString(),
  });
}

export interface ScanParams {
  address: `0x${string}`;
  event: AbiEvent;
  args?: Record<string, unknown>;
  fromBlock: bigint;
}

/**
 * Fetch logs in bounded chunks, remembering what has already been read.
 *
 * The first call for a query walks the whole range once. Every call after it
 * asks only for blocks mined since — which on a 2-second chain is a few hundred
 * at most, however old the contract gets.
 */
export async function scanLogs(
  client: PublicClient,
  params: ScanParams,
): Promise<Array<{ args: unknown; blockNumber: bigint }>> {
  const key = keyOf(params);
  const latest = await client.getBlockNumber();
  const entry = cache.get(key);

  let cursor = entry === undefined ? params.fromBlock : entry.through + 1n;
  const collected: unknown[] = entry === undefined ? [] : entry.logs;

  // Nothing new. Costs one `eth_blockNumber` instead of a full rescan.
  if (cursor > latest) {
    return collected as Array<{ args: unknown; blockNumber: bigint }>;
  }

  // Start no wider than this endpoint has already proved it will accept.
  let chunk = ceiling;
  while (cursor <= latest) {
    const to = cursor + chunk - 1n > latest ? latest : cursor + chunk - 1n;
    try {
      const logs = await client.getLogs({
        address: params.address,
        event: params.event,
        args: params.args as never,
        fromBlock: cursor,
        toBlock: to,
      });
      collected.push(...logs);
      cursor = to + 1n;
      // Creep back up after a successful chunk, so one bad range does not pin
      // the scan at a small window — but never back to a width already refused.
      if (chunk < ceiling) chunk = chunk * 2n > ceiling ? ceiling : chunk * 2n;
    } catch (err) {
      if (chunk > MIN_CHUNK) {
        /**
         * Almost always "range too large" or "too many results". Halve, retry
         * the same start block, and remember not to come back up here — this
         * width is now known bad for the rest of the session.
         */
        chunk = chunk / 2n;
        if (chunk < ceiling) ceiling = chunk;
        continue;
      }
      /**
       * Persist what was read before giving up. A partial feed is worth more
       * than none, and the next poll resumes from here rather than starting
       * over.
       */
      cache.set(key, { through: cursor - 1n, logs: collected });
      throw err;
    }
  }

  cache.set(key, { through: latest, logs: collected });
  return collected as Array<{ args: unknown; blockNumber: bigint }>;
}

/**
 * Drop cached ranges — used after an action that should show up immediately.
 *
 * The learned ceiling goes with them. It is an observation about an endpoint,
 * not about a query, but it is module state either way, and a test that leaves
 * it lowered would silently change the next test's behaviour.
 */
export function resetLogCache(): void {
  cache.clear();
  ceiling = CHUNK;
}
