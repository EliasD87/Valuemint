"use client";

import { useQuery } from "@tanstack/react-query";
import { decodeParams, type JsonEventArgs, type JsonOrderParameters } from "@/lib/indexRows";
import type { ActivityLog, ActivityStreams } from "@/lib/activityRows";

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

interface EventIn {
  tx_hash: string;
  log_index: number;
  kind: "fulfilled" | "validated" | "cancelled";
  order_hash: string | null;
  block_number: number;
  args: JsonEventArgs;
  collection: string | null;
  token_id: string | null;
}

interface Payload {
  events: EventIn[];
  indexedAt: string | null;
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

  const age = Date.now() - new Date(payload.indexedAt).getTime();
  if (!Number.isFinite(age) || age > STALE_MS) return null;

  const validated: ActivityLog[] = [];
  const fulfilled: ActivityLog[] = [];
  const cancelled: ActivityLog[] = [];

  for (const event of payload.events) {
    const args = event.args as Record<string, unknown>;

    /**
     * Rebuilt into the shape a scanned log has, bigints and all.
     *
     * Not a convenience: `buildActivityRows` hands these straight to
     * `readOrder` and `readFulfilment`, which compare and divide them. A string
     * where a bigint belongs does not throw there — `"10" > "9"` is false — it
     * quietly produces the wrong answer.
     */
    if (event.kind === "validated") {
      const params = args.orderParameters as JsonOrderParameters | undefined;
      if (params === undefined) continue;
      validated.push({
        args: { orderHash: args.orderHash, orderParameters: decodeParams(params) },
        blockNumber: BigInt(event.block_number),
        logIndex: event.log_index,
      });
      continue;
    }

    if (event.kind === "fulfilled") {
      fulfilled.push({
        args: {
          orderHash: args.orderHash,
          offerer: args.offerer,
          recipient: args.recipient,
          offer: (args.offer as SpentIn[] | undefined ?? []).map(spent),
          consideration: (args.consideration as ReceivedIn[] | undefined ?? []).map((i) => ({
            ...spent(i),
            recipient: i.recipient,
          })),
        },
        blockNumber: BigInt(event.block_number),
        logIndex: event.log_index,
      });
      continue;
    }

    cancelled.push({
      args: { orderHash: args.orderHash, offerer: args.offerer },
      blockNumber: BigInt(event.block_number),
      logIndex: event.log_index,
      /**
       * Resolved when the index wrote the row, so a narrowed query does not
       * lose its cancellations to a validation that fell outside the window.
       */
      collection: (event.collection ?? undefined) as `0x${string}` | undefined,
      tokenId: event.token_id === null ? undefined : BigInt(event.token_id),
    });
  }

  return { validated, fulfilled, cancelled };
}

interface SpentIn {
  itemType: number;
  token: string;
  identifier: string;
  amount: string;
}

interface ReceivedIn extends SpentIn {
  recipient: string;
}

const spent = (i: SpentIn) => ({
  itemType: i.itemType,
  token: i.token as `0x${string}`,
  identifier: BigInt(i.identifier),
  amount: BigInt(i.amount),
});

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
