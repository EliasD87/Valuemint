"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { SEAPORT, SEAPORT_FROM_BLOCK } from "@/config/seaport";
import { scanLogs } from "@/lib/logScan";
import {
  orderBookFloor,
  readFulfilment,
  readOrder,
  type OrderParameters,
  type ReceivedItem,
  type SpentItem,
} from "@/lib/seaport";

/**
 * The most rows this feed will ever hold.
 *
 * `useSeaportOrders` caps its candidate set at 2,000 because `OrderValidated`
 * is free for anyone to emit — `validate(Order[])` takes an array, so thousands
 * land in one transaction. This hook reads the same event and had no cap at
 * all, so the flood the order book now survives still arrived here in full, on
 * every collection page and every token page, decoded and held in memory.
 *
 * Newest first, so the cap drops the oldest history rather than the activity
 * anyone is looking at.
 */
const MAX_ACTIVITY_ROWS = 2_000;

/**
 * What has actually happened to a token, or to a collection.
 *
 * Every other figure on the site is an *asking* price. Without this, a buyer
 * looking at a 500 SOSO piece has no way to tell whether anything in that
 * collection has ever traded, or for what - which is the difference between a
 * price and a market.
 *
 * Read straight from logs, because there is no indexer on this chain and the
 * events are the only record: an order that fills leaves no state behind saying
 * what it went for.
 *
 * One thing changed with Seaport and it shapes this whole file. The previous
 * marketplace indexed its events by collection and token, so the node could
 * filter and a token page fetched only its own history. Seaport's events index
 * `offerer` and `zone` and nothing else - the collection is buried inside an
 * array in the data. So the scan is global and the filtering happens here.
 *
 * That is affordable only because `scanLogs` caches per (address, event) across
 * the whole page: `useSeaportOrders` already walks `OrderValidated`, so a token
 * page asking for its history reuses those blocks rather than re-reading them.
 * Filtering by collection in the query key instead would defeat that entirely -
 * a separate cached scan per collection, all covering the same range.
 */

const ORDER_FULFILLED = parseAbiItem(
  "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)",
);

const ORDER_VALIDATED = parseAbiItem(
  "event OrderValidated(bytes32 orderHash, (address offerer, address zone, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) orderParameters)",
);

const ORDER_CANCELLED = parseAbiItem(
  "event OrderCancelled(bytes32 orderHash, address indexed offerer, address indexed zone)",
);

export type ActivityKind = "sale" | "listed" | "cancelled" | "offer";

export interface ActivityRow {
  kind: ActivityKind;
  collection: `0x${string}`;
  tokenId: bigint;
  /** Units moved. Always 1n for ERC-721; the lot size for an edition. */
  amount: bigint;
  /** Per unit, so an edition sale is comparable with a single-piece one. */
  price?: bigint;
  from?: `0x${string}`;
  to?: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
}

interface RawLog {
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex?: number;
}

