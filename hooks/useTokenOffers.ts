"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useOffersForToken, useTraitOffers, type SeaportOrder } from "@/hooks/useSeaportOrders";
import { boundsOf, fetchMemberRoots, rootKey, traitLabel } from "@/hooks/useCriteria";

/** An offer a piece could be sold into, and the trait it came through, if any. */
export type TokenOffer = SeaportOrder & { trait?: string };

/**
 * Every offer one piece could be sold into: bids naming it, bids on any piece,
 * and trait offers whose set contains it.
 *
 * `useOffersForToken` alone leaves trait offers out — deliberately, so no older
 * screen shows one as "any piece" — which left every card saying "No offers"
 * beside a Common box a Common offer was standing on. This is what cards and
 * their dialog use. Collections with no trait offer standing ask nothing
 * extra; the rest ask in one batched request per page (`fetchMemberRoots`).
 */
export function useTokenOffers(collection: Address | undefined, tokenId: bigint | undefined) {
  const direct = useOffersForToken(collection, tokenId);
  const { offers: traitAll } = useTraitOffers(collection);
  const bounds = boundsOf(traitAll);

  const { data: roots } = useQuery({
    queryKey: ["criteria-member", collection?.toLowerCase(), tokenId?.toString(), bounds.join(",")],
    enabled: collection !== undefined && tokenId !== undefined && traitAll.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchMemberRoots(collection!, tokenId!, bounds),
  });

  const offers = useMemo<TokenOffer[]>(() => {
    const trait = traitAll.flatMap((o) => {
      const set = o.criteria === undefined || roots === undefined ? undefined : roots.get(rootKey(o.criteria));
      return set === undefined ? [] : [{ ...o, trait: traitLabel(set) }];
    });
    return [...direct.offers, ...trait].sort((a, b) =>
      b.priceWei > a.priceWei ? 1 : b.priceWei < a.priceWei ? -1 : 0,
    );
  }, [direct.offers, traitAll, roots]);

  return { offers, best: offers[0], isLoading: direct.isLoading, logsUnavailable: direct.logsUnavailable };
}
