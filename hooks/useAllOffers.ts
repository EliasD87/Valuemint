"use client";

import { useMemo } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { FROM_BLOCK, scanLogs } from "@/lib/logScan";
import {
  offerKey,
  summariseOffers,
  type OfferBid,
  type OfferState,
  type OfferSummary,
} from "@/lib/offers";

/**
 * Re-exported so existing callers keep importing offers from one place. The
 * summarising itself lives in `lib/offers.ts`, where it can be tested: pairing
 * the top price with the wrong bidder is invisible on screen and fatal in the
 * wallet.
 */
export { offerKey, type OfferSummary };

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

/**
 * Everyone who has ever bid on anything, marketplace-wide, as (token, bidder).
 *
 * One query for the whole marketplace, never one per token, and this is not a
 * micro-optimisation. `getOffer` is keyed by bidder, so the set of bidders can
 * only come from `OfferMade` logs, and ValueChain's public RPC caps
 * `eth_getLogs` by range — which makes a scan of the marketplace's history 109
 * sequential requests taking about 25 seconds on a good connection.
 *
 * The token page used to run its own copy of that, filtered to one id. It
 * returned the right answer and took half a minute to do it, so an owner who
 * opened their piece read "No offers yet" over a live offer and closed the tab.
 * Five token pages meant five such scans, each finding at most a handful of
 * logs the unfiltered one had already seen.
 *
 * Sharing one constant query key is what fixes that: React Query collapses
 * every caller into a single fetch, and `scanLogs` remembers how far it has
 * read, so every refetch after the first costs one `eth_blockNumber` and at
 * most one small range.
 */
export function useOfferBids() {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["all-offer-bids"],
    enabled: client !== undefined,
    // Cheap to repeat once the first scan is done, so this can be brisk: an
    // offer arriving should not take two minutes to appear to its recipient.
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<OfferBid[]> => {
      const logs = await scanLogs(client!, {
        address: deployment.marketplace,
        event: OFFER_MADE,
        fromBlock: FROM_BLOCK,
      });

      // One entry per (token, bidder); a bidder who re-offers overwrites their
      // own, so the latest log for a pair is the only one worth checking.
      const seen = new Map<string, OfferBid>();
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
}

/**
 * Every live offer on the marketplace, keyed by token.
 *
 * The logs only say an offer was once made. The contract says whether it still
 * stands, and only offers that read back with a price and an unexpired deadline
 * survive.
 */
export function useAllOffers() {
  const { data: bids } = useOfferBids();

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
    if (bids === undefined || raw === undefined) return new Map<string, OfferSummary>();

    // A failed read is not an absent offer, so it is passed through as
    // undefined and skipped rather than being read as a zero price.
    const states = raw.map((r) =>
      r?.status === "success" ? (r.result as OfferState) : undefined,
    );

    return summariseOffers(bids, states, BigInt(Math.floor(Date.now() / 1000)));
  }, [bids, raw]);
}
