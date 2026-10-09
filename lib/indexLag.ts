/**
 * How far behind the index was when the server answered (2026-10-09).
 *
 * Both index routes are cached at Vercel's edge, and the activity route serves
 * a copy up to six minutes old while it fetches the next. The pages used to
 * measure `indexedAt` against the visitor's own clock, so a perfectly healthy
 * index read as stale whenever the edge handed over an old copy. The page then
 * threw the index away and scanned the chain instead, which reaches back only
 * as far as the order book's window and stops at 2,000 rows: the stats page
 * showed about 11k SOSO settled instead of the real total, until a refresh got
 * a fresh copy.
 *
 * `servedAt` is stamped by the route when it builds the response, and both
 * timestamps come from servers. So this answers the question the check exists
 * for, "had the reader stopped?", whatever the edge did afterwards and however
 * wrong the visitor's clock is. How old a cached copy may get is the route's
 * `cache-control` to bound, not this.
 *
 * A response without `servedAt`, from before this shipped and still at the
 * edge, is measured the old way.
 */
export function indexLagMs(
  payload: { indexedAt: string | null; servedAt?: string },
  now: number = Date.now(),
): number {
  if (payload.indexedAt === null) return Number.POSITIVE_INFINITY;
  const at = payload.servedAt === undefined ? now : new Date(payload.servedAt).getTime();
  return at - new Date(payload.indexedAt).getTime();
}
