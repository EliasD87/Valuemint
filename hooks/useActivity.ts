"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { deployment } from "@/config/contracts";
import { FROM_BLOCK, scanLogs } from "@/lib/logScan";

/**
 * What has actually happened to a token, or to a collection.
 *
 * The marketplace has emitted `Sale`, `Listed`, `ListingCancelled` and
 * `OfferMade` since the first version, and until now nothing read any of them.
 * Every figure on the site was an *asking* price: a buyer looking at a 500 SOSO
 * piece had no way to tell whether anything in that collection had ever traded,
 * or for what. That is the difference between a price and a market.
 *
 * Sales are the part that matters, so they are the reason this exists; the
 * other events are here because they are free once the scan is running and they
 * make the story legible - a piece listed, relisted cheaper, then sold reads
 * very differently from one that sold immediately.
 *
 * Read straight from logs. There is no indexer on this chain, and the events
 * are the only record: the contract deletes a listing when it fills, so current
 * state cannot tell you what a thing sold for.
 */

const saleEvent = parseAbiItem(
  "event Sale(address indexed collection, uint256 indexed tokenId, address indexed seller, address buyer, address paymentToken, uint256 price, uint256 protocolFee, uint256 royalty)",
);
const multiSaleEvent = parseAbiItem(
  "event MultiSale(address indexed collection, uint256 indexed tokenId, address indexed seller, address buyer, address paymentToken, uint256 unitPrice, uint256 amount, uint256 protocolFee, uint256 royalty)",
);
const listedEvent = parseAbiItem(
  "event Listed(address indexed collection, uint256 indexed tokenId, address indexed seller, address paymentToken, uint256 price, uint64 expiry)",
);
const cancelledEvent = parseAbiItem(
  "event ListingCancelled(address indexed collection, uint256 indexed tokenId, address indexed seller)",
);
const offerEvent = parseAbiItem(
  "event OfferMade(address indexed collection, uint256 indexed tokenId, address indexed bidder, address paymentToken, uint256 price, uint64 expiry)",
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

  const query = useQuery({
    queryKey: ["activity", collection, tokenId?.toString() ?? "all", salesOnly],
    enabled: client !== undefined,
    /**
     * A full scan per query key, so this is cached hard. History does not
     * change - only its tail grows - and `scanLogs` already remembers what it
     * has read and asks only for new blocks.
     */
    staleTime: 60_000,
    queryFn: async (): Promise<ActivityRow[]> => {
      const args = tokenId === undefined ? { collection } : { collection, tokenId };
      const base = { address: deployment.marketplace, fromBlock: FROM_BLOCK, args };

      const wanted = salesOnly
        ? [saleEvent, multiSaleEvent]
        : [saleEvent, multiSaleEvent, listedEvent, cancelledEvent, offerEvent];

      /**
       * Settled, not `all`. These are five independent scans and one failing -
       * a node that dislikes a particular topic filter, say - should cost that
       * row type, not the whole feed.
       */
      const results = await Promise.allSettled(
        wanted.map((event) => scanLogs(client!, { ...base, event })),
      );

      const rows: ActivityRow[] = [];
      results.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const event = wanted[i]!;
        for (const log of r.value as unknown as RawLog[]) {
          const a = log.args;
          const common = {
            collection: a.collection as `0x${string}`,
            tokenId: a.tokenId as bigint,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex ?? 0,
          };

          if (event === saleEvent) {
            rows.push({
              ...common,
              kind: "sale",
              amount: 1n,
              price: a.price as bigint,
              from: a.seller as `0x${string}`,
              to: a.buyer as `0x${string}`,
            });
          } else if (event === multiSaleEvent) {
            rows.push({
              ...common,
              kind: "sale",
              amount: a.amount as bigint,
              // Per unit, so an edition sale sits on the same scale as a single.
              price: a.unitPrice as bigint,
              from: a.seller as `0x${string}`,
              to: a.buyer as `0x${string}`,
            });
          } else if (event === listedEvent) {
            rows.push({
              ...common,
              kind: "listed",
              amount: 1n,
              price: a.price as bigint,
              from: a.seller as `0x${string}`,
            });
          } else if (event === cancelledEvent) {
            rows.push({ ...common, kind: "cancelled", amount: 1n, from: a.seller as `0x${string}` });
          } else {
            rows.push({
              ...common,
              kind: "offer",
              amount: 1n,
              price: a.price as bigint,
              from: a.bidder as `0x${string}`,
            });
          }
        }
      });

      // Newest first. `logIndex` breaks ties inside a block, which matters:
      // a listing and its sale can land in the same one.
      rows.sort((x, y) =>
        x.blockNumber === y.blockNumber
          ? y.logIndex - x.logIndex
          : x.blockNumber > y.blockNumber
            ? -1
            : 1,
      );
      return rows;
    },
  });

  const rows = query.data ?? [];
  const sales = rows.filter((r) => r.kind === "sale");

  return {
    rows,
    sales,
    /** The most recent sale, which is what a card wants to show. */
    lastSale: sales[0],
    /**
     * Total value traded, per unit price times units. Only counts what this
     * marketplace settled - a peer-to-peer transfer leaves no event here, and
     * claiming otherwise would overstate the number.
     */
    volume: sales.reduce((sum, r) => sum + (r.price ?? 0n) * r.amount, 0n),
    salesCount: sales.length,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
