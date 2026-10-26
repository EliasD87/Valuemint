import { Explore } from "./Explore";
import { exploreSummary } from "@/lib/exploreSummary";
import { frontSnapshot } from "@/lib/frontSnapshot";

/**
 * Explore, with the market's figures baked in (2026-10-09).
 *
 * The page itself is the client component in `./Explore.tsx`. This wrapper
 * asks the index on the server for two things and hands them over, so they
 * arrive in the first HTML: the figures (lib/exploreSummary.ts), and since
 * 2026-10-25 the first screen's listings, their artwork and the mint list
 * (lib/frontSnapshot.ts), so the page draws pieces for sale without waiting
 * for the browser to read the chain.
 *
 * Rebuilt at most every thirty minutes (2026-10-18; it was five). Each rebuild
 * reads every sale ever made from Supabase, ~750 KB and growing, and at twelve
 * an hour that alone was most of the free plan's 5 GB monthly egress. The
 * figures are 24h and all-time totals; half an hour stale costs nothing. The
 * listings are replaced by the live order book in the browser as soon as it
 * lands, so their age is only ever the first few seconds' worth.
 *
 * If the index cannot be reached when the page is built, it renders without
 * them and the browser reads for itself instead.
 */
export const revalidate = 1800;

export default async function Page() {
  const [summary, front] = await Promise.all([exploreSummary(), frontSnapshot()]);
  return <Explore summary={summary} front={front} />;
}
