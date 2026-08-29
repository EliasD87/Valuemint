"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { parseAbiItem } from "viem";
import { erc721Abi } from "viem";
import { createPublicClient, http } from "viem";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { valuechain } from "@/config/chain";
import { resolveMediaUrl } from "@/lib/format";
import { useAllCollections } from "@/hooks/useAllCollections";
import type { Listing, TokenMetadata } from "@/hooks/useCollection";
import type { ChainToken } from "@/hooks/useEverything";

/**
 * Every live listing, found from the marketplace's own events.
 *
 * The alternative - walking each collection's tokens and asking about each one -
 * either misses listings past whatever sample size is chosen, or costs a call per
 * token in existence. Neither is acceptable: the first hides real listings, the
 * second stops working as soon as a collection is large.
 *
 * `Listed` events name exactly the tokens that have ever been offered, which is a
 * far smaller set. Each candidate is then re-checked on chain, because an event
 * only says a listing once existed - it may since have sold, been cancelled, or
 * gone stale because the seller moved the token.
 */

const ZERO = "0x0000000000000000000000000000000000000000";

const LISTED = parseAbiItem(
  "event Listed(address indexed collection, uint256 indexed tokenId, address indexed seller, address paymentToken, uint256 price, uint64 expiry)",
);

/** The block the marketplace was deployed in; nothing relevant precedes it. */
const FROM_BLOCK = 13_617_000n;

const client = createPublicClient({
  chain: valuechain,
  transport: http("https://mainnet.valuechain.xyz", { batch: true }),
});

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
          // A listing with unreachable art is still a listing.
        }
      }
    }),
  );

  return out;
}

export function useListingFeed() {
  const { collections, isLoading: loadingCollections } = useAllCollections();

  /** Every token that has ever been listed, deduplicated. */
  const { data: candidates, isLoading: loadingLogs, error } = useQuery({
    queryKey: ["listed-events"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const logs = await client.getLogs({
        address: deployment.marketplace,
        event: LISTED,
        fromBlock: FROM_BLOCK,
        toBlock: "latest",
      });

      const seen = new Map<string, { collection: `0x${string}`; id: bigint }>();
      for (const log of logs) {
        const collection = log.args.collection;
        const id = log.args.tokenId;
        if (collection === undefined || id === undefined) continue;
        seen.set(`${collection.toLowerCase()}-${id}`, { collection, id });
      }

      return [...seen.values()];
    },
  });

  const slots = candidates ?? [];

  // An event proves a listing existed, not that it still does.
  const { data: state, isLoading: loadingState } = useReadContracts({
    contracts: slots.flatMap((s) => [
      {
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "getListing" as const,
        args: [s.collection, s.id],
      },
      {
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "isListingActive" as const,
        args: [s.collection, s.id],
      },
      { address: s.collection, abi: erc721Abi, functionName: "ownerOf" as const, args: [s.id] },
      { address: s.collection, abi: erc721Abi, functionName: "tokenURI" as const, args: [s.id] },
    ]),
    query: { enabled: slots.length > 0, refetchInterval: 25_000 },
  });

  const live = slots
    .map((slot, i) => {
      const listingEntry = state?.[i * 4];
      const activeEntry = state?.[i * 4 + 1];
      const ownerEntry = state?.[i * 4 + 2];
      const uriEntry = state?.[i * 4 + 3];
      if (listingEntry?.status !== "success") return undefined;

      const listing = listingEntry.result as Listing;
      if (listing.seller === ZERO) return undefined;

      return {
        slot,
        listing,
        active: activeEntry?.status === "success" ? (activeEntry.result as boolean) : false,
        owner: ownerEntry?.status === "success" ? (ownerEntry.result as `0x${string}`) : undefined,
        uri: uriEntry?.status === "success" ? (uriEntry.result as string) : undefined,
        index: i,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== undefined);

  const { data: metadata, isLoading: loadingMeta } = useQuery({
    queryKey: ["listing-meta", live.map((l) => l.uri).join("|")],
    enabled: live.some((l) => l.uri !== undefined),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () => fetchLimited(live.map((l) => resolveMediaUrl(l.uri) ?? ""), 10),
  });

  const nameOf = (address: `0x${string}`) =>
    collections.find((c) => c.address.toLowerCase() === address.toLowerCase())?.name ?? "Collection";

  const tokens: Array<ChainToken & { active: boolean }> = live.map((l, i) => {
    const m = metadata?.[i];
    return {
      collection: l.slot.collection,
      collectionName: nameOf(l.slot.collection),
      id: l.slot.id,
      owner: l.owner,
      listing: l.listing,
      active: l.active,
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
    isLoading: loadingCollections || loadingLogs || loadingState || loadingMeta,
    logsUnavailable: error !== null,
  };
}
