"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContract, useReadContracts } from "wagmi";
import { ValueChainCollectionAbi, ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { resolveMediaUrl } from "@/lib/format";

const collection = { address: deployment.collection, abi: ValueChainCollectionAbi } as const;

/**
 * NOTE: this module is scoped to ONE hardcoded collection.
 *
 * That is fine for what still uses it, and a trap for anything new. The home
 * page called `useCollectionStats` from here and reported the first
 * collection's supply as the whole marketplace's. For chain-wide figures use
 * `useChainStats`; for a specific collection pass its address explicitly.
 */
const marketplace = { address: deployment.marketplace, abi: ValueChainMarketplaceAbi } as const;

export interface TokenMetadata {
  name: string;
  description: string;
  image?: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}

export interface Token {
  id: bigint;
  owner: `0x${string}`;
  metadata?: TokenMetadata;
  design?: string;
  tier?: string;
  edition?: string;
}

export interface Listing {
  seller: `0x${string}`;
  paymentToken: `0x${string}`;
  price: bigint;
  expiry: bigint;
}

/** How many more this wallet may mint, and how many it already has. */
export function useMintAllowance(address?: `0x${string}`) {
  const { data } = useReadContracts({
    contracts: [
      { ...collection, functionName: "remainingForWallet", args: [address ?? "0x0"] },
      { ...collection, functionName: "publicMintedBy", args: [address ?? "0x0"] },
      { ...collection, functionName: "balanceOf", args: [address ?? "0x0"] },
    ],
    query: { enabled: address !== undefined, refetchInterval: 12_000 },
  });

  const value = (i: number) => (data?.[i]?.status === "success" ? (data[i].result as bigint) : undefined);

  return { remaining: value(0), minted: value(1), balance: value(2) };
}

/** Owners for a run of token ids, batched into one multicall. */
export function useTokenOwners(ids: bigint[]) {
  const { data, isLoading } = useReadContracts({
    contracts: ids.map((id) => ({ ...collection, functionName: "ownerOf" as const, args: [id] })),
    query: { enabled: ids.length > 0 },
  });

  const owners = new Map<string, `0x${string}`>();
  data?.forEach((entry, i) => {
    const id = ids[i];
    if (entry.status === "success" && id !== undefined) {
      owners.set(id.toString(), entry.result as `0x${string}`);
    }
  });

  return { owners, isLoading };
}

/** Marketplace listings for a run of token ids. */
export function useListings(ids: bigint[]) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      ...marketplace,
      functionName: "getListing" as const,
      args: [deployment.collection, id],
    })),
    query: { enabled: ids.length > 0, refetchInterval: 15_000 },
  });

  const listings = new Map<string, Listing>();
  data?.forEach((entry, i) => {
    const id = ids[i];
    if (entry.status !== "success" || id === undefined) return;

    const listing = entry.result as Listing;
    // A zero seller means no listing rather than a listing owned by nobody.
    if (listing.seller !== "0x0000000000000000000000000000000000000000") {
      listings.set(id.toString(), listing);
    }
  });

  return { listings, isLoading, refetch };
}

/**
 * Token metadata, fetched from wherever tokenURI points.
 *
 * Cached hard: this collection's metadata is immutable content on IPFS, so there
 * is nothing to gain from refetching it and a lot of gateway latency to avoid.
 */
export function useTokenMetadata(
  collectionAddress: `0x${string}` | undefined,
  tokenId: bigint | undefined,
) {
  const { data: uri } = useReadContract({
    address: collectionAddress,
    abi: ValueChainCollectionAbi,
    functionName: "tokenURI",
    args: tokenId === undefined ? undefined : [tokenId],
    query: { enabled: tokenId !== undefined && collectionAddress !== undefined, staleTime: Infinity },
  });

  return useQuery({
    queryKey: ["metadata", uri],
    enabled: typeof uri === "string" && uri !== "",
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
    queryFn: async (): Promise<TokenMetadata> => {
      const url = resolveMediaUrl(uri as string);
      if (url === undefined) throw new Error("Token has no metadata URI");

      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Metadata unavailable (HTTP ${res.status})`);

      return (await res.json()) as TokenMetadata;
    },
  });
}

/** Pulls a named trait out of metadata without callers repeating the find. */
export function trait(metadata: TokenMetadata | undefined, name: string): string | undefined {
  const found = metadata?.attributes?.find((a) => a.trait_type === name);
  return found === undefined ? undefined : String(found.value);
}
