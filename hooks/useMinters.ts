"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Wallets that have minted on ValueMint, with the block of each one's latest
 * mint (`/api/stats/minters`, lib/minters.ts).
 *
 * Its own query, so the stats page renders from the order index as before and
 * the wallet count simply grows when this lands. A failure leaves the count as
 * it was — the marketplace wallets alone — rather than blanking anything.
 */
export function useMinters() {
  const { data } = useQuery({
    queryKey: ["stats-minters"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<Array<[string, number]>> => {
      const res = await fetch("/api/stats/minters");
      if (!res.ok) throw new Error(`minters ${res.status}`);
      const body = (await res.json()) as { minters?: Array<[string, number]> };
      return body.minters ?? [];
    },
  });
  return data;
}
