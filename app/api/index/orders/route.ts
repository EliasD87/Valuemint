import { NextResponse } from "next/server";
import { indexConfigured, select } from "@/lib/supabase";
import { CURSOR } from "@/lib/indexSync";
import type { JsonOrderParameters } from "@/lib/indexRows";

/**
 * The order book, without making the visitor scan for it.
 *
 * `GET /api/index/orders` → the same `OrderValidated` events a browser used to
 * walk eleven `eth_getLogs` to collect, and which grows by about two more
 * requests a day for as long as the chain keeps mining.
 *
 * ---
 *
 * **This route replaces the scan and nothing else.** It hands back order
 * parameters and block numbers — no prices, no fillability, no opinion about
 * whether an order is any good. The client still asks Seaport `getOrderStatus`
 * for every one of them, still reads `ownerOf` and the approval, still derives
 * the price from the parameters with `readOrder`. So an index that is wrong,
 * stale, or replaced by an attacker can only ever cause an order to be *shown*
 * or *missed*, never mispriced and never filled on worse terms than the wallet
 * displays.
 *
 * That is the whole reason it is safe to put a database in front of a
 * marketplace: the database is not permitted an opinion about anything that
 * settles.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The most orders one response may carry.
 *
 * `validate()` is permissionless and costs a fraction of a cent here, so the
 * set is attacker-controlled — the same reasoning as `MAX_CANDIDATE_ORDERS` in
 * `useSeaportOrders`, and deliberately the same number. Capping here as well
 * means a flood costs bandwidth rather than being paid for twice.
 */
const MAX_ORDERS = 2_000;

interface OrderRowOut {
  order_hash: string;
  params: JsonOrderParameters;
  block_number: number;
}

interface CounterRowOut {
  offerer: string;
  voided_after_block: number;
}

interface CursorRowOut {
  last_block: number;
  updated_at: string;
}

export async function GET(): Promise<NextResponse> {
  /**
   * Not an error. A build with no index reads the chain, which is what the
   * site did before this route existed and what it will do again the moment
   * anyone unsets the variable. 503 rather than 200-with-empty so a caller
   * cannot mistake "no index" for "no orders" — that mistake would render an
   * empty market over a full order book.
   */
  if (!indexConfigured()) {
    return NextResponse.json({ error: "index not configured" }, { status: 503 });
  }

  try {
    const [orders, counters, cursor] = await Promise.all([
      select<OrderRowOut>(
        `orders?select=order_hash,params,block_number&status=eq.open` +
          `&order=block_number.desc&limit=${MAX_ORDERS}`,
      ),
      select<CounterRowOut>(`counters?select=offerer,voided_after_block&limit=5000`),
      select<CursorRowOut>(`index_cursor?name=eq.${CURSOR}&select=last_block,updated_at&limit=1`),
    ]);

    const head = cursor[0];

    return NextResponse.json(
      {
        orders: orders.map((o) => ({
          hash: o.order_hash,
          params: o.params,
          blockNumber: o.block_number,
        })),
        counters: counters.map((c) => ({
          offerer: c.offerer,
          blockNumber: c.voided_after_block,
        })),
        /**
         * When the reader last committed, so the client can decide for itself
         * whether to trust this.
         *
         * A timestamp rather than a block lag, because the alternative costs an
         * `eth_blockNumber` on the server to have anything to compare against —
         * and the client is about to talk to the chain regardless. Wall clock is
         * free and answers the only question that matters: has the reader
         * stopped?
         */
        indexedBlock: head?.last_block ?? 0,
        indexedAt: head?.updated_at ?? null,
      },
      {
        headers: {
          /**
           * Fifteen seconds at the edge, and a minute of serving the old copy
           * while a new one is fetched. The reader runs every thirty, so this
           * never serves anything the chain path would not also have been
           * holding — and a thousand visitors cost Supabase four requests a
           * minute rather than a thousand.
           */
          "cache-control": "public, s-maxage=15, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    console.error("[index] orders failed", err);
    /**
     * 502 rather than an empty list, for the same reason as the 503 above: the
     * client must be able to tell "the index is down" from "nobody is selling
     * anything", because only one of those means fall back to the chain.
     */
    return NextResponse.json({ error: "index unavailable" }, { status: 502 });
  }
}
