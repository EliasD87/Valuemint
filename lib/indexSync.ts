import "server-only";

import {
  createPublicClient,
  fallback,
  http,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { RPC_HTTP, valuechain } from "@/config/chain";
import { SEAPORT, SEAPORT_FROM_BLOCK } from "@/config/seaport";
import { CONFIRMATIONS, CHUNK } from "@/lib/logScan";
import type { OrderParameters } from "@/lib/seaport";
import { counterRows, eventRows, orderRows } from "@/lib/indexRows";
import { patch, select, upsert } from "@/lib/supabase";

/**
 * Reading the chain into the index.
 *
 * The four events below are the whole order book. `OrderValidated` carries the
 * entire order — not a hash, not a pointer — so this reconstructs the book
 * rather than being told it, and there is nothing here a second reader could
 * not rebuild from scratch tomorrow.
 *
 * ---
 *
 * **Why this does not use `scanLogs`.** That module exists for a browser page,
 * where a failed chunk is a blank panel in front of someone and a retry costs
 * them a second of staring at it — hence the ceiling it learns, the widths it
 * remembers refusing, the partial commits. None of that applies here. This runs
 * every thirty seconds with nothing waiting on it, so a refused chunk is
 * simply read on the next tick. Worse, `scanLogs` keys its cache on `fromBlock`
 * and accumulates every log it has ever seen in module memory: a cursor that
 * moves each run is a new key each run, so a warm lambda would grow without
 * bound and reuse nothing.
 *
 * What is shared is the part that must never disagree — `CONFIRMATIONS` and
 * `CHUNK` are imported, not restated.
 */

const ORDER_VALIDATED = parseAbiItem(
  "event OrderValidated(bytes32 orderHash, (address offerer, address zone, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) orderParameters)",
);

const COUNTER_INCREMENTED = parseAbiItem(
  "event CounterIncremented(uint256 newCounter, address indexed offerer)",
);

const ORDER_FULFILLED = parseAbiItem(
  "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)",
);

const ORDER_CANCELLED = parseAbiItem(
  "event OrderCancelled(bytes32 orderHash, address indexed offerer, address indexed zone)",
);

/** The name of this reader's row in `index_cursor`. */
export const CURSOR = "seaport";

/**
 * How far back to re-read on every run.
 *
 * A committed watermark is never revisited, so anything reorganised away behind
 * it would be wrong forever. Re-reading the last few hundred blocks every time
 * costs one `eth_getLogs` — the writes are upserts, so reading the same log
 * twice changes nothing — and makes a reorg self-healing instead of something
 * that has to be noticed.
 *
 * Comfortably more than `CONFIRMATIONS`, which bounds what can still move.
 */
const REWIND = 300n;

/**
 * The most blocks one run may cover.
 *
 * Steady state is about fifteen blocks — thirty seconds of a two-second chain —
 * so this only ever binds on a cold start, where it turns one enormous
 * invocation into a handful of ordinary ones. `done: false` in the result is
 * how the caller knows to go round again.
 */
export const MAX_BLOCKS_PER_RUN = CHUNK * 10n;

/**
 * A log with everything needed to key it.
 *
 * `transactionHash` and `logIndex` are what make `events` idempotent, so they
 * are part of the type rather than looked up optimistically later.
 */
interface RawLog {
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash?: string | null;
  logIndex?: number | null;
}

/** PostgREST puts filters in the URL, and a URL has a length. */
const HASHES_PER_PATCH = 100;

export interface SyncResult {
  from: number;
  to: number;
  head: number;
  orders: number;
  counters: number;
  events: number;
  filled: number;
  cancelled: number;
  /** Collections whose floor was recorded this run. 0 before the table exists. */
  floors: number;
  /** False when the run hit `MAX_BLOCKS_PER_RUN` and there is more to read. */
  done: boolean;
  ms: number;
}

/**
 * Its own client, with the same fallback the rest of the app has.
 *
 * Pinned to one endpoint, the indexer stops at that endpoint's first bad
 * minute — and unlike a page, nobody is watching to notice.
 */
export function indexClient(): PublicClient {
  return createPublicClient({
    chain: valuechain,
    transport: fallback(
      RPC_HTTP.map((url) => http(url, { batch: true, retryCount: 2 })),
      { rank: false },
    ),
  }) as PublicClient;
}

/**
 * Logs over a fixed range, in chunks, halving on refusal.
 *
 * ValueChain's `eth_getLogs` cap has moved twice — 600,000 blocks accepted one
 * week, 35,000 refused the next — so a fixed width is a thing that works until
 * it doesn't. Halving is the cheap version of the browser's adaptive ceiling:
 * it costs a wasted request when the cap tightens, and this is a background job
 * that can afford one.
 */
async function logsOver(
  client: PublicClient,
  event: typeof ORDER_VALIDATED | typeof COUNTER_INCREMENTED | typeof ORDER_FULFILLED | typeof ORDER_CANCELLED,
  from: bigint,
  to: bigint,
): Promise<RawLog[]> {
  const out: RawLog[] = [];
  let width = CHUNK;
  let cursor = from;

  while (cursor <= to) {
    const end = cursor + width - 1n > to ? to : cursor + width - 1n;
    try {
      const logs = await client.getLogs({
        address: SEAPORT,
        event: event as never,
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as unknown as RawLog[]));
      cursor = end + 1n;
    } catch (err) {
      /**
       * Below this the endpoint is refusing for some reason other than width,
       * and halving again would only loop. Let it throw: the cursor has not
       * moved, so the next run re-reads this range from the start.
       */
      if (width <= 250n) throw err;
      width = width / 2n;
    }
  }

  return out;
}

/**
 * Which piece each cancelled order was for.
 *
 * `OrderCancelled` carries only a hash, so a cancellation cannot name its own
 * token — the answer is in that order's `OrderValidated`, which is very often
 * far behind the range being read. Without this the feed could only resolve a
 * cancellation by having the whole history in front of it, which is exactly the
 * thing these filter columns exist to stop being necessary.
 *
 * This window's own orders are checked first, so a list-and-cancel inside one
 * range costs nothing. Anything older is one batched read, and only when there
 * are cancellations at all.
 */
async function orderLookup(
  thisWindow: ReadonlyArray<{ order_hash: string; collection: string; token_id: string | null }>,
  cancelledHashes: string[],
): Promise<(orderHash: string) => { collection: string; tokenId: string | null } | undefined> {
  const found = new Map<string, { collection: string; tokenId: string | null }>();
  for (const o of thisWindow) {
    found.set(o.order_hash, { collection: o.collection, tokenId: o.token_id });
  }

  const missing = [
    ...new Set(cancelledHashes.map((h) => h.toLowerCase()).filter((h) => !found.has(h))),
  ];

  for (let i = 0; i < missing.length; i += HASHES_PER_PATCH) {
    const slice = missing.slice(i, i + HASHES_PER_PATCH);
    if (slice.length === 0) continue;
    const list = slice.map((h) => `"${h}"`).join(",");
    const rows = await select<{ order_hash: string; collection: string; token_id: string | null }>(
      `orders?select=order_hash,collection,token_id&order_hash=in.(${encodeURIComponent(list)})`,
    );
    for (const o of rows) {
      found.set(o.order_hash, { collection: o.collection, tokenId: o.token_id });
    }
  }

  return (orderHash: string) => found.get(orderHash.toLowerCase());
}

/** Where the last run got to, or the block Seaport was deployed in. */
async function readCursor(): Promise<bigint> {
  const rows = await select<{ last_block: number }>(
    `index_cursor?name=eq.${CURSOR}&select=last_block&limit=1`,
  );
  const last = rows[0]?.last_block;
  return last === undefined ? SEAPORT_FROM_BLOCK : BigInt(last);
}

/** Mark a set of orders retired. Absent hashes are simply not matched. */
async function markStatus(hashes: string[], status: "filled" | "cancelled"): Promise<number> {
  const unique = [...new Set(hashes.map((h) => h.toLowerCase()))];

  for (let i = 0; i < unique.length; i += HASHES_PER_PATCH) {
    const slice = unique.slice(i, i + HASHES_PER_PATCH);
    if (slice.length === 0) continue;
    const list = slice.map((h) => `"${h}"`).join(",");
    await patch(`orders?order_hash=in.(${encodeURIComponent(list)})`, {
      status,
      updated_at: new Date().toISOString(),
    });
  }

  return unique.length;
}

/**
 * One pass: read what is new, write it, move the watermark.
 *
 * The order of the writes is not incidental. Validations go in first and
 * fulfilments over the top, so an order that was announced and then bought
 * inside the same window ends the run marked `filled` rather than open. The
 * upsert deliberately does not send `status` at all, which is what stops a
 * re-read of an old block resurrecting an order somebody has already bought —
 * the column keeps whatever it had, and only ever moves one way.
 */
/**
 * Record what the floor is right now, per collection.
 *
 * **The only thing in this database that cannot be rebuilt from the chain.**
 *
 * Every other table here is a cache: truncate it, replay it, get the same rows
 * back. A floor is different. It is the minimum over the orders that were live
 * AT A MOMENT, and "live" depends on fills, cancellations, expiries and counter
 * increments — the last of which leaves no per-order trace at all. Yesterday's
 * floor cannot be reconstructed from today's logs, and an attempt gets a number
 * that is wrong in a KNOWN DIRECTION: a stale cheap listing that nothing
 * records as dead drags the reconstruction down, so every change computed
 * against it reads more positive than the truth. A price signal biased one way
 * is worse than no price signal, so this is recorded forward instead.
 *
 * Bucketed to the hour, which is what makes it affordable. The sync runs every
 * thirty seconds; keyed on a timestamp this would write 2,880 rows per
 * collection per day. Keyed on the hour it upserts one row 120 times and leaves
 * 24 a day — a couple of hundred across the whole chain, and still far finer
 * than a figure labelled "1d" needs.
 *
 * **A collection with nothing listed writes no row**, because `collection_floors`
 * only names collections that have a live listing. That is deliberate: the gap
 * reads as "not known", which is true, rather than as a floor of zero, which
 * would be a price nobody ever asked. A reader must treat a missing bucket as
 * unknown and not interpolate across it.
 */
export async function snapshotFloors(at: Date): Promise<number> {
  const rows = await select<{
    collection: string;
    listed: number;
    floor_wei: string | null;
  }>("collection_floors?select=collection,listed,floor_wei");

  if (rows.length === 0) return 0;

  /** Floored to the hour — this is the whole de-duplication mechanism. */
  const bucket = new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000).toISOString();

  await upsert(
    "floor_history",
    rows.map((r) => ({
      collection: r.collection,
      bucket,
      floor_wei: r.floor_wei,
      listed: r.listed,
      updated_at: at.toISOString(),
    })),
    "collection,bucket",
  );

  return rows.length;
}

