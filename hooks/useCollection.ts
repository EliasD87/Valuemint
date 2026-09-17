"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContract, useReadContracts } from "wagmi";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { resolveMediaUrl } from "@/lib/format";
import { readTokenMetadata, type TokenMetadata } from "@/lib/tokenMetadata";

const collection = { address: deployment.collection, abi: ValueChainCollectionAbi } as const;

/**
 * NOTE: this module is scoped to ONE hardcoded collection.
 *
 * That is fine for what still uses it, and a trap for anything new. The home
 * page called `useCollectionStats` from here and reported the first
 * collection's supply as the whole marketplace's. For chain-wide figures use
 * `useChainStats`; for a specific collection pass its address explicitly.
 */
/**
 * Re-exported so the shape and the validator that produces it stay together.
 * Everything already imports `TokenMetadata` from here; `lib/tokenMetadata.ts`
 * is where it is now defined, and it is free of wagmi so it can be tested.
 */
export type { TokenMetadata };

export interface Token {
  id: bigint;
  owner: `0x${string}`;
  metadata?: TokenMetadata;
  design?: string;
  tier?: string;
  edition?: string;
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

  const query = useQuery({
    queryKey: ["metadata", uri],
    enabled: typeof uri === "string" && uri !== "",
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
    queryFn: async (): Promise<TokenMetadata | undefined> => {
      const url = resolveMediaUrl(uri as string);
      if (url === undefined) throw new Error("Token has no metadata URI");

      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Metadata unavailable (HTTP ${res.status})`);

      return readTokenMetadata(await res.json());
    },
  });

  /**
   * The raw answer, handed back alongside the parsed document.
   *
   * The query above is deliberately disabled for an empty `tokenURI`, which
   * leaves it idle rather than errored - indistinguishable, from outside, from
   * a fetch still in flight. So a collection that publishes nothing showed a
   * loading shimmer that never resolved, and read as a broken marketplace
   * rather than an empty contract. `uri === ""` is the difference, and only
   * this hook can see it.
   */
  return { ...query, uri: typeof uri === "string" ? uri : undefined };
}

/**
 * Pulls a named trait out of metadata. Kept under this name because the token
 * pages import it from here; the implementation is the shared one.
 */
export { traitOf as trait } from "@/lib/tokenMetadata";
