import { Explore } from "./Explore";
import { exploreSummary } from "@/lib/exploreSummary";

/**
 * Explore, with the market's figures baked in (2026-10-09).
 *
 * The page itself is the client component in `./Explore.tsx`, unchanged in
 * how it loads: nothing on it waits on the chain. This wrapper only asks the
 * index for the figures (lib/exploreSummary.ts) on the server and hands them
 * over, so they arrive in the first HTML. Rebuilt at most every thirty
 * minutes (2026-10-18; it was five). Each rebuild reads every sale ever made
 * from Supabase, ~750 KB and growing, and at twelve an hour that alone was
 * most of the free plan's 5 GB monthly egress. The figures are 24h and
 * all-time totals; half an hour stale costs nothing.
 *
 * If the index cannot be reached when the page is built, it renders without
 * them and the browser asks `/api/index/summary` once instead.
 */
export const revalidate = 1800;

export default async function Page() {
  const summary = await exploreSummary();
  return <Explore summary={summary} />;
}
