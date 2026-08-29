"use client";

import { useReadContract, useReadContracts } from "wagmi";
import {
  ValueChainCollectionFactoryAbi,
  ValueChainCollectionAbi,
  deployment,
  legacyFactories,
} from "@/config/contracts";
import { isHidden } from "@/config/hidden";

const factory = { address: deployment.factory, abi: ValueChainCollectionFactoryAbi } as const;

export interface RegisteredCollection {
  collection: `0x${string}`;
  creator: `0x${string}`;
  name: string;
  symbol: string;
  createdAt: bigint;
  totalSupply?: bigint;
}

/**
 * Every collection deployed through the factory, newest first.
 *
 * ValueChain has no NFT indexing service, so the registry inside the factory is
 * the index: one call returns the whole list, with no subgraph or log scanning.
 * The canonical Genesis collection predates the factory, so it is prepended by
 * hand rather than being missing from the marketplace it launched.
 */
export function useRegistry(limit = 24) {
  const { data: total } = useReadContract({
    ...factory,
    functionName: "totalCollections",
    query: { refetchInterval: 20_000 },
  });

  // Read the current factory and every previous one, so collections made before
  // a redeploy stay visible.
  const { data: pages, isLoading } = useReadContracts({
    contracts: [deployment.factory, ...legacyFactories].map((address) => ({
      address: address as `0x${string}`,
      abi: ValueChainCollectionFactoryAbi,
      functionName: "latestCollections" as const,
      args: [0n, BigInt(limit)],
    })),
    query: { refetchInterval: 20_000 },
  });

  const fromFactory = (pages ?? []).flatMap((entry) =>
    entry.status === "success" ? ((entry.result ?? []) as RegisteredCollection[]) : [],
  );

  const { data: genesis } = useReadContracts({
    contracts: [
      { address: deployment.collection, abi: ValueChainCollectionAbi, functionName: "name" },
      { address: deployment.collection, abi: ValueChainCollectionAbi, functionName: "symbol" },
      { address: deployment.collection, abi: ValueChainCollectionAbi, functionName: "owner" },
    ],
    query: { staleTime: 300_000 },
  });

  const collections: RegisteredCollection[] = [];

  if (genesis?.[0]?.status === "success") {
    collections.push({
      collection: deployment.collection,
      creator: (genesis[2]?.status === "success" ? genesis[2].result : deployment.collection) as `0x${string}`,
      name: genesis[0].result as string,
      symbol: (genesis[1]?.status === "success" ? genesis[1].result : "") as string,
      createdAt: 0n,
    });
  }

  for (const c of fromFactory) {
    if (c.collection.toLowerCase() === deployment.collection.toLowerCase()) continue;
    // The registry is append-only on chain, so anything withdrawn from the
    // marketplace has to be dropped here on the way out.
    if (isHidden(c.collection)) continue;
    collections.push(c);
  }

  return {
    collections,
    total: Number(total ?? 0n) + (genesis?.[0]?.status === "success" ? 1 : 0),
    isLoading,
  };
}
