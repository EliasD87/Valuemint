"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { SEAPORT } from "@/config/seaport";
import { resolveMediaUrl } from "@/lib/format";
import { toListing } from "@/lib/seaport";
import { useAllCollections } from "@/hooks/useAllCollections";
import { useSeaportListings } from "@/hooks/useSeaportOrders";
import type { TokenMetadata } from "@/hooks/useCollection";
import type { ChainToken } from "@/hooks/useEverything";
import { readTokenMetadata, traitOf } from "@/lib/tokenMetadata";

/**
 * Every live listing on the marketplace.
 *
 * Seaport's `OrderValidated` log is the order book, so this is a scan and a
 * filter rather than a walk over tokens. The alternative - asking each token in
 * each collection whether it is for sale - either misses listings past whatever
 * sample size is chosen or costs a call per token in existence.
 *
 * `useSeaportOrders` has already dropped anything cancelled, filled, expired or
 * swept away by a counter increment. What it cannot know is whether the seller
 * still holds the token and still lets Seaport move it, because that lives on
 * the collection rather than in the order. A seller who transfers a listed token
 * elsewhere leaves an order that looks perfect and reverts on contact, so both
 * are checked here and the result is exposed as `active`.
 */

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
          if (res.ok) out[i] = readTokenMetadata(await res.json());
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
  const { listings: everything, isLoading: loadingOrders, logsUnavailable } = useSeaportListings();

  /**
   * Only collections this marketplace actually knows.
   *
   * The order book is permissionless — anyone can `validate()` an order against
   * any contract — and this feed used to render all of it, labelling anything
   * unrecognised with the literal "Collection". So a stranger could deploy a
   * contract, name it after a real one, list fakes, and appear on /market beside
   * the genuine article under a name the page supplied for them.
   *
   * `useAllCollections` is the registry: the factory's own records, the explicit
   * allow-list in `config/known.ts`, and the explorer's token index, minus
   * `hidden.ts`. Anything outside it is not shown here. A holder can still reach
   * such a token directly by address — that is deliberate, the chain is open —
   * but the marketplace does not put its name to it.
   */
  const listings = useMemo(() => {
    if (collections.length === 0) return [];
    const known = new Set(collections.map((c) => c.address.toLowerCase()));
    return everything.filter((l) => known.has(l.collection.toLowerCase()));
  }, [everything, collections]);

  /**
   * Ownership, approval and artwork for each listed token.
   *
   * `isApprovedForAll` is asked per listing rather than per seller. It would
   * deduplicate, but the calls are batched into a single multicall either way,
   * and keeping the arrays index-aligned with `listings` is what stops a
   * mismatched offset silently pairing one listing's price with another's
   * approval.
   */
  const { data: state, isLoading: loadingState } = useReadContracts({
    contracts: listings.flatMap((l) => [
      { address: l.collection, abi: erc721Abi, functionName: "ownerOf" as const, args: [l.tokenId ?? 0n] },
      { address: l.collection, abi: erc721Abi, functionName: "tokenURI" as const, args: [l.tokenId ?? 0n] },
      {
        address: l.collection,
        abi: erc721Abi,
        functionName: "isApprovedForAll" as const,
        args: [l.maker, SEAPORT],
      },
    ]),
    query: { enabled: listings.length > 0, refetchInterval: 25_000 },
  });

  const uris = listings.map((_, i) => {
    const entry = state?.[i * 3 + 1];
    return entry?.status === "success" ? (entry.result as string) : undefined;
  });

  const { data: metadata, isLoading: loadingMeta } = useQuery({
    /**
     * Positions matter in this key.
     *
     * It was `uris.filter(Boolean).join("|")`, which drops the gaps — so two
     * different arrangements of the same URIs produced the SAME cache key while
     * the results are read back positionally (`metadata?.[i]` against the full
     * slot list). `[undefined, "A", "B"]` and `["A", "B", undefined]` both keyed
     * as "A|B", and whichever landed first was served for the other: the wrong
     * picture and the wrong name against a token somebody might be about to buy.
     *
     * Keeping the gaps as empty strings makes the key describe the array actually
     * being fetched.
     */
queryKey: ["listing-meta", uris.filter(Boolean).join("|")],
    enabled: uris.some((u) => u !== undefined),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () => fetchLimited(uris.map((u) => resolveMediaUrl(u) ?? ""), 10),
  });

  const nameOf = (address: `0x${string}`) =>
    collections.find((c) => c.address.toLowerCase() === address.toLowerCase())?.name ?? "Collection";

  const tokens: Array<ChainToken & { active: boolean }> = listings.map((order, i) => {
    const ownerEntry = state?.[i * 3];
    const approvalEntry = state?.[i * 3 + 2];
    const owner = ownerEntry?.status === "success" ? (ownerEntry.result as `0x${string}`) : undefined;
    const approved = approvalEntry?.status === "success" ? (approvalEntry.result as boolean) : false;
    const m = metadata?.[i];

    return {
      collection: order.collection,
      collectionName: nameOf(order.collection),
      id: order.tokenId ?? 0n,
      owner,
      listing: toListing(order),
      /**
       * Fillable right now. Unknown ownership counts as not active rather than
       * active: a buy shown against a listing that reverts costs the buyer gas
       * and costs us their trust, while a listing briefly hidden costs a refresh.
       */
      active:
        owner !== undefined && approved && owner.toLowerCase() === order.maker.toLowerCase(),
      metadata: m,
      design: traitOf(m, "Design") ?? m?.name,
      tier: traitOf(m, "Tier"),
      edition: traitOf(m, "Edition"),
      image: resolveMediaUrl(m?.image),
      uri: uris[i],
    };
  });

  return {
    tokens,
    collections,
    isLoading: loadingCollections || loadingOrders || loadingState || loadingMeta,
    logsUnavailable,
  };
}
