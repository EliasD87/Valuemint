"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { decodeParams, type JsonOrderParameters } from "@/lib/indexRows";
import { readOrder, type OrderParameters, type ReadOrder } from "@/lib/seaport";

/**
 * The order book from the index, when there is one.
 *
 * This replaces a log scan and nothing else. What comes back is the same set of
 * `OrderValidated` announcements `useSeaportOrders` used to walk the chain for;
 * every check that decides whether an order is real, open, priced and fillable
 * still happens afterwards, against Seaport itself.
 *
 * So the index is not trusted, it is merely *asked*. The worst a wrong answer
 * can do is put an order in front of the status check that will reject it, or
 * leave one out that the chain would have shown. Neither can mislead a wallet,
 * because no price here ever reaches one: `readOrder` derives it from the
 * parameters, exactly as it does on the scanned path.
 */

/**
 * How stale the index may be before the chain is read instead.
 *
 * `indexedAt` advances on every successful pass whether or not anything new was
 * found, so it is a heartbeat rather than a record of activity — a quiet market
 * does not look like a stopped reader. At a thirty-second schedule, three
 * minutes is six missed runs: comfortably past jitter, well short of anyone
 * noticing a stale price.
 *
 * Falling back is cheap and silent. The chain path is the one that shipped and
 * it is still there, so a stopped reader costs the speed the index was buying
 * and nothing else.
 */
const STALE_MS = 180_000;

export interface IndexedCandidate {
  hash: Hex;
  params: OrderParameters;
  blockNumber: bigint;
  read: ReadOrder;
}

export interface IndexedBook {
  candidates: IndexedCandidate[];
  voidedAfter: Map<string, bigint>;
}

interface Payload {
  orders: Array<{ hash: string; params: JsonOrderParameters; blockNumber: number }>;
  counters: Array<{ offerer: string; blockNumber: number }>;
  indexedBlock: number;
  indexedAt: string | null;
}

/**
 * `null` means "there is no usable index" — not configured, unreachable, or
 * too far behind. It is distinct from `undefined`, which means the question has
 * not been answered yet, and the difference is what stops the page starting a
 * chain scan it may not need.
 */
async function fetchBook(): Promise<IndexedBook | null> {
  const response = await fetch("/api/index/orders", { cache: "no-store" });

  /**
   * 503 is "no index configured" and 502 is "the index is down". Both mean the
   * same thing here and neither is an error worth retrying or surfacing: the
   * chain path answers the question perfectly well.
   */
  if (!response.ok) return null;

  const payload = (await response.json()) as Payload;

  if (payload.indexedAt === null) return null;
  const age = Date.now() - new Date(payload.indexedAt).getTime();
  if (!Number.isFinite(age) || age > STALE_MS) {
    console.warn(`[order book] index is ${Math.round(age / 1000)}s stale; reading the chain.`);
    return null;
  }

  const candidates: IndexedCandidate[] = [];
  for (const order of payload.orders) {
    /**
     * Decoded and re-read here rather than trusted as sent. `readOrder` is the
     * one door an order comes through on every path in this app — it is what
     * refuses a bundle, a foreign currency, or a consideration that pays a
     * stranger. An index that skipped it would be a second, laxer door.
     */
    let params: OrderParameters;
    try {
      params = decodeParams(order.params);
    } catch {
      continue; // A row that will not decode is a row this build cannot price.
    }

    const read = readOrder(params);
    if (read === undefined) continue;

    candidates.push({
      hash: order.hash as Hex,
      params,
      blockNumber: BigInt(order.blockNumber),
      read,
    });
  }

  const voidedAfter = new Map<string, bigint>();
  for (const c of payload.counters) {
    voidedAfter.set(c.offerer.toLowerCase(), BigInt(c.blockNumber));
  }

  /** See the matching line on the scanned path: which source answered, in dev only. */
  if (process.env.NODE_ENV === "development") {
    console.info(`[order book] index: ${candidates.length} candidates`);
  }
  return { candidates, voidedAfter };
}

export function useIndexedOrders(enabled = true) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["indexed-orders"],
    enabled,
    /**
     * The same cadence the scan polls at, so switching source changes nothing
     * anyone can see. The route is cached at the edge for fifteen seconds, so
     * this costs Supabase far less than one request per visitor.
     */
    refetchInterval: 30_000,
    /**
     * One retry, not three. A failing index is not an emergency — it is a cue
     * to read the chain — and three rounds of backoff would hold the page in a
     * loading state for several seconds to reach the same conclusion.
     */
    retry: 1,
    queryFn: fetchBook,
  });

  return {
    book: data ?? undefined,
    isLoading,
    /** True once we know the index cannot answer: unset, down, or too stale. */
    unavailable: isError || data === null,
  };
}
