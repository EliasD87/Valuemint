import "server-only";
import type { Hex } from "viem";
import { indexConfigured, select, selectAll } from "@/lib/supabase";
import { indexClient } from "@/lib/indexSync";
import { decodeParams, type JsonOrderParameters } from "@/lib/indexRows";
import { checkOrders, decodeChecks, fillabilityQuestions, type CheckTarget } from "@/lib/orderChecks";
import { isExpired, readOrder, resolveFillable } from "@/lib/seaport";
import { decodeRows, type ActivityWire } from "@/lib/activityWire";
import { BLOCKS_PER_DAY } from "@/config/chain";

/**
 * A collection page's figures, worked out on the server.
 *
 * The page used to show its floor, listed count and volumes only after its
 * JavaScript had loaded, fetched the whole marketplace's order book and history,
 * and checked every order against the chain: two seconds on a good day, twenty
 * when the index was down. These are the same figures computed before the page
 * is sent, so they are on it from the first paint (`CollectionFiguresSeed`).
 *
 * **The same rules as the browser, not a cheaper approximation of them.** A
 * listing counts only if Seaport still reports it validated, not cancelled and
 * not filled; it has not expired; its maker has not incremented their counter
 * past it; and the seller still owns the piece and has approved Seaport —
 * `resolveFillable`, the tested rule the browser applies. The index's own
 * `collection_floors` view checks none of the last three, and on 2026-10-30 it
 * counted 376 Treasure Boxes listed where 165 could actually be bought.
 *
 * Nothing is bought on these. They are what the page draws until the browser's
 * own reads land and replace them; the fill path checks the chain again first.
 */

export interface CollectionFiguresSeed {
  /** Cheapest fillable listing, wei as decimal; absent when nothing can be bought. */
  floorWei?: string;
  /** Distinct pieces with a fillable listing. */
  listed?: number;
  volumeDayWei?: string;
  volumeTotalWei?: string;
}

/** The most listings one collection's check may cover; the order route's cap. */
const MAX_LISTINGS = 2_000;

interface OrderRow {
  order_hash: string;
  params: JsonOrderParameters;
  block_number: number;
}

interface CounterRow {
  offerer: string;
  voided_after_block: number;
}

/** Floor and listed count, or `undefined` when the index or the chain cannot say. */
export async function floorFor(collection: string): Promise<Pick<CollectionFiguresSeed, "floorWei" | "listed"> | undefined> {
  if (!indexConfigured()) return undefined;
  const address = collection.toLowerCase();

  const [rows, counters] = await Promise.all([
    selectAll<OrderRow>(
      `orders?select=order_hash,params,block_number&status=eq.open&side=eq.listing` +
        `&collection=eq.${address}&order=block_number.desc`,
      1000,
      MAX_LISTINGS,
    ),
    selectAll<CounterRow>(`counters?select=offerer,voided_after_block`),
  ]);

  const targets: Array<CheckTarget & { blockNumber: bigint }> = [];
  for (const row of rows.slice(0, MAX_LISTINGS)) {
    try {
      const params = decodeParams(row.params);
      const read = readOrder(params);
      if (read === undefined || read.kind !== "listing" || read.tokenId === undefined) continue;
      if (read.collection.toLowerCase() !== address) continue;
      targets.push({ hash: row.order_hash as Hex, params, read, blockNumber: BigInt(row.block_number) });
    } catch {
      /* A row this build cannot decode is a row it does not price, here as in the browser. */
    }
  }
  if (targets.length === 0) return { listed: 0 };

  const checks = decodeChecks(await checkOrders(indexClient(), targets));
  if (checks === undefined) return undefined;

  const voidedAfter = new Map(counters.map((c) => [c.offerer.toLowerCase(), BigInt(c.voided_after_block)]));
  const questions = fillabilityQuestions(targets);
  const now = Math.floor(Date.now() / 1000);
  const best = new Map<string, bigint>();

  for (const t of targets) {
    const status = checks.status.get(t.hash.toLowerCase());
    if (status === undefined) continue;
    const [validated, cancelled, filled, size] = status;
    if (!validated || cancelled) continue;
    if (size > 0n && filled >= size) continue;
    if (isExpired(t.read.endTime, now)) continue;
    const voided = voidedAfter.get(t.read.maker.toLowerCase());
    if (voided !== undefined && voided >= t.blockNumber) continue;

    const slot = questions.slots.get(t.hash.toLowerCase());
    if (slot === undefined) continue;
    const first = checks.reads.get(questions.keys[slot[0]]!);
    const second = checks.reads.get(questions.keys[slot[1]]!);
    if (!resolveFillable({ ...t.read, params: t.params }, { first, second })) continue;

    const key = t.read.tokenId!.toString();
    const current = best.get(key);
    if (current === undefined || t.read.priceWei < current) best.set(key, t.read.priceWei);
  }

  let floor: bigint | undefined;
  for (const price of best.values()) if (floor === undefined || price < floor) floor = price;
  return { ...(floor === undefined ? {} : { floorWei: floor.toString() }), listed: best.size };
}

/**
 * Volumes from the collection's history, the same arithmetic as
 * `useCollectionStats`: price each times units, and a day measured in blocks.
 */
export function volumesFrom(wire: ActivityWire, head: bigint): Pick<CollectionFiguresSeed, "volumeDayWei" | "volumeTotalWei"> {
  const from = head > BigInt(BLOCKS_PER_DAY) ? head - BigInt(BLOCKS_PER_DAY) : 0n;
  let day = 0n;
  let total = 0n;
  for (const row of decodeRows(wire.rows)) {
    if (row.kind !== "sale") continue;
    const value = (row.price ?? 0n) * row.amount;
    total += value;
    if (row.blockNumber >= from) day += value;
  }
  return { volumeDayWei: day.toString(), volumeTotalWei: total.toString() };
}

/** The index's head block, for `volumesFrom`. */
export async function indexedHead(): Promise<bigint | undefined> {
  const rows = await select<{ last_block: number }>(`index_cursor?select=last_block&order=last_block.desc&limit=1`);
  return rows[0] === undefined ? undefined : BigInt(rows[0].last_block);
}
