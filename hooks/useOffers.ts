"use client";

import { useMemo } from "react";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { FROM_BLOCK, scanLogs } from "@/lib/logScan";

export interface TokenOffer {
  bidder: `0x${string}`;
  paymentToken: `0x${string}`;
  price: bigint;
  /** Unix seconds, or 0 for no expiry. */
  expiry: bigint;
  /** True when this offer belongs to the connected wallet. */
  mine: boolean;
}

/**
 * Every live offer on one token, highest first.
 *
 * `getOffer` is keyed by bidder, so there is no way to enumerate offers from
 * contract state alone — the set of bidders has to come from `OfferMade` logs.
 * Those logs are only a record that an offer was *once* made: it may have been
 * withdrawn, expired, overwritten downward, or already accepted. So the logs
 * supply candidate addresses and the contract supplies the truth, and only
 * offers that still read back with a price survive.
 */
export function useOffers(collection: `0x${string}` | undefined, tokenId: bigint | undefined) {
  const client = usePublicClient();
  const { address } = useAccount();

  const enabled = client !== undefined && collection !== undefined && tokenId !== undefined;

  const { data: bidders, isLoading: scanning } = useQuery({
    queryKey: ["offer-bidders", collection, tokenId?.toString()],
    enabled,
    // Offers change on human timescales, and each refetch is a log scan.
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const logs = await scanLogs(client!, {
        address: deployment.marketplace,
        event: {
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
        },
        args: { collection, tokenId },
        fromBlock: FROM_BLOCK,
      });

      const seen = new Set<string>();
      for (const log of logs) {
        const bidder = (log.args as { bidder?: `0x${string}` }).bidder;
        if (bidder !== undefined) seen.add(bidder.toLowerCase());
      }
      return [...seen] as `0x${string}`[];
    },
  });

  const { data: raw, refetch } = useReadContracts({
    contracts: (bidders ?? []).map((bidder) => ({
      address: deployment.marketplace,
      abi: ValueChainMarketplaceAbi,
      functionName: "getOffer" as const,
      args: [collection, tokenId, bidder] as const,
    })),
    query: { enabled: enabled && (bidders ?? []).length > 0, refetchInterval: 20_000 },
  });

  const offers = useMemo<TokenOffer[]>(() => {
    if (bidders === undefined || raw === undefined) return [];
    const now = BigInt(Math.floor(Date.now() / 1000));

    return bidders
      .map((bidder, i) => {
        const r = raw[i];
        if (r?.status !== "success") return undefined;
        const o = r.result as { paymentToken: `0x${string}`; price: bigint; expiry: bigint };
        // A withdrawn or accepted offer reads back as a zeroed struct.
        if (o.price === 0n) return undefined;
        if (o.expiry !== 0n && o.expiry <= now) return undefined;
        return {
          bidder,
          paymentToken: o.paymentToken,
          price: o.price,
          expiry: o.expiry,
          mine: address !== undefined && bidder.toLowerCase() === address.toLowerCase(),
        };
      })
      .filter((o): o is TokenOffer => o !== undefined)
      .sort((a, b) => (b.price > a.price ? 1 : b.price < a.price ? -1 : 0));
  }, [bidders, raw, address]);

  const best = offers[0];
  const mine = offers.find((o) => o.mine);

  return { offers, best, mine, loading: scanning, refetch };
}
