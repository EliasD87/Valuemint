"use client";

import { useMemo } from "react";
import { useEverything } from "@/hooks/useEverything";

/**
 * A few pieces from each collection, for previews.
 *
 * Built on `useEverything` rather than a second set of chain reads, because it
 * already walks the first n tokens of every collection and resolves their
 * metadata. Asking for the same thing twice would double the gateway traffic
 * for a picture strip.
 *
 * `perCollection` is small on purpose. Every extra token is another metadata
 * fetch across every collection on the chain, and four thumbnails is as much as
 * a card can show.
 */
export function useCollectionArt(perCollection = 4) {
  const { tokens, isLoading } = useEverything(perCollection);

  const byCollection = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of tokens) {
      if (t.image === undefined || t.image === "") continue;
      const key = t.collection.toLowerCase();
      const list = map.get(key) ?? [];
      if (list.length < 4) list.push(t.image);
      map.set(key, list);
    }
    return map;
  }, [tokens]);

  /** Artwork for one collection; empty when nothing is minted or reachable. */
  const artFor = (address: string): string[] => byCollection.get(address.toLowerCase()) ?? [];

  return { artFor, isLoading };
}
