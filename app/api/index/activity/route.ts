import { NextResponse } from "next/server";
import { indexConfigured } from "@/lib/supabase";
import { asAddress, asDigits, readActivityWire, readIndexedEvents } from "@/lib/indexActivity";

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
 * `readFulfilment` still runs on every row, in the browser for raw events and
 * here for decoded ones, and still refuses settlement currencies it does not recognise — which is the
 * control that stops a wash trade in a worthless token reading as "last sale
 * 1,000,000". And `npm run index:check` can put any row back to the chain.
 *
 * What none of that gives is proof, and the honest description of this route is
 * that it is display data from a database rather than from the chain. A price
 * anyone is about to act on comes from the order book, which is checked.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  if (!indexConfigured()) {
    return NextResponse.json({ error: "index not configured" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const query = {
    ...optional("collection", asAddress(params.get("collection"))),
    ...optional("wallet", asAddress(params.get("wallet"))),
    ...optional("token", asDigits(params.get("token"))),
    salesOnly: params.get("sales") === "1",
  };

  try {
    /**
     * `format=rows` is the current shape: decoded here, a tenth of the bytes,
     * nothing left for the tab to do (lib/activityWire.ts). The raw events stay
     * the default for a tab still running the build before it.
     */
    const body =
      params.get("format") === "rows"
        ? await readActivityWire(query)
        : { ...(await readIndexedEvents(query)), servedAt: new Date().toISOString() };

    return NextResponse.json(body, {
      headers: {
        /**
         * Longer than the order book's fifteen seconds. History is the one
         * thing on the page nobody is refreshing to watch — a sale that
         * appears a minute late has cost no one anything.
         */
        "cache-control": "public, s-maxage=60, stale-while-revalidate=1800",
      },
    });
  } catch (err) {
    console.error("[index] activity failed", err);
    return NextResponse.json({ error: "index unavailable" }, { status: 502 });
  }
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}
