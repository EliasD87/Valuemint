"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlockNumber } from "wagmi";
import { useActivity } from "@/hooks/useActivity";
import { useBestListings } from "@/hooks/useSeaportOrders";
import { fetchOwnerCount } from "@/lib/topHolders";
import { BLOCKS_PER_DAY } from "@/config/chain";
import type { CollectionFiguresSeed } from "@/lib/collectionFigures";

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
  /** The order book has not answered yet, so `listed` and the floor are not known. */
  bookLoading: boolean;
  /** The sales history has not answered yet, so the volumes are not known. */
  historyLoading: boolean;
  /**
   * The history could not be read at all.
   *
   * Callers must distinguish this from a zero. "Nothing has traded here" and
   * "we could not find out what traded here" are different claims and only one
   * of them survives a refused scan.
   */
  unavailable: boolean;
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
    queryFn: () => fetchOwnerCount(collection!),
  });

  return data ?? undefined;
}

export function useCollectionStats(
  collection: `0x${string}` | undefined,
  seed?: CollectionFiguresSeed,
): CollectionStats {
  const { best, isLoading: booking } = useBestListings(collection);
  /**
   * Sales only, not the whole feed (2026-10-30).
   *
   * The feed is the newest 2,000 events of every kind, and on a collection
   * with a busy order book the listings push the oldest sales off its end:
   * Treasure Box read 7,109 SOSO all-time against 7,565 actually settled, and
   * the gap grew with every listing. Sales alone are a few hundred rows.
   */
  const { sales, volume, isLoading: reading, logsUnavailable } = useActivity(collection, undefined, {
    salesOnly: true,
  });
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

  /**
   * The server's figures stand in for each group until the browser's own
   * answer for that group lands (app/collection/[address]/page.tsx). The same
   * rules produced both, so the swap is normally invisible; when it is not,
   * it is because something sold or listed in between, and the newer wins.
   */
  const historyLoading = reading || !day.ready;
  const seededBook = booking && seed?.listed !== undefined;
  const seededHistory = historyLoading && seed?.volumeTotalWei !== undefined && seed.volumeDayWei !== undefined;
  const shownFloor = seededBook ? (seed.floorWei === undefined ? undefined : BigInt(seed.floorWei)) : floorWei;

  return {
    ...(shownFloor === undefined ? {} : { floorWei: shownFloor }),
    listed: seededBook ? seed.listed! : listed,
    volumeDayWei: seededHistory ? BigInt(seed.volumeDayWei!) : day.volumeDayWei,
    volumeTotalWei: seededHistory ? BigInt(seed.volumeTotalWei!) : volume,
    salesDay: day.salesDay,
    salesTotal: sales.length,
    ...(sales[0]?.price === undefined ? {} : { lastSaleWei: sales[0].price }),
    ...(owners === undefined ? {} : { owners }),
    isLoading: (booking && !seededBook) || (historyLoading && !seededHistory),
    bookLoading: booking && !seededBook,
    historyLoading: historyLoading && !seededHistory,
    unavailable: logsUnavailable,
  };
}
