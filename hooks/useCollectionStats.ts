"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlockNumber } from "wagmi";
import { useActivity } from "@/hooks/useActivity";
import { useBestListings, useCollectionOffers } from "@/hooks/useSeaportOrders";
import { deployment } from "@/config/contracts";
import { BLOCKS_PER_DAY } from "@/config/chain";

/**
 * The figures across the top of a collection page.
 *
 * **This costs almost nothing, and that is the whole design.** Every hook it
 * composes is already mounted by the page around it — `useBestListings` draws
 * the prices on the cards, `useActivity` fills the history panel, and React
 * Query dedupes both by key. So the stats bar is arithmetic over data the page
 * had already paid for, not a second pass over the chain.
 *
 * The one genuinely new request is the explorer's token record, for the unique
 * owner count. There is no way to get that from the chain without reading
 * `ownerOf` for every token, which for Cybereator is 2,968 reads to print one
 * number.
 *
 * ---
 *
 * **Every figure here is scoped to this marketplace, and several people will
 * read them as scoped to the collection.** Volume counts what settled through
 * Seaport; a piece sold by a direct transfer, or on another marketplace if one
 * ever exists here, leaves no event and is not in these numbers. The UI says
 * so rather than this hook pretending otherwise — see `CollectionStats`.
 */

export interface CollectionStats {
  /** Cheapest live listing, in wei. Undefined when nothing is for sale. */
  floorWei?: bigint;
  /** How many pieces have a live listing. Distinct tokens, not orders. */
  listed: number;
  /** The highest live bid anyone could accept, in wei of WSOSO. */
  topOfferWei?: bigint;
  /** Settled through Seaport in the last day, in wei. */
  volumeDayWei: bigint;
  /** Settled through Seaport, ever. */
  volumeTotalWei: bigint;
  /** Sales in the last day, so a volume of 0 can be told from no trades. */
  salesDay: number;
  salesTotal: number;
  /** Most recent sale price, per unit. */
  lastSaleWei?: bigint;
  /** Distinct holders, from the explorer. Undefined where it could not be read. */
  owners?: number;
  /** The history is still arriving, so volume figures are incomplete. */
  isLoading: boolean;
  /**
   * The history could not be read at all.
   *
   * Callers must distinguish this from a zero. "Nothing has traded here" and
   * "we could not find out what traded here" are different claims and only one
   * of them survives a refused scan.
   */
  unavailable: boolean;
}

interface TokenRecord {
  holders_count?: string | number | null;
  holders?: string | number | null;
}

/**
 * Unique holders, from the explorer's own index.
 *
 * Separate from `useTopHolders`, which pages the holder *list* to a hundred
 * rows. This wants only the total, which the token record carries in one field
 * — and a collection with four thousand holders would otherwise need forty
 * pages walked to count them.
 *
 * **It will not work on localhost.** The explorer sends no CORS headers for
 * this origin, so the figure is simply absent in development. That is the
 * environment, not a bug; the bar omits the cell rather than printing a zero.
 */
function useOwnerCount(collection: `0x${string}` | undefined) {
  const { data } = useQuery({
    queryKey: ["owner-count", collection?.toLowerCase() ?? null],
    enabled: collection !== undefined,
    /** Holders move when pieces trade, which is neither often nor urgent. */
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<number | null> => {
      const res = await fetch(`${deployment.explorer}/api/v2/tokens/${collection}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;

      const body = (await res.json()) as TokenRecord;
      const raw = body.holders_count ?? body.holders;
      if (raw === null || raw === undefined) return null;

      const n = Number(raw);
      /**
       * `null` rather than 0 on anything unparseable. A collection genuinely
       * can have zero holders — every piece burned — and printing that when the
       * field was missing would be a claim nobody made.
       */
      return Number.isFinite(n) && n >= 0 ? n : null;
    },
  });

  return data ?? undefined;
}

export function useCollectionStats(collection: `0x${string}` | undefined): CollectionStats {
  const { best, isLoading: booking } = useBestListings(collection);
  const { best: topOffer } = useCollectionOffers(collection);
  const { sales, volume, isLoading: reading, logsUnavailable } = useActivity(collection);
  const { data: head } = useBlockNumber({ watch: false });
  const owners = useOwnerCount(collection);

  /**
   * The floor, and the listed count, from the orders this page already holds.
   *
   * `best` is keyed `collection-tokenId` and scoped to this collection by the
   * hook above, so its size is the number of distinct pieces for sale — not the
   * number of orders. A seller who validates three listings on one token has
   * listed one piece, and counting orders would say three.
   */
  const { floorWei, listed } = useMemo(() => {
    let floor: bigint | undefined;
    for (const order of best.values()) {
      if (floor === undefined || order.priceWei < floor) floor = order.priceWei;
    }
    return { floorWei: floor, listed: best.size };
  }, [best]);

  /**
   * A day's worth of sales, measured in blocks rather than timestamps.
   *
   * The events carry a block number and no time — storing one would mean a
   * `getBlock` per event at index time. `BLOCKS_PER_DAY` converts at the
   * chain's measured spacing, which is accurate to well within the hour that a
   * "24h volume" figure implies.
   *
   * With no head yet this is deliberately empty rather than falling back to the
   * whole history: labelling the all-time figure "24h" is worse than showing
   * nothing for the half-second before the head arrives.
   */
  const day = useMemo(() => {
    if (head === undefined) return { volumeDayWei: 0n, salesDay: 0, ready: false };

    const from = head > BigInt(BLOCKS_PER_DAY) ? head - BigInt(BLOCKS_PER_DAY) : 0n;
    let sum = 0n;
    let count = 0;
    for (const row of sales) {
      if (row.blockNumber < from) continue;
      sum += (row.price ?? 0n) * row.amount;
      count += 1;
    }
    return { volumeDayWei: sum, salesDay: count, ready: true };
  }, [sales, head]);

  return {
    ...(floorWei === undefined ? {} : { floorWei }),
    listed,
    ...(topOffer === undefined ? {} : { topOfferWei: topOffer.priceWei }),
    volumeDayWei: day.volumeDayWei,
    volumeTotalWei: volume,
    salesDay: day.salesDay,
    salesTotal: sales.length,
    ...(sales[0]?.price === undefined ? {} : { lastSaleWei: sales[0].price }),
    ...(owners === undefined ? {} : { owners }),
    isLoading: booking || reading || !day.ready,
    unavailable: logsUnavailable,
  };
}
