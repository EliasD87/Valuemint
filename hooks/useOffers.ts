"use client";

import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { useOfferBids } from "@/hooks/useAllOffers";
import { offerKey } from "@/lib/offers";

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
 *
 * The bidders come from the marketplace-wide scan rather than a scan filtered
 * to this token. A filtered scan is not cheaper — the RPC caps `eth_getLogs` by
 * block range, not by result count, so narrowing the topics saves nothing and
 * still costs 109 sequential requests and roughly 25 seconds. Running it per
 * token meant this panel said "No offers yet" for half a minute over a live
 * offer, on the one page where an owner goes to accept it.
 */
export function useOffers(collection: `0x${string}` | undefined, tokenId: bigint | undefined) {
  const { address } = useAccount();

  const enabled = collection !== undefined && tokenId !== undefined;

  const { data: allBids, isLoading: scanning, refetch: refetchBids } = useOfferBids();

  const bidders = useMemo<`0x${string}`[] | undefined>(() => {
    if (allBids === undefined || !enabled) return undefined;
    const want = offerKey(collection, tokenId);

    const seen = new Set<string>();
    for (const b of allBids) {
      if (offerKey(b.collection, b.id) === want) seen.add(b.bidder.toLowerCase());
    }
    return [...seen] as `0x${string}`[];
  }, [allBids, collection, tokenId, enabled]);

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

  /**
   * Both halves, because they answer different questions. The contract reads
   * catch an offer that has just been accepted or withdrawn; only a fresh log
   * scan catches a bidder who was not in the set at all — which is exactly the
   * case after somebody makes the first offer on a token.
   */
  const refresh = async () => {
    await Promise.all([refetch(), refetchBids()]);
  };

  return { offers, best, mine, loading: scanning, refetch: refresh };
}
