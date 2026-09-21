"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useDeferred } from "@/hooks/useDeferred";
import { parseAbiItem } from "viem";
import { SEAPORT, SEAPORT_FROM_BLOCK } from "@/config/seaport";
import { scanLogs } from "@/lib/logScan";
import { buildActivityRows, type ActivityLog, type ActivityRow } from "@/lib/activityRows";
import { useIndexedActivity } from "@/hooks/useIndexedActivity";
import { orderBookFloor } from "@/lib/seaport";

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
 * What the scan produced, and how much of it is trustworthy.
 *
 * The row list alone cannot distinguish "nothing happened" from "nothing could
 * be read", so the refusal count travels with it.
 */
interface ActivityResult {
  rows: ActivityRow[];
  /** How many of the three event scans the node refused. */
  failed: number;
  /** How many were attempted, so a caller can tell partial from total. */
  scans: number;
}

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

export type { ActivityKind, ActivityRow } from "@/lib/activityRows";

interface RawLog {
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex?: number;
}

export function useActivity(
  collection: `0x${string}` | undefined,
  tokenId?: bigint,
  {
    salesOnly = false,
    wallet,
  }: {
    salesOnly?: boolean;
    /**
     * Only rows this address was a party to, on either side.
     *
     * Free to apply: the scan is already global and already shared, so a
     * personal history costs no extra requests — it is the same rows, filtered
     * differently.
     */
    wallet?: `0x${string}`;
  } = {},
) {
  const client = usePublicClient();

  /**
   * One query for the whole chain's history, shared by every caller.
   *
   * The key deliberately carries no collection or token: narrowing happens after
   * the scan, so a page showing twelve collections' cards runs one scan rather
   * than twelve.
   */
  /**
   * Held back until the page has issued the reads it actually paints with.
   *
   * This hook runs three log scans, and on a collection page it is mounted
   * below the fold for a panel showing ten rows. Measured, those scans took the
   * RPC connection for 1.4 s in the gap between `totalSupply` and
   * `tokenByIndex` — the two reads every piece of artwork on the page waits
   * for. Nothing here is urgent enough to cost that.
   */
  const ready = useDeferred(900);

  /**
   * The index first, the chain when it cannot answer.
   *
   * These three scans were the most expensive thing on most pages — and, once
   * the order book moved to the index, the only thing still walking the chain
   * for logs. `useSeaportOrders` and this hook both read `OrderValidated`, so
   * while this kept scanning, the order book's saving was invisible: the page
   * paid for the walk anyway, for a panel below the fold.
   *
   * The scanned path stays exactly where it was and runs whenever the index is
   * unset, down, or behind. Both feed the same `buildActivityRows`, so the rows
   * are identical whichever source produced them.
   */
  const indexed = useIndexedActivity({ collection, wallet, salesOnly }, ready);

  const query = useQuery({
    queryKey: ["seaport-activity"],
    enabled: client !== undefined && ready && indexed.unavailable,
    staleTime: 60_000,
    queryFn: async (): Promise<ActivityResult> => {
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
      const settled = await Promise.allSettled([
        scanLogs(client!, { ...base, event: ORDER_FULFILLED }),
        scanLogs(client!, { ...base, event: ORDER_VALIDATED }),
        scanLogs(client!, { ...base, event: ORDER_CANCELLED }),
      ]);
      const [fulfilled, validated, cancelled] = settled;

      /**
       * How many of the three scans the node refused.
       *
       * `allSettled` is what keeps one bad topic filter from costing the whole
       * feed, and it is also why this query never rejects — so react-query's
       * own `error` is always null here and the hook had no way to say anything
       * had gone wrong. An empty array then rendered as "Nothing has traded
       * here yet", which is a claim about the chain made from a failure to read
       * it. Counting the refusals is the only honest signal available.
       */
      const failed = settled.filter((s) => s.status === "rejected").length;

      /**
       * `undefined` for a stream the node refused, an array for one that came
       * back empty. `buildActivityRows` treats them differently on purpose:
       * only the second means "nothing has traded here".
       */
      const stream = (s: PromiseSettledResult<unknown[]>): ActivityLog[] | undefined =>
        s.status === "fulfilled" ? (s.value as ActivityLog[]) : undefined;

      const rows = buildActivityRows({
        validated: stream(validated),
        fulfilled: stream(fulfilled),
        cancelled: stream(cancelled),
      });

      return { rows: rows.slice(0, MAX_ACTIVITY_ROWS), failed, scans: settled.length };
    },
  });

  /**
   * Rows from whichever source answered.
   *
   * `failed` and `scans` describe a scan's partial refusals and mean nothing on
   * the indexed path — there, the feed either arrived whole or the hook fell
   * back to scanning. Reporting zero refusals out of zero attempts is the
   * honest version of that, and keeps callers that show "some history could not
   * be read" from saying it about a feed that was read perfectly well.
   */
  const indexedRows = useMemo(
    () =>
      indexed.streams === undefined
        ? undefined
        : buildActivityRows(indexed.streams).slice(0, MAX_ACTIVITY_ROWS),
    [indexed.streams],
  );

  const fromIndex = indexedRows !== undefined;
  const all = indexedRows ?? query.data?.rows ?? [];
  const failed = query.data?.failed ?? 0;
  const scans = query.data?.scans ?? 3;

  const rows = all.filter((r) => {
    if (collection !== undefined && r.collection.toLowerCase() !== collection.toLowerCase()) {
      return false;
    }
    if (tokenId !== undefined && r.tokenId !== tokenId) return false;
    if (salesOnly && r.kind !== "sale") return false;
    if (wallet !== undefined) {
      const me = wallet.toLowerCase();
      // Either side. A listing you made and a purchase you made are both yours.
      const mine = r.from?.toLowerCase() === me || r.to?.toLowerCase() === me;
      if (!mine) return false;
    }
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
    /**
     * Deferred counts as loading, or the panel lies for 900 ms.
     *
     * A disabled query reports `isLoading: false` with no data, and the callers
     * read "not loading, no rows" as "nothing has ever traded here" — which is
     * a claim about the chain made before the chain was asked. That is the same
     * failure `logsUnavailable` exists to prevent, arriving by a different door.
     */
    isLoading: indexed.isLoading || query.isLoading || !ready,
    /**
     * The node would not serve some or all of the logs this feed is built from.
     *
     * Callers must render this rather than an empty state. "Nothing has traded
     * here" and "we could not find out what traded here" are different
     * statements, and only one of them is ever true after a refused scan.
     */
    /**
     * `failed` and `scans` count a scan's refusals, so both are meaningless
     * once the index answered — and dangerous, because `scans` defaults to 3
     * against a `failed` of 0 and the comparison would read a perfectly good
     * indexed feed as a total refusal the moment those defaults drifted.
     */
    logsUnavailable: fromIndex ? false : query.error != null || failed >= scans,
    /** Some event types were refused; what is shown is real but incomplete. */
    logsPartial: fromIndex ? false : failed > 0 && failed < scans,
    refetch: query.refetch,
  };
}
