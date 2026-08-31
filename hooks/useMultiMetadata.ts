"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { resolveMediaUrl } from "@/lib/format";
import type { TokenMetadata } from "@/hooks/useCollection";
import { expandIdTemplate } from "@/lib/erc1155";

/**
 * Metadata for an ERC-1155 id.
 *
 * A separate hook because the two standards do not agree on how to ask.
 * ERC-721 has `tokenURI(id)` and returns a finished URL per token. ERC-1155 has
 * `uri(id)` and is allowed - encouraged, in the EIP - to return a single
 * template for the whole collection with a literal `{id}` in it, which the
 * client substitutes.
 *
 * Trading Beasts on this chain does exactly that:
 * `https://api.tradingbeasts.xyz/cards/{id}.json`. Calling `tokenURI` on it
 * reverts, which is why an edition token rendered "No artwork" before this
 * existed.
 *
 * The substitution rule is specific and easy to get wrong: EIP-1155 says the
 * id must be lowercase hex, zero-padded to 64 characters, with no `0x`.
 */
const uriAbi = [
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export function useMultiTokenMetadata(
  collection: `0x${string}` | undefined,
  tokenId: bigint | undefined,
) {
  const { data: template } = useReadContract({
    address: collection,
    abi: uriAbi,
    functionName: "uri",
    args: tokenId === undefined ? undefined : [tokenId],
    query: {
      enabled: collection !== undefined && tokenId !== undefined,
      staleTime: Infinity,
    },
  });

  const uri =
    typeof template === "string" && template !== "" && tokenId !== undefined
      ? expandIdTemplate(template, tokenId)
      : undefined;

  return useQuery({
    queryKey: ["multiMetadata", uri],
    enabled: uri !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<TokenMetadata> => {
      const url = resolveMediaUrl(uri!);
      if (url === undefined) throw new Error("Token has no metadata URI");

      /**
       * Bounded, because this is a third-party host we do not control. An
       * edition collection can point `uri()` anywhere, and a slow or hanging
       * endpoint should cost this page a few seconds, not the session.
       */
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Metadata responded ${res.status}`);
        return (await res.json()) as TokenMetadata;
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
