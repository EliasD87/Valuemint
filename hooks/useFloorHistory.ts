"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * A collection's floor over time.
 *
 * The only series on this site with no chain behind it. Everything else falls
 * back to reading Seaport when the index is unavailable; this cannot, because a
 * past floor is not derivable from present logs — it is the minimum over the
 * orders that were live at a moment, and the things that retire an order do not
 * all leave a trace per order.
 *
 * So `unavailable` here means genuinely unknown, and callers must render that
 * rather than an empty chart. "This collection's floor has not moved" and "we
 * have no record of this collection's floor" are different claims.
 */

export interface FloorPoint {
  /** The hour this belongs to. */
  at: Date;
  /**
   * The floor in that hour, or `undefined` when nothing was listed.
   *
   * Not zero. A collection with no listings has NO floor, and a chart that
   * plots that as zero draws a cliff to the axis that never happened. A caller
   * must break the line across these, not interpolate through them.
   */
  floorWei?: bigint;
  listed: number;
}

interface Payload {
  points: Array<{ at: string; floorWei: string | null; listed: number }>;
}

export function useFloorHistory(collection: `0x${string}` | undefined, days = 30, enabled = true) {
  const query = useQuery({
    queryKey: ["floor-history", collection?.toLowerCase() ?? null, days],
    enabled: enabled && collection !== undefined,
    /** The series gains a point an hour; anything fresher is a wasted request. */
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<FloorPoint[]> => {
      const res = await fetch(
        `/api/index/floors?collection=${collection}&days=${days}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`Floor history returned ${res.status}`);

      const body = (await res.json()) as Payload;

      return body.points.flatMap((p): FloorPoint[] => {
        const at = new Date(p.at);
        if (Number.isNaN(at.getTime())) return [];

        /**
         * Parsed through BigInt, which throws on anything that is not an
         * integer string. A `Number()` here would silently round a uint256 and
         * a malformed row would become `NaN` and plot as a gap in the middle of
         * a line rather than being dropped.
         */
        let floorWei: bigint | undefined;
        if (p.floorWei !== null) {
          try {
            floorWei = BigInt(p.floorWei);
          } catch {
            return [];
          }
        }

        return [{ at, ...(floorWei === undefined ? {} : { floorWei }), listed: p.listed }];
      });
    },
  });

  return {
    points: query.data ?? [],
    isLoading: query.isLoading,
    /** True once we know the series could not be read. Never means "flat". */
    unavailable: query.isError,
  };
}
