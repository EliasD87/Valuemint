"use client";

import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { useRegistry } from "@/hooks/useRegistry";
import { useDiscoveredCollections } from "@/hooks/useDiscovery";
import { isHidden } from "@/config/hidden";
import { KNOWN_COLLECTIONS } from "@/config/known";

export interface CollectionSummary {
  address: `0x${string}`;
  name: string;
  symbol: string;
  fromFactory: boolean;
  owner?: `0x${string}`;
  totalSupply?: bigint;
  maxSupply?: bigint;
  mintPrice?: bigint;
  publicMintEnabled?: boolean;
  publicMintRemaining?: bigint;
}

/**
 * Every collection on the chain, with its live state.
 *
 * Three sources, because each misses what the others have: the block explorer
 * indexes any ERC-721 but is slow to notice new ones, the factory registry knows
 * everything made here the instant it exists, and `known.ts` covers what is in
 * neither — contracts deployed straight from a script. Merged by address.
 *
 * This is the single place the rest of the app asks "what collections are there" -
 * pages that hardcoded one address were the reason the marketplace kept behaving
 * like a website for a single collection.
 */
export function useAllCollections() {
  const { collections: fromFactory } = useRegistry(48);
  const { data: discovered, isLoading: discovering, error } = useDiscoveredCollections();

  const merged = useMemo(() => {
    const byAddress = new Map<string, CollectionSummary>();

    // Lowest precedence: real registry and explorer data overwrite these
    // placeholder names if either knows the collection.
    for (const c of KNOWN_COLLECTIONS) {
      byAddress.set(c.address.toLowerCase(), {
        address: c.address,
        name: c.name,
        symbol: c.symbol,
        fromFactory: false,
      });
    }

    for (const c of discovered ?? []) {
      byAddress.set(c.address.toLowerCase(), {
        address: c.address,
        name: c.name,
        symbol: c.symbol,
        fromFactory: false,
      });
    }

    for (const c of fromFactory) {
      byAddress.set(c.collection.toLowerCase(), {
        address: c.collection,
        name: c.name,
        symbol: c.symbol,
        fromFactory: true,
      });
    }

    // Filtered here, at the one place that answers "what collections exist",
    // so every surface built on it - home, /collections, /mint, /market,
    // portfolio grouping - agrees without each having to remember.
    return [...byAddress.values()].filter((c) => !isHidden(c.address));
  }, [discovered, fromFactory]);

  const { data, isLoading: loadingState } = useReadContracts({
    contracts: merged.flatMap((c) => {
      const base = { address: c.address, abi: ValueChainCollectionAbi } as const;
      return [
        { ...base, functionName: "owner" as const },
        { ...base, functionName: "totalSupply" as const },
        { ...base, functionName: "maxSupply" as const },
        { ...base, functionName: "mintPrice" as const },
        { ...base, functionName: "publicMintEnabled" as const },
        { ...base, functionName: "publicMintRemaining" as const },
      ];
    }),
    query: { enabled: merged.length > 0, refetchInterval: 15_000 },
  });

  const collections: CollectionSummary[] = merged.map((c, i) => {
    const at = <T,>(n: number): T | undefined => {
      const entry = data?.[i * 6 + n];
      return entry?.status === "success" ? (entry.result as T) : undefined;
    };

    return {
      ...c,
      owner: at<`0x${string}`>(0),
      totalSupply: at<bigint>(1),
      maxSupply: at<bigint>(2),
      mintPrice: at<bigint>(3),
      publicMintEnabled: at<boolean>(4),
      publicMintRemaining: at<bigint>(5),
    };
  });

  /**
   * Loading means "nothing to show yet", not "some source is still talking".
   *
   * Discovery goes through Blockscout, which is a supplement: it finds ERC-721s
   * that did not come from our factory, and it only ever *adds* to what the
   * registry already knows. It is also slow and wildly inconsistent — measured
   * at 5.0s, 0.54s and 1.3s on three consecutive calls for the same 1.6KB.
   *
   * Reporting it as loading made the whole grid wait for the slowest source on
   * the page to display what the fastest already had: the home page holds
   * skeletons while `isLoading` is true, so every visitor sat looking at empty
   * cards for seconds while the factory collections were in hand.
   *
   * So once anything is known — from the factory registry, or `known.ts`, which
   * needs no network at all — the page is not loading. Explorer results fold in
   * when they arrive and the grid grows.
   */
  const haveSomething = merged.length > 0;

  return {
    collections,
    isLoading: !haveSomething && (discovering || loadingState),
    /** True while Blockscout is still answering. The grid is usable regardless. */
    stillDiscovering: discovering,
    explorerUnavailable: error !== null,
  };
}

/** The collections the connected wallet owns, and can therefore manage. */
export function useOwnedCollections() {
  const { address } = useAccount();
  const { collections, isLoading } = useAllCollections();

  const owned = collections.filter(
    (c) => address !== undefined && c.owner?.toLowerCase() === address.toLowerCase(),
  );

  return { owned, isLoading, connected: address !== undefined };
}

/** The canonical collection, for places that still need a sensible default. */
