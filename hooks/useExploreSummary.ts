"use client";

import { useQuery } from "@tanstack/react-query";
import type { ExploreSummary } from "@/lib/exploreTypes";

/**
 * The Explore figures: the ones baked into the page, or one request for them.
 *
 * Normally the page arrives with them (app/page.tsx) and this asks for
 * nothing. Only a page rendered while the index was unreachable fetches
 * `/api/index/summary`, once, and that answer is cached at the edge.
 */
export function useExploreSummary(initial: ExploreSummary | undefined): ExploreSummary | undefined {
  const { data } = useQuery({
    queryKey: ["explore-summary"],
    enabled: initial === undefined,
    staleTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<ExploreSummary | null> => {
      const response = await fetch("/api/index/summary");
      return response.ok ? ((await response.json()) as ExploreSummary) : null;
    },
  });
  return initial ?? data ?? undefined;
}
