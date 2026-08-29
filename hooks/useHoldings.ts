"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { resolveMediaUrl } from "@/lib/format";
import { useAllCollections } from "@/hooks/useAllCollections";
import type { Listing, TokenMetadata } from "@/hooks/useCollection";
import type { ChainToken } from "@/hooks/useEverything";

/**
 * Exactly what one address holds, across every collection.
 *
 * Deliberately not the sampling approach the browse pages use. Walking the first
 * N tokens of each collection and filtering by owner silently hides holdings
 * past N - a portfolio that under-reports what you own is worse than no portfolio.
 *
 * Instead this asks each collection how many the address holds, then reads back
 * exactly those ids through `tokenOfOwnerByIndex`. Two rounds of multicall, and
 * the answer is complete regardless of collection size.
 *
 * Enumerable is an optional ERC-721 extension. Collections that lack it report a
 * balance but cannot list which ids, so they are surfaced as a known gap rather
 * than being quietly dropped.
 */

const ZERO = "0x0000000000000000000000000000000000000000";

const ownerIndexAbi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function traitOf(m: TokenMetadata | undefined, name: string): string | undefined {
  const hit = m?.attributes?.find((a) => a.trait_type === name);
  return hit === undefined ? undefined : String(hit.value);
}

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
          // Unreachable metadata still leaves a token you demonstrably own.
        }
      }
    }),
  );

  return out;
}

export function useHoldings(address: `0x${string}` | undefined) {
  const { collections, isLoading: loadingCollections } = useAllCollections();

  // How many of each collection this address holds.
  const { data: balances, isLoading: loadingBalances } = useReadContracts({
    contracts: collections.map((c) => ({
      address: c.address,
      abi: erc721Abi,
      functionName: "balanceOf" as const,
      args: [address ?? ZERO],
    })),
    query: { enabled: address !== undefined && collections.length > 0, refetchInterval: 20_000 },
  });

  /** One slot per token held, so the ids can be fetched in a single multicall. */
  const slots: Array<{ collection: (typeof collections)[number]; index: number }> = [];
  collections.forEach((c, i) => {
    const entry = balances?.[i];
    if (entry?.status !== "success") return;

    const held = Number(entry.result as bigint);
    for (let n = 0; n < held; n++) slots.push({ collection: c, index: n });
  });

  const { data: idResults, isLoading: loadingIds } = useReadContracts({
    contracts: slots.map((s) => ({
      address: s.collection.address,
      abi: ownerIndexAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [address ?? ZERO, BigInt(s.index)],
    })),
    query: { enabled: address !== undefined && slots.length > 0 },
  });

  const held = slots
    .map((s, i) => {
      const entry = idResults?.[i];
      return entry?.status === "success"
        ? { collection: s.collection, id: entry.result as bigint }
        : undefined;
    })
    .filter((v): v is { collection: (typeof collections)[number]; id: bigint } => v !== undefined);

  const { data: details, isLoading: loadingDetails } = useReadContracts({
    contracts: held.flatMap((h) => [
      { address: h.collection.address, abi: erc721Abi, functionName: "tokenURI" as const, args: [h.id] },
      {
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "getListing" as const,
        args: [h.collection.address, h.id],
      },
    ]),
    query: { enabled: held.length > 0, refetchInterval: 25_000 },
  });

  const uris = held.map((_, i) => {
    const entry = details?.[i * 2];
    return entry?.status === "success" ? (entry.result as string) : undefined;
  });

  const { data: metadata, isLoading: loadingMeta } = useQuery({
    queryKey: ["holdings", address, uris.filter(Boolean).join("|")],
    enabled: uris.some((u) => u !== undefined),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () => fetchLimited(uris.map((u) => resolveMediaUrl(u) ?? ""), 10),
  });

  const tokens: ChainToken[] = held.map((h, i) => {
    const listingEntry = details?.[i * 2 + 1];
    const listing = listingEntry?.status === "success" ? (listingEntry.result as Listing) : undefined;
    const m = metadata?.[i];

    return {
      collection: h.collection.address,
      collectionName: h.collection.name,
      id: h.id,
      owner: address,
      listing: listing !== undefined && listing.seller !== ZERO ? listing : undefined,
      metadata: m,
      design: traitOf(m, "Design") ?? m?.name,
      tier: traitOf(m, "Tier"),
      edition: traitOf(m, "Edition"),
      image: resolveMediaUrl(m?.image),
    };
  });

  // Collections where the balance is non-zero but ids could not be enumerated.
  const unlistable = collections.filter((c, i) => {
    const balance = balances?.[i];
    if (balance?.status !== "success" || Number(balance.result as bigint) === 0) return false;
    return !held.some((h) => h.collection.address === c.address);
  });

  return {
    tokens,
    collections,
    unlistable,
    isLoading:
      loadingCollections || loadingBalances || loadingIds || loadingDetails || loadingMeta,
  };
}
