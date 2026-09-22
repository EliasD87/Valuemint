import "server-only";
import { syncSeaport } from "@/lib/indexSync";

/**
 * Advance the index when a read notices nobody else has.
 *
 * ---
 *
 * **Why this exists.**
 *
 * The index stopped on 2026-09-22 at 06:10:54 UTC and nobody found out for
 * four hours and forty-five minutes. Not one thing broke: every page noticed
 * the index was stale, fell back to scanning the chain, and rendered correctly
 * — which is exactly what the fallback was built to do, and exactly why the
 * failure was invisible. The site was simply slow again, the way it had been
 * before any of this existed.
 *
 * The cause was downstream of the app entirely. The sync route was healthy the
 * whole time (an unauthenticated POST answered 401 in 0.46s); what had stopped
 * was Supabase's scheduler calling it. One manual run closed a gap of 8,259
 * blocks in 4.6 seconds, so there was never a backlog — there was simply
 * nothing pulling the trigger.
 *
 * So the index now has a second way to advance that depends on nothing outside
 * this app: if a read finds the cursor cold, that read starts a sync. pg_cron
 * stays the primary and this is the backstop. Two independent mechanisms, and
 * the one that failed silently is no longer the only one.
 *
 * ---
 *
 * **Why this cannot stampede.**
 *
 * `/api/index/orders` is cached at the edge for 15 seconds with a 60-second
 * `stale-while-revalidate`, so the origin sees it at most about four times a
 * minute no matter how many people are on the site. That cache is the rate
 * limit, and it was already there. The in-flight flag below is a second guard
 * for the requests that do arrive together.
 *
 * The flag is per-lambda memory, which this project has been burned by before:
 * the rate limiter was bypassable under concurrency for exactly that reason.
 * The difference is what a miss costs. A missed rate limit let somebody past a
 * security control; a missed guard here runs a second copy of an idempotent
 * upsert. Concurrent syncs are safe by construction — every write is an upsert
 * keyed by something the chain assigned — so the guard is an efficiency, not a
 * correctness measure, and it is allowed to be imperfect.
 */

/**
 * How cold the cursor must be before a read will act on it.
 *
 * Deliberately longer than the client's own 180s staleness tolerance. Below
 * that the pages are still using the index and nothing is wrong; a sync fired
 * at 60s would be racing the scheduler that is doing its job.
 *
 * Above it, the scheduler has missed roughly eight runs in a row and is not
 * coming back on its own.
 */
const COLD_AFTER_MS = 240_000;

/**
 * The least time between two attempts from one instance.
 *
 * Stops a failing sync being retried on every request. If the route itself is
 * broken — bad credentials, an RPC that refuses — the right behaviour is to
 * fail quietly every few minutes, not on every page view.
 */
const RETRY_AFTER_MS = 120_000;

/** What one instance remembers between requests. */
export interface HealState {
  inFlight: boolean;
  /** When this instance last started a sync. 0 means never. */
  lastAttempt: number;
}

/**
 * Whether a cursor this old should trigger a repair.
 *
 * Pure, and takes its state as an argument rather than reading the module's.
 * That is the whole reason it is a separate function: this predicate decides
 * whether a production request starts a chain scan, and every branch of it —
 * the retry floor, a clock skew, an unreadable timestamp — needs to be
 * assertable without standing up an RPC to reject.
 *
 * `null` means the cursor has never been written. That is a brand new index,
 * which needs its first run as much as a stalled one needs its next.
 */
export function healDecision(
  indexedAt: string | null,
  state: HealState,
  now: number,
): boolean {
  if (state.inFlight) return false;
  if (now - state.lastAttempt < RETRY_AFTER_MS) return false;
  if (indexedAt === null) return true;

  const age = now - new Date(indexedAt).getTime();
  /**
   * An unparseable timestamp is not a reason to sync. It says something is
   * wrong with the row rather than with its age, and a chain scan is not the
   * fix for that — it would simply run on every request for as long as the bad
   * value sat there.
   */
  if (!Number.isFinite(age)) return false;
  return age > COLD_AFTER_MS;
}

const state: HealState = { inFlight: false, lastAttempt: 0 };

/**
 * Start a sync if the index has gone cold. Never throws, never blocks.
 *
 * The caller passes this to `after()` from `next/server`, so the work runs
 * once the response has been sent and Vercel keeps the function alive for it.
 * Without that the platform reclaims the instance the moment the response
 * returns, and a background sync would be killed partway — which is safe
 * (the watermark only moves after every write lands) but makes no progress,
 * so it would retry forever and never finish.
 */
export async function healIfCold(indexedAt: string | null): Promise<void> {
  if (!healDecision(indexedAt, state, Date.now())) return;

  state.inFlight = true;
  state.lastAttempt = Date.now();

  try {
    const result = await syncSeaport();
    /**
     * Logged at info, and worth keeping. This line appearing in the runtime
     * logs is the signal that the scheduler has stopped — the app repairing
     * itself is not a reason to stop noticing that something else broke.
     */
    console.info(
      `[index] self-heal ran: ${result.from}..${result.to}, ` +
        `${result.orders} orders, ${result.events} events, ${result.ms}ms` +
        (result.done ? "" : " (more to do)"),
    );
  } catch (err) {
    /**
     * Swallowed on purpose. This is a repair attempt on a cache, running after
     * a response that already went out — there is nobody left to tell, and an
     * unhandled rejection here would be an error in a request that succeeded.
     */
    console.error("[index] self-heal failed", err);
  } finally {
    state.inFlight = false;
  }
}
