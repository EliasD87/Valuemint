"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { resolveMediaUrl } from "@/lib/format";
import type { TokenMetadata } from "./useCollection";

const collection = { address: deployment.collection, abi: ValueChainCollectionAbi } as const;

export interface LoadedToken {
  id: bigint;
  uri?: string;
  metadata?: TokenMetadata;
  design?: string;
  tier?: string;
  edition?: string;
  image?: string;
}

/**
 * Fetches many JSON documents without stampeding the gateway.
 *
 * A hundred simultaneous requests to an IPFS gateway is a good way to get rate
 * limited and end up slower than doing it politely, so this keeps a fixed number
 * in flight and lets the rest queue.
 */
async function fetchWithLimit<T>(
  items: string[],
  limit: number,
  fn: (url: string) => Promise<T>,
): Promise<Array<T | undefined>> {
  const results = new Array<T | undefined>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const url = items[index];
      if (url === undefined) continue;

      try {
        results[index] = await fn(url);
      } catch {
        results[index] = undefined;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

function traitOf(metadata: TokenMetadata | undefined, name: string): string | undefined {
  const hit = metadata?.attributes?.find((a) => a.trait_type === name);
  return hit === undefined ? undefined : String(hit.value);
}

/**
 * Loads a run of tokens with their metadata.
 *
 * The URIs come back in a single multicall, which is cheap. The metadata behind
 * them is immutable content on IPFS, so it is cached indefinitely - the slow part
 * happens once per browser rather than once per page view.
 */
export function useTokens(ids: bigint[]) {
  const { data: uriResults, isLoading: urisLoading } = useReadContracts({
    contracts: ids.map((id) => ({ ...collection, functionName: "tokenURI" as const, args: [id] })),
    query: { enabled: ids.length > 0, staleTime: Infinity },
  });

  const uris = ids.map((_, i) =>
    uriResults?.[i]?.status === "success" ? (uriResults[i].result as string) : undefined,
  );

  const key = uris.filter((u) => u !== undefined).join("|");

  const { data: metadata, isLoading: metaLoading } = useQuery({
    queryKey: ["tokens", key],
    enabled: key !== "",
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const urls = uris.map((u) => resolveMediaUrl(u) ?? "");
      return fetchWithLimit(urls, 8, async (url) => {
        if (url === "") throw new Error("no uri");
        const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as TokenMetadata;
      });
    },
  });

  const tokens: LoadedToken[] = ids.map((id, i) => {
    const meta = metadata?.[i];
    return {
      id,
      uri: uris[i],
      metadata: meta,
      design: traitOf(meta, "Design"),
      tier: traitOf(meta, "Tier"),
      edition: traitOf(meta, "Edition"),
      image: resolveMediaUrl(meta?.image),
    };
  });

  return { tokens, isLoading: urisLoading || metaLoading, metadataReady: metadata !== undefined };
}

/**
 * `[1n, 2n, … n]` — a *guess* at the ids of everything minted so far.
 *
 * Only correct for collections that number sequentially from 1. Prefer
 * `useTokenIds`, which asks the contract via `tokenByIndex`; this remains for
 * callers that have no contract handy.
 */
export function rangeOfIds(total: bigint | undefined): bigint[] {
  if (total === undefined || total === 0n) return [];
  return Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1));
}
