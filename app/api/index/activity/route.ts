import { NextResponse } from "next/server";
import { indexConfigured, select, selectAll } from "@/lib/supabase";
import { CURSOR } from "@/lib/indexSync";
import type { JsonEventArgs } from "@/lib/indexRows";

/**
 * Trade history, without making the visitor scan for it.
 *
 * `GET /api/index/activity?collection=0x…&sales=1&wallet=0x…` → the events
 * that query asks for, newest first. It replaces three whole log scans:
 * `useActivity` walked `OrderFulfilled`, `OrderValidated` and `OrderCancelled`
 * from Seaport's deployment block on every page that showed a history panel,
 * which is nearly all of them.
 *
 * **Narrowed here, not in the browser.** The first version sent everything and
 * let the page filter: 221 events was 232 KB, 24.5 KB compressed, and at the
 * 2,000-row cap it would have been roughly 220 KB compressed — sent to every
 * visitor of every collection page to render a panel of ten rows. Postgres has
 * the indexes; asking it is free and sending it is not.
 *
 * ---
 *
 * **This one is more trusted than the order book, and that is worth stating.**
 *
 * A listing from the index still faces Seaport before anyone can act on it, so
 * a wrong row costs a rejected check. History faces nothing — it is read and
 * displayed. A fabricated sale here would show as a real one.
 *
 * Three things bound that. The rows are written only by this project's own sync
 * route, from chain logs, with the service key that never leaves the server.
 * The events are stored raw, so `readFulfilment` still runs on the client and
 * still refuses settlement currencies it does not recognise — which is the
 * control that stops a wash trade in a worthless token reading as "last sale
 * 1,000,000". And `npm run index:check` can put any row back to the chain.
 *
 * What none of that gives is proof, and the honest description of this route is
 * that it is display data from a database rather than from the chain. A price
 * anyone is about to act on comes from the order book, which is checked.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The most events one response may carry.
 *
 * `useActivity` already caps its own feed at 2,000 rows for exactly the reason
 * that matters here: `OrderValidated` is free for anyone to emit and
 * `validate(Order[])` takes an array, so thousands can land in one transaction.
 * The same number, so the page cannot be handed more than it will keep.
 */
const MAX_EVENTS = 2_000;

/** Lower-cased, and refused outright if it is not an address. */
function address(raw: string | null): string | undefined {
  if (raw === null) return undefined;
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
function digits(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const value = raw.trim();
  return /^[0-9]{1,78}$/.test(value) ? value : undefined;
}

interface EventOut {
  tx_hash: string;
  log_index: number;
  kind: "fulfilled" | "validated" | "cancelled";
  order_hash: string | null;
  block_number: number;
  args: JsonEventArgs;
  /** Filter keys, passed through so a cancellation can name its own piece. */
  collection: string | null;
  token_id: string | null;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!indexConfigured()) {
    return NextResponse.json({ error: "index not configured" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const collection = address(params.get("collection"));
  const wallet = address(params.get("wallet"));
  const token = digits(params.get("token"));
  const salesOnly = params.get("sales") === "1";

  const filters: string[] = [];
  if (collection !== undefined) filters.push(`collection=eq.${collection}`);
  if (token !== undefined) filters.push(`token_id=eq.${token}`);
  if (salesOnly) filters.push("kind=eq.fulfilled");
  /** Either side: a listing you made and a purchase you made are both yours. */
  if (wallet !== undefined) filters.push(`or=(maker.eq.${wallet},taker.eq.${wallet})`);

  try {
    const [events, cursor] = await Promise.all([
      /** Paged: the server's own 1,000-row cap would otherwise truncate history. */
      selectAll<EventOut>(
        `events?select=tx_hash,log_index,kind,order_hash,block_number,args,collection,token_id` +
          `${filters.map((f) => `&${f}`).join("")}` +
          `&order=block_number.desc,log_index.desc`,
      ).then((rows) => rows.slice(0, MAX_EVENTS)),
      select<{ updated_at: string }>(
        `index_cursor?name=eq.${CURSOR}&select=updated_at&limit=1`,
      ),
    ]);

    return NextResponse.json(
      { events, indexedAt: cursor[0]?.updated_at ?? null },
      {
        headers: {
          /**
           * Longer than the order book's fifteen seconds. History is the one
           * thing on the page nobody is refreshing to watch — a sale that
           * appears a minute late has cost no one anything, and the panel was
           * already held back 900ms behind first paint for the same reason.
           */
          "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    console.error("[index] activity failed", err);
    return NextResponse.json({ error: "index unavailable" }, { status: 502 });
  }
}