export function useActivity(
  collection: `0x${string}` | undefined,
  tokenId?: bigint,
  { salesOnly = false }: { salesOnly?: boolean } = {},
) {
  const client = usePublicClient();

  /**
   * One query for the whole chain's history, shared by every caller.
   *
   * The key deliberately carries no collection or token: narrowing happens after
   * the scan, so a page showing twelve collections' cards runs one scan rather
   * than twelve.
   */
  const query = useQuery({
    queryKey: ["seaport-activity"],
    enabled: client !== undefined,
    staleTime: 60_000,
    queryFn: async (): Promise<ActivityRow[]> => {
      /**
       * The same floor `useSeaportOrders` scans from, and deliberately so.
       *
       * It was `SEAPORT_FROM_BLOCK`, which grows without bound as the chain
       * ages — the one thing `orderBookFloor` exists to stop. It also quietly
       * cost twice: `scanLogs` keys its cache on `fromBlock`, so the moment the
       * head passed `deployedAt + ORDER_BOOK_WINDOW_BLOCKS` the two scans
       * diverged and the page paid for both, exactly when the comment above
       * claims they share.
       */
      const floor = orderBookFloor(await client!.getBlockNumber(), SEAPORT_FROM_BLOCK);
      const base = { address: SEAPORT, fromBlock: floor };

      /**
       * Settled, not `all`. Three independent scans, and one failing - a node
       * that dislikes a particular topic filter, say - should cost that row
       * type rather than the whole feed.
       */
      const [fulfilled, validated, cancelled] = await Promise.allSettled([
        scanLogs(client!, { ...base, event: ORDER_FULFILLED }),
        scanLogs(client!, { ...base, event: ORDER_VALIDATED }),
        scanLogs(client!, { ...base, event: ORDER_CANCELLED }),
      ]);

      const rows: ActivityRow[] = [];

      /** Order hash -> what it was, so a cancellation can say which token it freed. */
      const known = new Map<string, { collection: `0x${string}`; tokenId: bigint }>();

      if (validated.status === "fulfilled") {
        for (const log of validated.value as unknown as RawLog[]) {
          const params = log.args.orderParameters as OrderParameters | undefined;
          const hash = log.args.orderHash as string | undefined;
          if (params === undefined) continue;

          const read = readOrder(params);
          if (read === undefined) continue;

          if (hash !== undefined && read.tokenId !== undefined) {
            known.set(hash, { collection: read.collection, tokenId: read.tokenId });
          }

          rows.push({
            kind: read.kind === "listing" ? "listed" : "offer",
            collection: read.collection,
            /**
             * A collection-wide offer names no token. It is still activity worth
             * showing on the collection, so it is recorded against id 0 and only
             * ever surfaces in the unfiltered feed.
             */
            tokenId: read.tokenId ?? 0n,
            amount: read.amount,
            price: read.priceWei,
            from: read.maker,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex ?? 0,
          });
        }
      }

      if (fulfilled.status === "fulfilled") {
        for (const log of fulfilled.value as unknown as RawLog[]) {
          const sale = readFulfilment(
            log.args.offerer as `0x${string}`,
            log.args.recipient as `0x${string}`,
            (log.args.offer ?? []) as readonly SpentItem[],
            (log.args.consideration ?? []) as readonly ReceivedItem[],
          );
          if (sale === undefined) continue;

          rows.push({
            kind: "sale",
            collection: sale.collection,
            tokenId: sale.tokenId,
            amount: sale.amount,
            // Per unit, so an edition sale sits on the same scale as a single.
            price: sale.amount > 0n ? sale.priceWei / sale.amount : sale.priceWei,
            from: sale.seller,
            to: sale.buyer,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex ?? 0,
          });
        }
      }

      if (cancelled.status === "fulfilled") {
        for (const log of cancelled.value as unknown as RawLog[]) {
          /**
           * `OrderCancelled` carries only the hash, so the token is recovered
           * from the order's own `OrderValidated`. An order cancelled without
           * ever being validated on chain has no row here - correctly, since
           * nothing in this app ever showed it.
           */
          const was = known.get(log.args.orderHash as string);
          if (was === undefined) continue;

          rows.push({
            kind: "cancelled",
            collection: was.collection,
            tokenId: was.tokenId,
            amount: 1n,
            from: log.args.offerer as `0x${string}`,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex ?? 0,
          });
        }
      }

      // Newest first. `logIndex` breaks ties inside a block, which matters:
      // a listing and its sale can land in the same one.
      rows.sort((x, y) =>
        x.blockNumber === y.blockNumber
          ? y.logIndex - x.logIndex
          : x.blockNumber > y.blockNumber
            ? -1
            : 1,
      );
      return rows.slice(0, MAX_ACTIVITY_ROWS);
    },
  });

  const all = query.data ?? [];

  const rows = all.filter((r) => {
    if (collection !== undefined && r.collection.toLowerCase() !== collection.toLowerCase()) {
      return false;
    }
    if (tokenId !== undefined && r.tokenId !== tokenId) return false;
    if (salesOnly && r.kind !== "sale") return false;
    return true;
  });

  const sales = rows.filter((r) => r.kind === "sale");

  return {
    rows,
    sales,
    /** The most recent sale, which is what a card wants to show. */
    lastSale: sales[0],
    /**
     * Total value traded, per unit price times units. Only counts what settled
     * through Seaport - a peer-to-peer transfer leaves no event here, and
     * claiming otherwise would overstate the number.
     */
    volume: sales.reduce((sum, r) => sum + (r.price ?? 0n) * r.amount, 0n),
    salesCount: sales.length,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
