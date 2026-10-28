"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { countsForNextDraw } from "@/config/treasureDraw";
import { lastSnapshotAt } from "@/lib/drawSchedule";
import type { DrawWindow } from "@/app/api/draw/route";

export interface NextDraw {
  /** The first box that counts, once known. */
  firstEligibleId?: bigint;
  /** The snapshot that opened this window. */
  snapshot?: Date;
  /** The Wednesday these boxes are drawn on. */
  drawDay?: Date;
  /** Whether a box counts for the next draw. False until the cut-off is known. */
  counts: (collection: string | undefined, tokenId: bigint | undefined) => boolean;
}

/**
 * This week's Treasure Box cut-off, from `/api/draw` (2026-10-28).
 *
 * One request per page, shared by every card through React Query. An answer
 * for a snapshot that has since passed is thrown away rather than shown: at
 * Tuesday 12:00 UTC every badge on the page goes, and comes back for the new
 * week's boxes on the next fetch. Until then nothing is badged, which is the
 * honest state when the cut-off is not known.
 */
export function useNextDraw(): NextDraw {
  const { data } = useQuery({
    queryKey: ["next-draw"],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<DrawWindow | null> => {
      const res = await fetch("/api/draw");
      if (!res.ok) return null;
      return (await res.json()) as DrawWindow;
    },
  });

  const current =
    data !== null && data !== undefined && Date.parse(data.snapshot) === lastSnapshotAt(new Date()).getTime()
      ? data
      : undefined;
  const firstEligibleId =
    current?.firstEligibleId !== null && current?.firstEligibleId !== undefined
      ? BigInt(current.firstEligibleId)
      : undefined;

  const counts = useCallback(
    (collection: string | undefined, tokenId: bigint | undefined) =>
      countsForNextDraw(collection, tokenId, firstEligibleId),
    [firstEligibleId],
  );

  return {
    firstEligibleId,
    snapshot: current === undefined ? undefined : new Date(current.snapshot),
    drawDay: current === undefined ? undefined : new Date(`${current.drawDay}T00:00:00Z`),
    counts,
  };
}
