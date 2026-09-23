"use client";

import { useQuery } from "@tanstack/react-query";
import { SOSO_PRICE_URL, parseSosoUsd } from "@/lib/usd";

/**
 * SOSO's price in dollars, or `undefined` while unknown.
 *
 * Unknown is a normal state, not an error: the free API rate-limits, and a
 * blocked or slow answer must cost the page nothing but the dollar figure.
 * One retry, a short timeout, and no timer — a minute of staleness cannot
 * matter to a figure shown beside a balance, and coming back to the tab
 * refreshes it.
 */
export function useSosoPrice(): number | undefined {
  const { data } = useQuery({
    queryKey: ["soso-usd"],
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<number | null> => {
      const res = await fetch(SOSO_PRICE_URL, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`Price source returned ${res.status}`);
      /* null, not undefined: react-query refuses `undefined` as data. */
      return parseSosoUsd(await res.json()) ?? null;
    },
  });
  return data ?? undefined;
}
