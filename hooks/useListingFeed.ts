"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { useTokenDocuments } from "@/hooks/useTokenDocuments";
import { resolveMediaUrl } from "@/lib/format";
import { toListing } from "@/lib/seaport";
import { useAllCollections } from "@/hooks/useAllCollections";
import { useSeaportListings, useSeaportOrders } from "@/hooks/useSeaportOrders";
import type { TokenMetadata } from "@/hooks/useCollection";
import type { ChainToken } from "@/hooks/useEverything";
import { tierOf, traitOf } from "@/lib/tokenMetadata";
import { oneListingPerToken } from "@/lib/oneListingPerToken";





export function useListingFeed() {
  const { collections, isLoading: loadingCollections } = useAllCollections();
  const { listings: everything, isLoading: loadingOrders, logsUnavailable } = useSeaportListings();
  const { candidateListings } = useSeaportOrders();

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
   * Each listed token's `tokenURI`, asked of every token a listing NAMES —
   * before the order book has decided which listings stand.
   *
   * This used to read `ownerOf`, `tokenURI` and `isApprovedForAll` for the
   * verified listings, which meant waiting for the book's two rounds of checks
   * and then making a third: measured 2026-09-30 from the owner's connection,
   * three sequential multicalls of seconds each before /market drew a card.
   * Ownership and approval were also exactly the pair the book had just read
   * to decide `fillable`, so they were asked twice. Now the book's answer
   * stands for both, and the one thing it does not read, the URI, goes out
   * alongside its checks. Only verified listings are ever shown; the handful
   * of extra URIs are for listings the checks then drop.
   */
  const uriTargets = useMemo(() => {
    if (collections.length === 0) return [];
    const known = new Set(collections.map((c) => c.address.toLowerCase()));
    const seen = new Set<string>();
    return candidateListings.filter((t) => {
      const key = `${t.collection.toLowerCase()}-${t.tokenId}`;
      if (!known.has(t.collection.toLowerCase()) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [candidateListings, collections]);

  const { data: uriReads, isLoading: loadingUris } = useReadContracts({
    contracts: uriTargets.map((t) => ({
      address: t.collection,
      abi: erc721Abi,
      functionName: "tokenURI" as const,
      args: [t.tokenId],
    })),
    query: { enabled: uriTargets.length > 0 },
  });

  const uriByToken = useMemo(() => {
    const out = new Map<string, string>();
    uriTargets.forEach((t, i) => {
      const entry = uriReads?.[i];
      if (entry?.status === "success") out.set(`${t.collection.toLowerCase()}-${t.tokenId}`, entry.result as string);
    });
    return out;
  }, [uriTargets, uriReads]);

  const uris = listings.map((l) => uriByToken.get(`${l.collection.toLowerCase()}-${l.tokenId ?? 0n}`));

  const { documents: metadata, isLoading: loadingMeta } = useTokenDocuments(uris);

  const nameOf = (address: `0x${string}`) =>
    collections.find((c) => c.address.toLowerCase() === address.toLowerCase())?.name ?? "Collection";

  const tokens: Array<ChainToken & { active: boolean }> = listings.map((order, i) => {
    const m = metadata?.[i];

    return {
      collection: order.collection,
      collectionName: nameOf(order.collection),
      id: order.tokenId ?? 0n,
      /**
       * The seller. Every listing here is `fillable`, which the book decides
       * from these same two reads — the token's owner is the maker, and the
       * maker has approved Seaport — so this is what `ownerOf` answered.
       */
      owner: order.maker,
      listing: toListing(order),
      /**
       * Fillable right now, by the book's own reads. Unknown ownership counts
       * as not fillable there, so a listing is never active on a guess: a buy
       * shown against a listing that reverts costs the buyer gas and costs us
       * their trust, while a listing briefly hidden costs a refresh.
       */
      active: order.fillable,
      metadata: m,
      design: traitOf(m, "Design") ?? m?.name,
      tier: tierOf(m),
      edition: traitOf(m, "Edition"),
      image: resolveMediaUrl(m?.image),
      uri: uris[i],
    };
  });

  return {
    /**
     * One row per piece, not per order. A token listed twice is two orders and
     * one thing for sale, and two rows became two cards sharing a React key —
     * see `lib/oneListingPerToken.ts` for what that did to the market's filters.
     */
    tokens: oneListingPerToken(tokens),
    collections,
    isLoading: loadingCollections || loadingOrders || loadingUris || loadingMeta,
    logsUnavailable,
  };
}
