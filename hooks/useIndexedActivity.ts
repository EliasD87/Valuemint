"use client";

import { useQuery } from "@tanstack/react-query";
import { indexLagMs } from "@/lib/indexLag";
import type { ActivityStreams } from "@/lib/activityRows";
import { decodeIndexedEvents, type IndexedEvent } from "@/lib/indexEvents";

/**
 * Trade history from the index, when there is one.
 *
 * `useActivity` ran three log scans from Seaport's deployment block, on every
 * page carrying a history panel — which is the market, every collection and
 * every token. Those three were also the scans that made the order-book index
 * look free: the order book stopped scanning and the page kept doing it anyway,
 * for the panel below the fold.
 *
 * The events come back raw, decoded here into exactly the shape the scanned
 * logs have, and handed to the same `buildActivityRows`. So `readFulfilment`
 * still decides what a sale is and still refuses a settlement currency it does
 * not recognise, on this path as on the other.
 */

/** Matches the order book's tolerance, and for the same reasons. */
const STALE_MS = 180_000;


interface Payload {
  events: IndexedEvent[];
  indexedAt: string | null;
  servedAt?: string;
}

/**
 * What to narrow by, and what deliberately is not here.
 *
 * `tokenId` is missing on purpose. A token page and its collection page would
 * otherwise be different queries, and so would every card on a collection page
 * wanting a last-sale figure — sixty requests where one would do. Narrowing to
 * a collection is what shrinks the payload; narrowing to a token inside it
 * saves nothing worth a second round trip, so that stays in the browser.
 */
export interface ActivityFilter {
  collection?: `0x${string}`;
  wallet?: `0x${string}`;
  salesOnly?: boolean;
}

function queryFor(filter: ActivityFilter): string {
  const params = new URLSearchParams();
  if (filter.collection !== undefined) params.set("collection", filter.collection.toLowerCase());
  if (filter.wallet !== undefined) params.set("wallet", filter.wallet.toLowerCase());
  if (filter.salesOnly === true) params.set("sales", "1");
  const query = params.toString();
  return query === "" ? "/api/index/activity" : `/api/index/activity?${query}`;
}

/** `null` means there is no usable index and the chain should be read instead. */
async function fetchActivity(filter: ActivityFilter): Promise<ActivityStreams | null> {
  const response = await fetch(queryFor(filter), { cache: "no-store" });
  if (!response.ok) return null;

  const payload = (await response.json()) as Payload;
  if (payload.indexedAt === null) return null;

  const lag = indexLagMs(payload);
  if (!Number.isFinite(lag) || lag > STALE_MS) return null;

  /** The same decoder the server's Explore summary uses (lib/indexEvents.ts). */
  return decodeIndexedEvents(payload.events);
}


export function useIndexedActivity(filter: ActivityFilter, enabled = true) {
  const { data, isLoading, isError } = useQuery({
    /**
     * Keyed by exactly what narrows the request, so two panels asking the same
     * question share one answer — the collection page's feed and every card on
     * it, for instance.
     */
    queryKey: [
      "indexed-activity",
      filter.collection?.toLowerCase() ?? null,
      filter.wallet?.toLowerCase() ?? null,
      filter.salesOnly === true,
    ],
    enabled,
    /**
     * The same one-minute staleness the scanned query uses, so swapping source
     * does not change how often anything refreshes.
     */
    staleTime: 60_000,
    retry: 1,
    queryFn: () => fetchActivity(filter),
  });

  return {
    streams: data ?? undefined,
    isLoading,
    unavailable: isError || data === null,
  };
}
