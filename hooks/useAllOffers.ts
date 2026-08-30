"use client";

import { useMemo } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { FROM_BLOCK, scanLogs } from "@/lib/logScan";

export interface OfferSummary {
  /** Highest live offer on the token, in wei. */
  best: bigint;
  count: number;
}

const OFFER_MADE = {
  type: "event",
  name: "OfferMade",
  inputs: [
    { name: "collection", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: true },
    { name: "bidder", type: "address", indexed: true },
    { name: "paymentToken", type: "address", indexed: false },
    { name: "price", type: "uint256", indexed: false },
    { name: "expiry", type: "uint64", indexed: false },
  ],
} as const;

export const offerKey = (collection: string, id: bigint | string): string =>
  `${collection.toLowerCase()}-${id.toString()}`;

/**
 * Every live offer on the marketplace, keyed by token.
 *
 * Deliberately one query for the whole marketplace rather than one per token.
 * `useOffers` scans logs filtered to a single token, which is right on a detail
 * page and ruinous in a grid: twenty cards would mean twenty log scans of the
 * same contract for the same reason.
 *
 * Because the query key is constant, React Query collapses every card's call
 * into a single fetch and hands them all the same cached result — so a grid of
 * cards costs exactly what one card costs.
 *
 * As in `useOffers`, the logs only say an offer was once made. The contract
 * says whether it still stands, and only offers that read back with a price and
 * an unexpired deadline survive.
 */
export function useAllOffers() {
  const client = usePublicClient();

  const { data: bids } = useQuery({
    queryKey: ["all-offer-bids"],
    enabled: client !== undefined,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const logs = await scanLogs(client!, {
        address: deployment.marketplace,
        event: OFFER_MADE,
        fromBlock: FROM_BLOCK,
      });

      // One entry per (token, bidder); a bidder who re-offers overwrites their
      // own, so the latest log for a pair is the only one worth checking.
      const seen = new Map<string, { collection: `0x${string}`; id: bigint; bidder: `0x${string}` }>();
      for (const log of logs) {
        const a = log.args as {
          collection?: `0x${string}`;
          tokenId?: bigint;
          bidder?: `0x${string}`;
        };
        if (a.collection === undefined || a.tokenId === undefined || a.bidder === undefined) continue;
        seen.set(`${offerKey(a.collection, a.tokenId)}-${a.bidder.toLowerCase()}`, {
          collection: a.collection,
          id: a.tokenId,
          bidder: a.bidder,
        });
      }
      return [...seen.values()];
    },
  });

  const { data: raw } = useReadContracts({
    contracts: (bids ?? []).map((b) => ({
      address: deployment.marketplace,
      abi: ValueChainMarketplaceAbi,
      functionName: "getOffer" as const,
      args: [b.collection, b.id, b.bidder] as const,
    })),
    query: { enabled: (bids ?? []).length > 0, refetchInterval: 60_000 },
  });

  return useMemo(() => {
    const byToken = new Map<string, OfferSummary>();
    if (bids === undefined || raw === undefined) return byToken;
    const now = BigInt(Math.floor(Date.now() / 1000));

    bids.forEach((b, i) => {
      const r = raw[i];
      if (r?.status !== "success") return;
      const o = r.result as { price: bigint; expiry: bigint };
      if (o.price === 0n) return;
      if (o.expiry !== 0n && o.expiry <= now) return;

      const k = offerKey(b.collection, b.id);
      const prev = byToken.get(k);
      byToken.set(k, {
        best: prev === undefined || o.price > prev.best ? o.price : prev.best,
        count: (prev?.count ?? 0) + 1,
      });
    });

    return byToken;
  }, [bids, raw]);
}
