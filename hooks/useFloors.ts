"use client";

import { useMemo } from "react";
import { useListingFeed } from "@/hooks/useListingFeed";

/**
 * Floor prices, per collection and per tier within a collection.
 *
 * A floor is the cheapest way to own a *particular thing*, so it only exists
 * once you have said which thing. The market page used to take the minimum
 * across every listing on the chain and label it "floor", which produced a
 * headline of 2 SOSO on a page where The Trenches started at 500 - a number
 * that described nothing on screen.
 *
 * Tiers make the same point one level down. A collection with an Epic and a
 * Common edition has two floors, and quoting the lower one as "the floor" tells
 * someone shopping for an Epic exactly the wrong thing. Where a collection has
 * more than one tier, that is worth showing rather than flattening - which is
 * why this returns the breakdown as well as the single figure.
 *
 * Built on `useListingFeed`, and deliberately not on its own scan: React Query
 * dedupes by key, so a page using both pays for one pass over the logs.
 */

export interface TierFloor {
  tier: string;
  price: bigint;
  count: number;
}

export function useFloors() {
  const { tokens, isLoading } = useListingFeed();

  const { byCollection, byTier } = useMemo(() => {
    const collection = new Map<string, bigint>();
    const tier = new Map<string, Map<string, { price: bigint; count: number }>>();

    for (const t of tokens) {
      const price = t.listing?.price;
      if (price === undefined) continue;
      const key = t.collection.toLowerCase();

      const seen = collection.get(key);
      if (seen === undefined || price < seen) collection.set(key, price);

      /**
       * Untiered tokens are grouped under a single bucket rather than dropped.
       * Most collections have no `Tier` trait at all, and losing their listings
       * from the breakdown would make the tier floors disagree with the
       * collection floor for no visible reason.
       */
      const label = t.tier ?? "";
      const inner = tier.get(key) ?? new Map();
      const at = inner.get(label);
      if (at === undefined) inner.set(label, { price, count: 1 });
      else inner.set(label, { price: price < at.price ? price : at.price, count: at.count + 1 });
      tier.set(key, inner);
    }

    return { byCollection: collection, byTier: tier };
  }, [tokens]);

  return {
    isLoading,

    /** The cheapest listing in one collection, or undefined if none. */
    floorFor: (address: string): bigint | undefined => byCollection.get(address.toLowerCase()),

    /**
     * Floors within one collection, cheapest first.
     *
     * Empty when the collection has no tiers worth showing - a single bucket is
     * just the collection floor again, and repeating it as a breakdown is
     * noise rather than information.
     */
    tierFloorsFor: (address: string): TierFloor[] => {
      const inner = byTier.get(address.toLowerCase());
      if (inner === undefined) return [];
      const rows = [...inner.entries()]
        .filter(([label]) => label !== "")
        .map(([label, v]) => ({ tier: label, price: v.price, count: v.count }));
      if (rows.length < 2) return [];
      rows.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
      return rows;
    },
  };
}
