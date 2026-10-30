"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { indexLagMs } from "@/lib/indexLag";
import type { ActivityRow } from "@/lib/activityRows";
import { activityQueryKey, decodeRows, type ActivityWire } from "@/lib/activityWire";

/**
 * Trade history from the index, when there is one.
 *
 * `useActivity` ran three log scans from Seaport's deployment block, on every
 * page carrying a history panel — which is the market, every collection and
 * every token. Those three were also the scans that made the order-book index
 * look free: the order book stopped scanning and the page kept doing it anyway,
 * for the panel below the fold.
 *
 * The rows arrive decoded (lib/activityWire.ts): the server runs the same
 * `buildActivityRows`, so `readFulfilment` still decides what a sale is and
 * still refuses a settlement currency it does not recognise. Until 2026-10-30
 * the raw events came here instead, 2.2 MB for the market-wide feed, and every
 * tab decoded them itself.
 */

/** Matches the order book's tolerance, and for the same reasons. */
export const ACTIVITY_STALE_MS = 180_000;

export type { ActivityFilter } from "@/lib/activityWire";
import type { ActivityFilter } from "@/lib/activityWire";

function queryFor(filter: ActivityFilter): string {
  const params = new URLSearchParams({ format: "rows" });
  if (filter.collection !== undefined) params.set("collection", filter.collection.toLowerCase());
  if (filter.wallet !== undefined) params.set("wallet", filter.wallet.toLowerCase());
  if (filter.salesOnly === true) params.set("sales", "1");
  return `/api/index/activity?${params.toString()}`;
}

/** `null` means there is no usable index and the chain should be read instead. */
async function fetchActivity(filter: ActivityFilter): Promise<ActivityWire | null> {
  const response = await fetch(queryFor(filter), { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json()) as ActivityWire;
  if (payload.indexedAt === null || !Array.isArray(payload.rows)) return null;
  const lag = indexLagMs(payload);
  if (!Number.isFinite(lag) || lag > ACTIVITY_STALE_MS) return null;
  return payload;
}

export function useIndexedActivity(filter: ActivityFilter, enabled = true) {
  const { data, isLoading, isError } = useQuery({
    /**
     * Keyed by exactly what narrows the request, so two panels asking the same
     * question share one answer — the collection page's feed and every card on
     * it, for instance.
     */
    queryKey: activityQueryKey(filter),
    enabled,
    /**
     * The same one-minute staleness the scanned query uses, so swapping source
     * does not change how often anything refreshes.
     */
    staleTime: 60_000,
    retry: 1,
    queryFn: () => fetchActivity(filter),
  });

  const rows = useMemo<ActivityRow[] | undefined>(
    () => (data === undefined || data === null ? undefined : decodeRows(data.rows)),
    [data],
  );

  return {
    rows,
    /** Not loading once there is an answer, whether fetched or handed over by the server. */
    isLoading: rows === undefined && isLoading,
    unavailable: isError || data === null,
  };
}
