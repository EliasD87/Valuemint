"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { resolveMediaUrl } from "@/lib/format";
import type { LoadedToken } from "@/hooks/useTokens";
import type { TokenMetadata } from "@/hooks/useCollection";

/**
 * Loads tokens from an arbitrary ERC-721, using only the standard interface.
 *
 * The Genesis-specific hook assumes our own traits and metadata shape. Someone
 * else's collection may have neither, so this reads what the standard guarantees
 * and treats everything beyond that as optional. A collection whose metadata is
 * unreachable still renders as a card with an id, rather than vanishing.
 */
async function fetchLimited<T>(urls: string[], limit: number, fn: (u: string) => Promise<T>) {
  const out = new Array<T | undefined>(urls.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, urls.length) }, async () => {
      while (cursor < urls.length) {
        const i = cursor++;
        const url = urls[i];
        if (url === undefined || url === "") continue;
        try {
          out[i] = await fn(url);
        } catch {
          out[i] = undefined;
        }
      }
    }),
  );

  return out;
}

export function useGenericTokens(collection: `0x${string}` | undefined, ids: bigint[]) {
  const { data: uriResults, isLoading: urisLoading } = useReadContracts({
    contracts: ids.map((id) => ({
      address: collection,
      abi: erc721Abi,
      functionName: "tokenURI" as const,
      args: [id],
    })),
    query: { enabled: collection !== undefined && ids.length > 0, staleTime: Infinity },
  });

  const uris = ids.map((_, i) =>
    uriResults?.[i]?.status === "success" ? (uriResults[i].result as string) : undefined,
  );

  const key = `${collection ?? ""}:${uris.filter(Boolean).join("|")}`;

  const { data: metadata, isLoading: metaLoading } = useQuery({
    queryKey: ["generic-tokens", key],
    enabled: collection !== undefined && uris.some((u) => u !== undefined),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () =>
      fetchLimited(
        uris.map((u) => resolveMediaUrl(u) ?? ""),
        8,
        async (url) => {
          const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as TokenMetadata;
        },
      ),
  });

  const traitOf = (m: TokenMetadata | undefined, name: string) => {
    const hit = m?.attributes?.find((a) => a.trait_type === name);
    return hit === undefined ? undefined : String(hit.value);
  };

  const tokens: LoadedToken[] = ids.map((id, i) => {
    const m = metadata?.[i];
    return {
      id,
      uri: uris[i],
      metadata: m,
      // Fall back to the token's own name; not every collection uses a Design trait.
      design: traitOf(m, "Design") ?? m?.name ?? `#${id.toString()}`,
      tier: traitOf(m, "Tier"),
      edition: traitOf(m, "Edition"),
      image: resolveMediaUrl(m?.image),
    };
  });

  return { tokens, isLoading: urisLoading || metaLoading };
}
