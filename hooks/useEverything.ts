"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { enumerableAbi } from "@/config/erc721";
import { resolveMediaUrl } from "@/lib/format";
import { useAllCollections, type CollectionSummary } from "@/hooks/useAllCollections";
import type { Listing, TokenMetadata } from "@/hooks/useCollection";

/**
 * Tokens across every collection on the chain, rather than one hardcoded address.
 *
 * The marketplace hosts collections; it is not one. Pages that walked a single
 * collection were the reason listings and holdings kept showing only the first
 * collection ever deployed here.
 *
 * Each collection is capped at `perCollection` tokens so one very large one
 * cannot stall the page. That is a display limit, not a claim about what exists,
 * and the pages say so where it bites.
 */

export interface ChainToken {
  collection: `0x${string}`;
  collectionName: string;
  id: bigint;
  owner?: `0x${string}`;
  listing?: Listing;
  metadata?: TokenMetadata;
  design?: string;
  tier?: string;
  edition?: string;
  image?: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

function traitOf(m: TokenMetadata | undefined, name: string): string | undefined {
  const hit = m?.attributes?.find((a) => a.trait_type === name);
  return hit === undefined ? undefined : String(hit.value);
}

/** Fetches many documents without stampeding the gateway. */
async function fetchLimited(urls: string[], limit: number) {
  const out = new Array<TokenMetadata | undefined>(urls.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, urls.length) }, async () => {
      while (cursor < urls.length) {
        const i = cursor++;
        const url = urls[i];
        if (url === undefined || url === "") continue;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
          if (res.ok) out[i] = (await res.json()) as TokenMetadata;
        } catch {
          // A collection with unreachable metadata still renders as a token.
        }
      }
    }),
  );

  return out;
}

export function useEverything(perCollection = 30) {
  const { collections, isLoading: loadingCollections } = useAllCollections();

  // Supply per collection, so we know which ids exist without guessing.
  const { data: supplies } = useReadContracts({
    contracts: collections.map((c) => ({
      address: c.address,
      abi: enumerableAbi,
      functionName: "totalSupply" as const,
    })),
    query: { enabled: collections.length > 0, refetchInterval: 30_000 },
  });

  /** One flat list of every (collection, tokenId) worth loading. */
  const slots: Array<{ collection: CollectionSummary; id: bigint }> = [];
  collections.forEach((c, i) => {
    const entry = supplies?.[i];
    if (entry?.status !== "success") return;

    const count = Math.min(Number(entry.result as bigint), perCollection);
    for (let n = 1; n <= count; n++) slots.push({ collection: c, id: BigInt(n) });
  });

  const { data: chainData, isLoading: loadingChain } = useReadContracts({
    contracts: slots.flatMap((s) => [
      { address: s.collection.address, abi: erc721Abi, functionName: "ownerOf" as const, args: [s.id] },
      { address: s.collection.address, abi: erc721Abi, functionName: "tokenURI" as const, args: [s.id] },
      {
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "getListing" as const,
        args: [s.collection.address, s.id],
      },
    ]),
    query: { enabled: slots.length > 0, refetchInterval: 25_000 },
  });

  const uris = slots.map((_, i) => {
    const entry = chainData?.[i * 3 + 1];
    return entry?.status === "success" ? (entry.result as string) : undefined;
  });

  const { data: metadata, isLoading: loadingMeta } = useQuery({
    queryKey: ["everything", uris.filter(Boolean).join("|")],
    enabled: uris.some((u) => u !== undefined),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () => fetchLimited(uris.map((u) => resolveMediaUrl(u) ?? ""), 10),
  });

  const tokens: ChainToken[] = slots.map((slot, i) => {
    const ownerEntry = chainData?.[i * 3];
    const listingEntry = chainData?.[i * 3 + 2];
    const listing = listingEntry?.status === "success" ? (listingEntry.result as Listing) : undefined;
    const m = metadata?.[i];

    return {
      collection: slot.collection.address,
      collectionName: slot.collection.name,
      id: slot.id,
      owner: ownerEntry?.status === "success" ? (ownerEntry.result as `0x${string}`) : undefined,
      listing: listing !== undefined && listing.seller !== ZERO ? listing : undefined,
      metadata: m,
      design: traitOf(m, "Design") ?? m?.name,
      tier: traitOf(m, "Tier"),
      edition: traitOf(m, "Edition"),
      image: resolveMediaUrl(m?.image),
    };
  });

  return {
    tokens,
    collections,
    isLoading: loadingCollections || loadingChain || loadingMeta,
    /** True when at least one collection has more tokens than we loaded. */
    truncated: collections.some((_, i) => {
      const entry = supplies?.[i];
      return entry?.status === "success" && Number(entry.result as bigint) > perCollection;
    }),
  };
}
