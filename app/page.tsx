import { Explore } from "./Explore";
import { exploreSummary } from "@/lib/exploreSummary";

/**
 * Explore, with the market's figures baked in (2026-10-09).
 *
 * The page itself is the client component in `./Explore.tsx`, unchanged in
 * how it loads: nothing on it waits on the chain. This wrapper only asks the
 * index for the figures (lib/exploreSummary.ts) on the server and hands them
 * over, so they arrive in the first HTML. Rebuilt at most every five minutes,
 * which is as fresh as the floor snapshots it reads.
 *
 * If the index cannot be reached when the page is built, it renders without
 * them and the browser asks `/api/index/summary` once instead.
 */
export const revalidate = 300;

export default async function Page() {
  const summary = await exploreSummary();
  return <Explore summary={summary} />;
}
