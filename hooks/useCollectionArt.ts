"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ValueChainCollectionAbi } from "@/config/contracts";
import { useEverything } from "@/hooks/useEverything";
import { resolveMediaUrl } from "@/lib/format";

/** How many thumbnails a cover strip shows. */
const COVER = 4;

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
export function useCollectionArt(perCollection = COVER) {
  const { tokens, collections, isLoading } = useEverything(perCollection);

  /**
   * Distinct images only.
   *
   * A collection can be one design in many editions - "SoDex Larpers" is one
   * picture with a hundred - and every token then resolves to the same URL. Four
   * identical thumbnails is not a cover strip, it is a rendering bug that
   * happens to be accurate. The strip is `grid-auto-columns: 1fr`, so one image
   * simply fills it.
   */
  const fromMinted = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of tokens) {
      if (t.image === undefined || t.image === "") continue;
      const key = t.collection.toLowerCase();
      const list = map.get(key) ?? [];
      if (list.length < COVER && !list.includes(t.image)) list.push(t.image);
      map.set(key, list);
    }
    return map;
  }, [tokens]);

  /**
   * Collections with nothing minted yet.
   *
   * A creator who has just deployed sees a blank placeholder on every card,
   * because covers are assembled from minted tokens and there are none. The
   * artwork is pinned and serving perfectly well at that point — it is simply
   * not attached to a token yet, which is a poor first impression of a thing
   * that worked.
   */
  const unminted = useMemo(
    () => collections.filter((c) => (c.totalSupply ?? 0n) === 0n).map((c) => c.address),
    [collections],
  );

  /**
   * `baseURI` rather than `tokenURI`.
   *
   * `tokenURI(1)` reverts when nothing is minted — it is not a metadata check,
   * and a fresh collection is indistinguishable from one with no artwork if you
   * ask that way. `baseURI` answers regardless, and the metadata route behind it
   * recomputes any token from the pinned manifest whether or not it exists.
   */
  const { data: baseUris } = useReadContracts({
    contracts: unminted.map((address) => ({
      address,
      abi: ValueChainCollectionAbi,
      functionName: "baseURI" as const,
    })),
    query: { enabled: unminted.length > 0 },
  });

  const { data: fromManifest } = useQuery({
    queryKey: [
      "unminted-covers",
      unminted.join(","),
      (baseUris ?? []).map((r) => (r.status === "success" ? String(r.result) : "")).join(","),
    ],
    enabled: unminted.length > 0 && baseUris !== undefined,
    // Manifest-derived art is immutable for a given base URI.
    staleTime: Infinity,
    queryFn: async () => {
      const map = new Map<string, string[]>();

      await Promise.all(
        unminted.map(async (address, i) => {
          const r = baseUris?.[i];
          if (r?.status !== "success") return;
          const base = String(r.result);
          // An external ERC-721 may have no base URI at all.
          if (base === "") return;

          const ids = Array.from({ length: COVER }, (_, n) => n + 1);
          const images = await Promise.all(
            ids.map(async (id) => {
              try {
                // Generous, because this is a cold gateway read behind an API
                // route; 8s was short enough to drop half of them.
                const res = await fetch(`${base}${id}`, { signal: AbortSignal.timeout(15_000) });
                if (!res.ok) return undefined;
                const meta = (await res.json()) as { image?: string };
                return resolveMediaUrl(meta.image);
              } catch {
                // A collection whose metadata is unreachable simply has no
                // preview. It must not take the whole strip down with it.
                return undefined;
              }
            }),
          );

          const found = [...new Set(images.filter((u): u is string => u !== undefined))];
          if (found.length > 0) map.set(address.toLowerCase(), found);
        }),
      );

      return map;
    },
  });

  /** Artwork for one collection; empty when nothing is minted or reachable. */
  const artFor = (address: string): string[] => {
    const key = address.toLowerCase();
    const minted = fromMinted.get(key);
    if (minted !== undefined && minted.length > 0) return minted;
    return fromManifest?.get(key) ?? [];
  };

  return { artFor, isLoading };
}
