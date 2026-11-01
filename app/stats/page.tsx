import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { activityForPage } from "@/lib/indexActivity";
import { activityQueryKey, type ActivityWire } from "@/lib/activityWire";
import { indexClient } from "@/lib/indexSync";
import { readNames } from "@/lib/exploreSummary";
import { mintersOnValueMint, type Minters } from "@/lib/minters";
import { siteUrl } from "@/lib/site";
import { StatsView, type StatsSeed } from "./StatsView";

/**
 * The stats page, with its figures already in it.
 *
 * Until 2026-10-30 this page arrived empty and spent four to six seconds in
 * front of every visitor reading 2.2 MB of raw events, decoding them, and
 * counting the six figures up from zero. Now the server reads the same rows
 * from the index, decoded, and hands them to the browser's cache under the keys
 * the page would have fetched them with — so the first paint is the finished
 * page, and the browser only refreshes it from there.
 *
 * Regenerated at most every 30 seconds, and only when someone asks. The
 * sync job advances the index every few seconds, so this is the staleness a
 * visitor can see before their own tab catches up, not the index's.
 */
export const revalidate = 30;

/** The same tolerance the browser applies before it trusts the index. */
const MAX_LAG_MS = 180_000;

/** How long the page waits on anything that is not the index before rendering without it. */
const SIDE_BUDGET_MS = 2_500;

/**
 * And on the index itself. Bounded too, because this page is also built at
 * deploy time, and a database that never answers must cost a slower first
 * visit rather than a failed deploy (a build attempt hung for 60 s here).
 */
const INDEX_BUDGET_MS = 8_000;

/**
 * Longer than the other side reads: the route is edge-cached but cold for its
 * first request after a deploy (3.6 s measured), and this page is rebuilt in
 * the background, so the wait is never a visitor's.
 */
const MINTERS_BUDGET_MS = 4_000;

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

export default async function StatsPage() {
  const [feed, sales, minters, head] = await Promise.all([
    within(activityForPage({}, MAX_LAG_MS), INDEX_BUDGET_MS),
    within(activityForPage({ salesOnly: true }, MAX_LAG_MS), INDEX_BUDGET_MS),
    mintersForPage(),
    within(indexClient().getBlockNumber(), SIDE_BUDGET_MS),
  ]);

  const client = new QueryClient();
  if (feed !== undefined) client.setQueryData(activityQueryKey({}), feed);
  if (sales !== undefined) client.setQueryData(activityQueryKey({ salesOnly: true }), sales);
  if (minters !== undefined) client.setQueryData(["stats-minters"], minters);

  const seed: StatsSeed = {
    ...(head === undefined ? {} : { head: head.toString() }),
    ...(await namesFor([feed, sales])),
  };

  return (
    <HydrationBoundary state={dehydrate(client)}>
      <StatsView seed={seed} />
    </HydrationBoundary>
  );
}

/** Every collection the rows mention, named in one call. A miss leaves short addresses. */
async function namesFor(wires: Array<ActivityWire | undefined>): Promise<Pick<StatsSeed, "names">> {
  const addresses = new Set<string>();
  for (const wire of wires) for (const row of wire?.rows ?? []) addresses.add(row[1].toLowerCase());
  if (addresses.size === 0) return {};
  const read = await within(readNames([...addresses]), SIDE_BUDGET_MS);
  if (read === undefined) return {};
  const names: Record<string, string> = {};
  for (const [address, { name }] of read) if (name !== undefined) names[address] = name;
  return { names };
}

/**
 * The wallets that minted here, for "wallets involved".
 *
 * From the site's own `/api/stats/minters`, which the edge holds for ten
 * minutes and serves stale for a day, so it answers at once. Asking
 * `mintersOnValueMint` directly meant a chain scan on any server that had not
 * run one yet, which lost the race nearly every time: the page then showed
 * the traders alone and the figure climbed when the minters landed.
 *
 * The scan itself remains the fallback, except at deploy time, where it would
 * outlive the race it loses and hold a build worker open.
 */
async function mintersForPage(): Promise<Minters["minters"] | undefined> {
  try {
    const res = await fetch(`${siteUrl()}/api/stats/minters`, {
      signal: AbortSignal.timeout(MINTERS_BUDGET_MS),
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const body = (await res.json()) as Partial<Minters>;
      if (Array.isArray(body.minters)) return body.minters;
    }
  } catch {
    /* Fall through to the scan. */
  }
  if (process.env.NEXT_PHASE === "phase-production-build") return undefined;
  return (await within(mintersOnValueMint(), SIDE_BUDGET_MS))?.minters;
}
