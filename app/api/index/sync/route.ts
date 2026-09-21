import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { indexConfigured } from "@/lib/supabase";
import { syncSeaport, type SyncResult } from "@/lib/indexSync";

/**
 * Advance the index.
 *
 * `POST /api/index/sync` with the shared secret. Reads whatever Seaport has
 * announced since the last run and writes it to Supabase.
 *
 * Nothing on the site waits for this. Every page that reads the index also
 * knows how to read the chain, so a run that fails, times out or never happens
 * costs speed and nothing else — which is the property that makes it safe to
 * run this on a schedule and not watch it.
 *
 * It is a POST because it writes. A GET that mutates gets fetched by link
 * prefetchers, preview crawlers and anything else that assumes GET is free.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * How long to keep going before handing back.
 *
 * A cold start has ~200,000 blocks to cover and `MAX_BLOCKS_PER_RUN` bounds one
 * pass, so several passes are needed. Looping inside one invocation is far
 * cheaper than several round trips — but it has to stop short of the platform's
 * own limit, or the work of the final pass is thrown away along with the
 * response that would have recorded it.
 */
const BUDGET_MS = 45_000;

/**
 * Constant time, because a plain `===` on a secret leaks it one byte at a time
 * to anyone who can measure the response.
 */
function secretMatches(given: string | null): boolean {
  const expected = process.env.INDEX_SYNC_SECRET ?? "";
  if (expected === "" || given === null) return false;

  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  /** `timingSafeEqual` throws on a length mismatch, which would itself be a signal. */
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  /**
   * Accepted from a header or the query string. Supabase's `pg_net` sends
   * headers comfortably; some schedulers only manage a URL.
   */
  const url = new URL(request.url);
  const given =
    request.headers.get("x-index-secret") ?? url.searchParams.get("secret");

  if (!secretMatches(given)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  /**
   * A missing config is a state, not a failure — the site is simply reading the
   * chain today. Saying so plainly is what stops somebody debugging an
   * "outage" that is a blank environment variable.
   */
  if (!indexConfigured()) {
    return NextResponse.json(
      { error: "index not configured", hint: "SUPABASE_URL and SUPABASE_SERVICE_KEY are unset" },
      { status: 503 },
    );
  }

  const started = Date.now();
  const passes: SyncResult[] = [];

  try {
    for (;;) {
      const result = await syncSeaport();
      passes.push(result);
      if (result.done) break;
      if (Date.now() - started > BUDGET_MS) break;
    }
  } catch (err) {
    /**
     * Report what did land before the failure. The cursor only moves after a
     * pass has fully written, so a half-finished run is re-read next time
     * rather than skipped — but a caller still deserves to know it happened.
     */
    console.error("[index] sync failed", err);
    return NextResponse.json(
      {
        error: "sync failed",
        message: err instanceof Error ? err.message : "unknown",
        passes,
      },
      { status: 502 },
    );
  }

  const last = passes[passes.length - 1];
  return NextResponse.json({
    ok: true,
    passes: passes.length,
    head: last?.head ?? 0,
    indexed: last?.to ?? 0,
    behind: (last?.head ?? 0) - (last?.to ?? 0),
    done: last?.done ?? false,
    orders: passes.reduce((n, p) => n + p.orders, 0),
    counters: passes.reduce((n, p) => n + p.counters, 0),
    filled: passes.reduce((n, p) => n + p.filled, 0),
    cancelled: passes.reduce((n, p) => n + p.cancelled, 0),
    ms: Date.now() - started,
  });
}
