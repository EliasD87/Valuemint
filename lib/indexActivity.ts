import "server-only";
import { indexConfigured, select, selectAll } from "@/lib/supabase";
import { CURSOR } from "@/lib/indexSync";
import { buildActivityRows } from "@/lib/activityRows";
import { decodeIndexedEvents, type IndexedEvent } from "@/lib/indexEvents";
import { encodeRows, type ActivityWire } from "@/lib/activityWire";

/**
 * Trade history out of the index, for the route and for server-rendered pages.
 *
 * One reader so the two cannot disagree: `/api/index/activity` answers the
 * browser, and a page that renders its figures on the server (the stats page,
 * the collection page) calls the same function and hands the result to the
 * browser's cache as if that request had already been made.
 */

/**
 * The most events one read may carry.
 *
 * `useActivity` caps its own feed at 2,000 rows for exactly the reason that
 * matters here: `OrderValidated` is free for anyone to emit and
 * `validate(Order[])` takes an array, so thousands can land in one transaction.
 * The same number, so the page cannot be handed more than it will keep.
 */
export const MAX_EVENTS = 2_000;

export interface ActivityQuery {
  /** Lower-case address. */
  collection?: string;
  /** Lower-case address; either side of the trade. */
  wallet?: string;
  /** Decimal digits. */
  token?: string;
  salesOnly?: boolean;
}

/** Lower-cased, and refused outright if it is not an address. */
export function asAddress(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  /**
   * Validated rather than escaped. These go into a PostgREST filter, and the
   * one thing that must not happen is a caller writing their own query — so the
   * shape is checked against what an address can be, and anything else is
   * simply not a filter.
   */
  return /^0x[0-9a-f]{40}$/.test(value) ? value : undefined;
}

/** A uint256 as decimal digits, or nothing. */
export function asDigits(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const value = raw.trim();
  return /^[0-9]{1,78}$/.test(value) ? value : undefined;
}

export interface IndexedHistory {
  events: IndexedEvent[];
  indexedAt: string | null;
}

/** The raw events, newest first, at most `MAX_EVENTS`. Throws when the index cannot be reached. */
export async function readIndexedEvents(query: ActivityQuery): Promise<IndexedHistory> {
  const filters: string[] = [];
  if (query.collection !== undefined) filters.push(`collection=eq.${query.collection}`);
  if (query.token !== undefined) filters.push(`token_id=eq.${query.token}`);
  if (query.salesOnly === true) filters.push("kind=eq.fulfilled");
  /** Either side: a listing you made and a purchase you made are both yours. */
  if (query.wallet !== undefined) filters.push(`or=(maker.eq.${query.wallet},taker.eq.${query.wallet})`);

  const [events, cursor] = await Promise.all([
    /**
     * Paged, because the server's own 1,000-row cap would otherwise truncate
     * history — and stopped at the cap. It used to read every event there was
     * and keep the newest 2,000, which on 2026-10-30 meant five sequential
     * pages of full order parameters for an answer that needed two: 7.5 s on
     * an edge miss.
     */
    selectAll<IndexedEvent>(
      `events?select=tx_hash,log_index,kind,order_hash,block_number,args,collection,token_id` +
        `${filters.map((f) => `&${f}`).join("")}` +
        `&order=block_number.desc,log_index.desc`,
      1000,
      MAX_EVENTS,
    ),
    select<{ updated_at: string }>(`index_cursor?name=eq.${CURSOR}&select=updated_at&limit=1`),
  ]);

  return { events: events.slice(0, MAX_EVENTS), indexedAt: cursor[0]?.updated_at ?? null };
}

/** The same history as decoded rows (lib/activityWire.ts). */
export async function readActivityWire(query: ActivityQuery): Promise<ActivityWire> {
  const { events, indexedAt } = await readIndexedEvents(query);
  const rows = buildActivityRows(decodeIndexedEvents(events)).slice(0, MAX_EVENTS);
  return { rows: encodeRows(rows), indexedAt, servedAt: new Date().toISOString() };
}

/**
 * For a server-rendered page: the rows, or `undefined` when there is no index,
 * it is unreachable, or it has stopped moving. The page then renders exactly as
 * it did before, and the browser asks for itself.
 */
export async function activityForPage(
  query: ActivityQuery,
  maxLagMs: number,
): Promise<ActivityWire | undefined> {
  if (!indexConfigured()) return undefined;
  try {
    const wire = await readActivityWire(query);
    if (wire.indexedAt === null) return undefined;
    const lag = Date.now() - Date.parse(wire.indexedAt);
    return Number.isFinite(lag) && lag <= maxLagMs ? wire : undefined;
  } catch (err) {
    console.error("[index] activity for page failed", err);
    return undefined;
  }
}
