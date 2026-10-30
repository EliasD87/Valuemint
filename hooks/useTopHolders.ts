"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTopHolders, type Holder } from "@/lib/topHolders";

export type { Holder } from "@/lib/topHolders";

/**
 * Who holds the most of one collection.
 *
 * From the explorer rather than the chain, and that is the whole design
 * decision. There is no contract call for "who owns the most": answering it
 * on chain means reading `ownerOf` for every token and counting, which for
 * Cybereator is 2,968 reads a visitor would pay for to see ten rows. The
 * explorer already maintains this index for its own pages.
 *
 * The cost is a dependency on somebody else's uptime, which is why a failure
 * here says so rather than rendering an empty list. "Nobody holds this" and
 * "we could not find out who holds this" are different claims and only one of
 * them is ever true after a refused request.
 *
 * **It will not work on localhost.** The explorer sends no CORS headers for
 * this origin, so every call from a dev machine fails — the same reason
 * collection discovery is always short in development. That is the environment,
 * not a bug, and the panel says the honest thing when it happens.
 */

export function useTopHolders(collection: `0x${string}` | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ["top-holders", collection?.toLowerCase() ?? null],
    enabled: enabled && collection !== undefined,
    /**
     * Holders move when pieces trade, which is not often and never urgently.
     * Five minutes is far fresher than anybody reading a leaderboard needs.
     */
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => fetchTopHolders(collection!),
  });

  return {
    holders: query.data ?? [],
    isLoading: query.isLoading,
    /**
     * True once we know the list could not be read. Distinct from an empty
     * list, which means it was read and nobody holds anything.
     */
    unavailable: query.isError,
  };
}
