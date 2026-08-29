"use client";

import { useReadContract } from "wagmi";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { useAllCollections } from "@/hooks/useAllCollections";

/**
 * Marketplace-wide figures, summed across every collection.
 *
 * The home page used `useCollectionStats`, which reads one hardcoded address —
 * the first collection ever deployed here. So the front page reported that
 * collection's supply under the label "pieces minted", as though it were the
 * whole chain. Every other collection was invisible in the number, and the
 * number got further from the truth with each one added.
 *
 * No extra chain reads: `useAllCollections` already fetches `totalSupply` for
 * every collection to render the listings, so this only adds arithmetic.
 */
export function useChainStats() {
  const { collections, isLoading } = useAllCollections();

  const { data: protocolFeeBps } = useReadContract({
    address: deployment.marketplace,
    abi: ValueChainMarketplaceAbi,
    functionName: "protocolFeeBps",
    query: { refetchInterval: 60_000 },
  });

  // A collection whose supply has not loaded yet contributes nothing rather
  // than a zero that looks settled - `known` is what says whether the total is
  // complete, so the page can avoid presenting a partial sum as final.
  const withSupply = collections.filter((c) => c.totalSupply !== undefined);
  const minted = withSupply.reduce((n, c) => n + (c.totalSupply ?? 0n), 0n);
  const capacity = collections.reduce((n, c) => n + (c.maxSupply ?? 0n), 0n);
  const openMints = collections.filter((c) => c.publicMintEnabled === true).length;

  return {
    collections: collections.length,
    minted,
    capacity,
    openMints,
    protocolFeeBps: protocolFeeBps ?? 0n,
    /** True once every collection's supply has been read. */
    complete: collections.length > 0 && withSupply.length === collections.length,
    isLoading,
  };
}
