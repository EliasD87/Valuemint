"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CYBEREATOR } from "@/lib/cybereator";

/**
 * The Cybereators opened so far, as token ids (`/api/cybereator/opened`).
 *
 * `undefined` until the first answer — a filter must not read "nothing is
 * opened" before it has asked. Refreshed every 30 seconds while the page is
 * visible, so the Opened count climbs during the reveal without a reload.
 */
export function useCybereatorOpened(enabled: boolean): Set<string> | undefined {
  const { data } = useQuery({
    queryKey: ["cybereator-opened"],
    enabled,
    staleTime: 20_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: 1,
    queryFn: async (): Promise<string[]> => {
      const res = await fetch("/api/cybereator/opened");
      if (!res.ok) throw new Error(`opened ${res.status}`);
      const body = (await res.json()) as { ids?: unknown };
      return Array.isArray(body.ids) ? body.ids.map(String) : [];
    },
  });
  return useMemo(() => (data === undefined ? undefined : new Set(data)), [data]);
}

/** The three ways to look at Cybereator during its reveal. */
export type SealFilter = "all" | "opened" | "sealed";

/**
 * Whether an "any piece" offer applies to a given piece, for showing it.
 *
 * On Cybereator, only to sealed ones (owner, 2026-11-10). An "any piece" bid
 * is priced for the cheapest box, and shown beside an opened Epic it read as
 * "50 SOSO offered for this Epic". It can still be accepted on chain, as any
 * collection offer can; the site just does not present it as this piece's
 * price, and does not suggest selling an opened piece into it. Until the
 * opened list arrives, no Cybereator counts as sealed.
 *
 * Every other collection: always.
 */
export function useAnyPieceApplies(
  collection: string | undefined,
): (tokenId: bigint, pieceCollection?: string, openedOnly?: boolean) => boolean {
  const watching = collection === undefined || collection.toLowerCase() === CYBEREATOR;
  const opened = useCybereatorOpened(watching);
  return useCallback(
    (tokenId: bigint, pieceCollection?: string, openedOnly = false) => {
      const c = (pieceCollection ?? collection)?.toLowerCase();
      if (c !== CYBEREATOR) return !openedOnly;
      /* An "Any opened" offer (OpenedOnlyZone) is the reverse: opened pieces only. */
      if (openedOnly) return opened !== undefined && opened.has(tokenId.toString());
      return opened !== undefined && !opened.has(tokenId.toString());
    },
    [collection, opened],
  );
}
