"use client";

import { FEE_BPS } from "@/lib/seaport";
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
    /**
     * Not a chain read any more. Seaport has no fee of its own - it pays exactly
     * the consideration items an order names - so the marketplace's cut is
     * decided when the order is built, by `FEE_BPS` in lib/seaport.ts. Asking a
     * contract for it would be asking the wrong question.
     */
    /**
     * Reported as what THIS BUILD charges, not as an independently established
     * fact — because it is the same constant the orders are built from. If
     * `FEE_BPS` were wrong, this would confirm the wrong number rather than
     * catch it. The only real anchor would be on-chain fee state, which needs a
     * contract this marketplace does not have.
     */
    protocolFeeBps: FEE_BPS,
    protocolFeeIsSelfReported: true,
    /** True once every collection's supply has been read. */
    complete: collections.length > 0 && withSupply.length === collections.length,
    isLoading,
  };
}
