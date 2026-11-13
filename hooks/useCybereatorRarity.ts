"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Every opened Cybereator's rarity by token id (`/api/cybereator/rarity`).
 *
 * `undefined` until it arrives: a rarity filter must wait for it rather than
 * show "nothing matches". Refreshed every minute, as pieces keep opening.
 */
export function useCybereatorRarity(enabled: boolean): Map<string, string> | undefined {
  const { data } = useQuery({
    queryKey: ["cybereator-rarity"],
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    retry: 2,
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await fetch("/api/cybereator/rarity");
      if (!res.ok) throw new Error(`rarity ${res.status}`);
      const body = (await res.json()) as { rarity?: Record<string, string> };
      return body.rarity ?? {};
    },
  });
  return useMemo(() => (data === undefined ? undefined : new Map(Object.entries(data))), [data]);
}
