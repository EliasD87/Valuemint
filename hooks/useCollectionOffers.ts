"use client";

import { useMemo } from "react";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ValueChainCollectionOffersAbi, deployment } from "@/config/contracts";
import { FROM_BLOCK, scanLogs } from "@/lib/logScan";

/**
 * Offers made on a whole collection rather than on one token.
 *
 * The marketplace keys an offer to `(collection, tokenId, bidder)`, which is
 * the wrong shape for a collection that is one design in many editions: the
 * offer lands on one edition, its holder is never told, and every other holder
 * sees a price they cannot take. `ValueChainCollectionOffers` adds the missing
 * shape beside the marketplace — see the contract for why beside rather than
 * inside.
 *
 * Everything here is inert until that contract is deployed and its address
 * exported. `enabled` is the single switch, and every consumer checks it, so
 * this ships safely ahead of the deployment.
 */

export const COLLECTION_OFFERS_ADDRESS = deployment.collectionOffers as `0x${string}` | "";

/** Whether collection-wide offers exist on this chain yet. */
export const collectionOffersEnabled = COLLECTION_OFFERS_ADDRESS !== "";

export interface CollectionOffer {
  collection: `0x${string}`;
  bidder: `0x${string}`;
  paymentToken: `0x${string}`;
  price: bigint;
  /** Unix seconds, or 0 for no expiry. */
  expiry: bigint;
  /**
   * Whether the money behind it is still there.
   *
   * An offer is only an allowance, and a bidder can spend it elsewhere while
   * the offer stands. Showing an unfunded offer as live sends a holder to pay
   * gas for a transaction that cannot succeed.
   */
  fillable: boolean;
  /** True when this offer belongs to the connected wallet. */
  mine: boolean;
}

const OFFER_MADE = {
  type: "event",
  name: "CollectionOfferMade",
  inputs: [
    { name: "collection", type: "address", indexed: true },
    { name: "bidder", type: "address", indexed: true },
    { name: "paymentToken", type: "address", indexed: false },
    { name: "price", type: "uint256", indexed: false },
    { name: "expiry", type: "uint64", indexed: false },
  ],
} as const;

const key = (collection: string) => collection.toLowerCase();

interface Bid {
  collection: `0x${string}`;
  bidder: `0x${string}`;
}

/**
 * Every (collection, bidder) pair that has ever bid, marketplace-wide.
 *
 * One shared query, for the same reason `useOfferBids` is one: the RPC caps
 * `eth_getLogs` by block range, so a scan narrowed to a single collection costs
 * exactly what the unfiltered one costs. Per-collection scanning is what made
 * the token page take half a minute to admit an offer existed.
 */
function useCollectionOfferBids() {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["collection-offer-bids", COLLECTION_OFFERS_ADDRESS],
    enabled: client !== undefined && collectionOffersEnabled,
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Bid[]> => {
      const logs = await scanLogs(client!, {
        address: COLLECTION_OFFERS_ADDRESS as `0x${string}`,
        event: OFFER_MADE,
        // Its own deployment block, not the marketplace's — there is nothing
        // from this contract before it existed.
        fromBlock:
          deployment.collectionOffersBlock > 0 ? BigInt(deployment.collectionOffersBlock) : FROM_BLOCK,
      });

      // One entry per pair: a bidder who re-offers overwrites their own.
      const seen = new Map<string, Bid>();
      for (const log of logs) {
        const a = log.args as { collection?: `0x${string}`; bidder?: `0x${string}` };
        if (a.collection === undefined || a.bidder === undefined) continue;
        seen.set(`${key(a.collection)}-${a.bidder.toLowerCase()}`, {
          collection: a.collection,
          bidder: a.bidder,
        });
      }
      return [...seen.values()];
    },
  });
}

/**
 * Every live collection offer, grouped by collection and highest first.
 *
 * As with token offers, the logs only say an offer was once made; the contract
 * says whether it still stands. `isOfferFillable` is asked alongside, because
 * "stored" and "payable" are different questions and only the second one should
 * put an Accept button on screen.
 */
export function useAllCollectionOffers() {
  const { address } = useAccount();
  const { data: bids, refetch: refetchBids } = useCollectionOfferBids();

  const contracts = useMemo(() => {
    if (bids === undefined) return [];
    // Two reads per bid, interleaved, so the results line up two-to-one.
    return bids.flatMap((b) => [
      {
        address: COLLECTION_OFFERS_ADDRESS as `0x${string}`,
        abi: ValueChainCollectionOffersAbi,
        functionName: "getCollectionOffer" as const,
        args: [b.collection, b.bidder] as const,
      },
      {
        address: COLLECTION_OFFERS_ADDRESS as `0x${string}`,
        abi: ValueChainCollectionOffersAbi,
        functionName: "isOfferFillable" as const,
        args: [b.collection, b.bidder] as const,
      },
    ]);
  }, [bids]);

  const { data: raw, refetch: refetchReads } = useReadContracts({
    contracts,
    query: { enabled: collectionOffersEnabled && contracts.length > 0, refetchInterval: 30_000 },
  });

  const byCollection = useMemo(() => {
    const map = new Map<string, CollectionOffer[]>();
    if (bids === undefined || raw === undefined) return map;
    const now = BigInt(Math.floor(Date.now() / 1000));

    bids.forEach((b, i) => {
      const stored = raw[i * 2];
      const funded = raw[i * 2 + 1];
      if (stored?.status !== "success") return;

      const o = stored.result as { paymentToken: `0x${string}`; price: bigint; expiry: bigint };
      if (o.price === 0n) return;
      if (o.expiry !== 0n && o.expiry <= now) return;

      const list = map.get(key(b.collection)) ?? [];
      list.push({
        collection: b.collection,
        bidder: b.bidder,
        paymentToken: o.paymentToken,
        price: o.price,
        expiry: o.expiry,
        // A read that failed is not proof the money is gone, but it is not
        // proof it is there either, and only one of those is safe to assume.
        fillable: funded?.status === "success" && funded.result === true,
        mine: address !== undefined && b.bidder.toLowerCase() === address.toLowerCase(),
      });
      map.set(key(b.collection), list);
    });

    for (const list of map.values()) {
      list.sort((a, b) => (b.price > a.price ? 1 : b.price < a.price ? -1 : 0));
    }
    return map;
  }, [bids, raw, address]);

  const refetch = async () => {
    await Promise.all([refetchBids(), refetchReads()]);
  };

  return { byCollection, refetch };
}

/** The live collection offers on one collection, highest first. */
export function useCollectionOffers(collection: `0x${string}` | undefined) {
  const { byCollection, refetch } = useAllCollectionOffers();

  const offers = useMemo(
    () => (collection === undefined ? [] : (byCollection.get(key(collection)) ?? [])),
    [byCollection, collection],
  );

  return {
    offers,
    /** The highest offer that could actually be paid right now. */
    best: offers.find((o) => o.fillable),
    mine: offers.find((o) => o.mine),
    refetch,
  };
}