export async function syncSeaport(client: PublicClient = indexClient()): Promise<SyncResult> {
  const started = Date.now();

  const head = await client.getBlockNumber();
  const safeHead = head > CONFIRMATIONS ? head - CONFIRMATIONS : 0n;

  const committed = await readCursor();
  const rewound = committed > REWIND + SEAPORT_FROM_BLOCK ? committed - REWIND : SEAPORT_FROM_BLOCK;
  const from = rewound;
  const capped = from + MAX_BLOCKS_PER_RUN - 1n;
  const to = capped > safeHead ? safeHead : capped;

  if (from > to) {
    /**
     * Caught up — and the floor is still snapshotted.
     *
     * Easy to skip here on the reasoning that nothing can have changed without
     * new blocks. That is wrong: `live_orders` filters on
     * `end_time > extract(epoch from now())`, so an order EXPIRING moves the
     * floor with no block, no log and no event. Returning early without a
     * snapshot would drop exactly the hours in which a quiet market's floor
     * rose because its cheapest listing timed out.
     */
    let idleFloors = 0;
    try {
      idleFloors = await snapshotFloors(new Date());
    } catch (err) {
      console.error("[index] floor snapshot failed", err);
    }

    return {
      from: Number(from),
      to: Number(committed),
      head: Number(head),
      orders: 0,
      counters: 0,
      events: 0,
      filled: 0,
      cancelled: 0,
      floors: idleFloors,
      done: true,
      ms: Date.now() - started,
    };
  }

  const [validated, counters, fulfilled, cancelled] = await Promise.all([
    logsOver(client, ORDER_VALIDATED, from, to),
    logsOver(client, COUNTER_INCREMENTED, from, to),
    logsOver(client, ORDER_FULFILLED, from, to),
    logsOver(client, ORDER_CANCELLED, from, to),
  ]);

  const at = new Date();

  const hashesOf = (logs: Array<{ args: unknown }>): string[] =>
    logs.flatMap((log) => {
      const args = log.args as { orderHash?: Hex };
      return args.orderHash === undefined ? [] : [args.orderHash];
    });

  const orders = orderRows(
    validated.flatMap((log) => {
      const args = log.args as { orderHash?: Hex; orderParameters?: OrderParameters };
      if (args.orderHash === undefined || args.orderParameters === undefined) return [];
      return [{ hash: args.orderHash, params: args.orderParameters, blockNumber: log.blockNumber }];
    }),
    at,
  );

  const voided = counterRows(
    counters.flatMap((log) => {
      const args = log.args as { offerer?: Address };
      return args.offerer === undefined ? [] : [{ offerer: args.offerer, blockNumber: log.blockNumber }];
    }),
  );

  /**
   * History, written from the same logs that built the book above.
   *
   * Three kinds rather than only sales, because a cancellation carries nothing
   * but an order hash — the token it freed is recoverable only from that
   * order's own `OrderValidated`. Storing the validations is what lets a
   * cancellation say which piece it was.
   */
  const resolve = await orderLookup(orders, hashesOf(cancelled));

  const history = [
    ...eventRows("validated", validated),
    ...eventRows("fulfilled", fulfilled),
    ...eventRows("cancelled", cancelled, resolve),
  ];

  await upsert("orders", orders, "order_hash");
  await upsert("counters", voided, "offerer");
  await upsert("events", history, "tx_hash,log_index");

  const filledCount = await markStatus(hashesOf(fulfilled), "filled");
  const cancelledCount = await markStatus(hashesOf(cancelled), "cancelled");

  /**
   * The watermark moves last, and only after every write above has returned.
   *
   * Committing it first would mean a failure halfway through silently skipped a
   * range — the exact failure mode that is invisible until somebody asks why
   * their listing never appeared.
   */
  await upsert(
    "index_cursor",
    [{ name: CURSOR, last_block: Number(to), updated_at: at.toISOString() }],
    "name",
  );

  /**
   * After the watermark, and deliberately not allowed to fail the run.
   *
   * The floor snapshot is an extra this sync takes on the way past; the sync's
   * actual job is the order book, and that has already been committed by the
   * time this runs. A snapshot that throws must cost one missing hourly point,
   * not a whole index run and the block range it would have advanced.
   */
  let floors = 0;
  try {
    floors = await snapshotFloors(at);
  } catch (err) {
    console.error("[index] floor snapshot failed", err);
  }

  return {
    from: Number(from),
    to: Number(to),
    head: Number(head),
    floors,
    orders: orders.length,
    counters: voided.length,
    events: history.length,
    filled: filledCount,
    cancelled: cancelledCount,
    done: to >= safeHead,
    ms: Date.now() - started,
  };
}
