import { NextResponse } from "next/server";
import { indexConfigured, select } from "@/lib/supabase";
import { CURSOR } from "@/lib/indexSync";

/**
 * Is the index alive?
 *
 * `GET /api/index/health` → one small object saying how far behind the reader
 * is and whether the site is still trusting it.
 *
 * ---
 *
 * **Why a route rather than a dashboard.**
 *
 * The index stopped for four and three quarter hours on 2026-09-22 and the
 * only way anyone could have found out was to notice the site felt slower.
 * Every page had fallen back to scanning the chain and rendered correctly, so
 * there was nothing to see and nothing logged — the fallback did its job and
 * hid the failure while doing it.
 *
 * Working out whether the index was alive took reading `indexedAt` out of the
 * order-book payload and doing the subtraction by hand. That is a thing to
 * remember how to do at the moment you least want to. This answers it in one
 * request, and it is the shape an uptime monitor wants: a status word and a
 * number.
 *
 * ---
 *
 * **It carries nothing private.** Every field here is either already in
 * `/api/index/orders` or is public chain state. No secret, no key, no row
 * count that says anything a visitor could not count themselves.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The same 180 seconds the client uses to decide whether to trust the index.
 *
 * Deliberately the same number and not a second opinion: this route's job is
 * to report what the site is actually doing, so if it disagreed with the
 * pages it would be worse than useless.
 */
const STALE_MS = 180_000;

/** Past this, nothing is coming back on its own. Matches lib/indexHeal.ts. */
const COLD_MS = 240_000;

interface CursorRow {
  last_block: number;
  updated_at: string;
}

export async function GET(): Promise<NextResponse> {
  if (!indexConfigured()) {
    /**
     * 200, not an error. A build with no index is a supported configuration —
     * the site reads the chain, exactly as it did before any of this existed.
     * A monitor pointed at this should not page anyone for it.
     */
    return NextResponse.json({
      status: "not-configured",
      healthy: true,
      detail: "No index is configured. The site reads the chain directly.",
    });
  }

  try {
    const rows = await select<CursorRow>(
      `index_cursor?name=eq.${CURSOR}&select=last_block,updated_at&limit=1`,
    );
    const cursor = rows[0];

    if (cursor === undefined) {
      return NextResponse.json({
        status: "never-run",
        healthy: false,
        detail: "The index is configured but has never committed a block.",
      });
    }

    const ageMs = Date.now() - new Date(cursor.updated_at).getTime();
    const age = Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null;

    /**
     * Three states, because two would hide the one that matters.
     *
     * "fresh" and "stale" alone would put a reader that is four seconds late
     * in the same bucket as one that stopped this morning. The middle state is
     * the site having stopped trusting the index while the scheduler is
     * probably still there; "cold" is the scheduler being gone.
     */
    const status =
      age === null ? "unknown" : age * 1000 <= STALE_MS ? "fresh" : age * 1000 <= COLD_MS ? "stale" : "cold";

    return NextResponse.json(
      {
        status,
        /** False only when the site has stopped using the index at all. */
        healthy: status === "fresh",
        ageSeconds: age,
        indexedBlock: cursor.last_block,
        indexedAt: cursor.updated_at,
        detail:
          status === "fresh"
            ? "The index is current and the site is using it."
            : status === "stale"
              ? "The site has fallen back to reading the chain. Pages still work, slower."
              : status === "cold"
                ? "Nothing has advanced the index for minutes. Check pg_cron — see supabase/diagnose.sql."
                : "The cursor's timestamp could not be read.",
      },
      {
        headers: {
          /**
           * Ten seconds. Short enough that somebody refreshing after a fix sees
           * it, long enough that a monitor polling every few seconds does not
           * reach Supabase on every call.
           */
          "cache-control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (err) {
    console.error("[index] health failed", err);
    /**
     * 503 and healthy: false. The database itself did not answer, which is a
     * worse failure than a stale cursor and must not read as one.
     */
    return NextResponse.json(
      {
        status: "unreachable",
        healthy: false,
        detail: "The index database did not answer.",
      },
      { status: 503 },
    );
  }
}
