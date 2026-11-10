"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * The Cybereators opened so far, as token ids (`/api/cybereator/opened`).
 *
 * `undefined` until the first answer — a filter must not read "nothing is
 * opened" before it has asked. Refreshed every 30 seconds while the page is
 * visible, so the Opened count climbs during the reveal without a reload.
 */
export function useCybereatorOpened(enabled: boolean): Set<string> | undefined {
  const { data } = useQuery({
    queryKey: ["cybereator-opened"],
    enabled,
    staleTime: 20_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: 1,
    queryFn: async (): Promise<string[]> => {
      const res = await fetch("/api/cybereator/opened");
      if (!res.ok) throw new Error(`opened ${res.status}`);
      const body = (await res.json()) as { ids?: unknown };
      return Array.isArray(body.ids) ? body.ids.map(String) : [];
    },
  });
  return useMemo(() => (data === undefined ? undefined : new Set(data)), [data]);
}

/** The three ways to look at Cybereator during its reveal. */
export type SealFilter = "all" | "opened" | "sealed";
