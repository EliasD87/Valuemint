import type { AbiEvent, PublicClient } from "viem";

/**
 * The block the marketplace was deployed in. Nothing it emitted exists before
 * this, so scanning from genesis would be wasted work.
 */
export const FROM_BLOCK = 13_708_851n;

/**
 * How many blocks to ask for at once.
 *
 * Most public RPCs cap `eth_getLogs` by range, by result count, or by both, and
 * they disagree about the limit. 5,000 is comfortably inside every common cap;
 * `scanLogs` halves on failure anyway, so this is a starting guess rather than
 * a constraint to get exactly right.
 */
const CHUNK = 5_000n;

/** Below this a range is not worth splitting further — the endpoint is refusing for another reason. */
const MIN_CHUNK = 250n;

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

  let chunk = CHUNK;
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
      // the scan at a small window for the rest of the session.
      if (chunk < CHUNK) chunk = chunk * 2n > CHUNK ? CHUNK : chunk * 2n;
    } catch (err) {
      if (chunk > MIN_CHUNK) {
        // Almost always "range too large" or "too many results". Halve and retry
        // the same start block.
        chunk = chunk / 2n;
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

/** Drop cached ranges — used after an action that should show up immediately. */
export function resetLogCache(): void {
  cache.clear();
}
