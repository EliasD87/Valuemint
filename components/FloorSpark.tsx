"use client";

import { useMemo } from "react";
import { useFloorHistory } from "@/hooks/useFloorHistory";
import { changePercent, smoothPath, norm } from "@/lib/priceSeries";
import "./FloorSpark.css";

/**
 * A day of floor, as a shape and a number.
 *
 * ---
 *
 * **The number is the claim; the curve is only a shape.**
 *
 * The percentage compares two recorded hours — the newest, and the one nearest
 * twenty-four hours before it — and both are figures the sync actually wrote.
 * The curve between them is an interpolation: the floor did not slide smoothly
 * from one to the other, it held and jumped. So nothing may be read off the
 * line, and the whole cell is `aria-hidden` apart from the figure, which is
 * what a screen reader is given.
 *
 * ---
 *
 * **It is empty for the first day and that is not a bug.**
 *
 * A floor cannot be reconstructed backwards — it is the minimum over the orders
 * live at a moment, and fills, cancellations, expiries and counter increments
 * do not all leave a trace per order. An attempt would be wrong in a known
 * direction, because a stale cheap listing that nothing records as dead drags
 * it down, so every change measured against it would read more positive than
 * the truth. The series therefore starts when recording started, and until
 * there are two points a day apart this cell says nothing rather than
 * something false.
 */

/** The drawing's own space. Width is arbitrary; CSS stretches it. */
const W = 96;
const H = 26;
const PAD = 3;

/** How far from a true 24 hours a point may sit and still be the comparison. */
const TOLERANCE_MS = 6 * 3600_000;
const DAY_MS = 24 * 3600_000;

export function FloorSpark({ collection }: { collection: `0x${string}` | undefined }) {
  /**
   * Two days, not one. The comparison point is the reading nearest 24 hours
   * ago, and asking for exactly a day would leave nothing on the far side of
   * it to choose from when the hour is missing.
   */
  const { points, isLoading, unavailable } = useFloorHistory(collection, 2);

  const known = useMemo(
    () => points.filter((p): p is typeof p & { floorWei: bigint } => p.floorWei !== undefined),
    [points],
  );

  const change = useMemo(() => {
    const latest = known.at(-1);
    if (latest === undefined) return undefined;

    /**
     * The reading nearest a day before the latest, not simply the oldest one
     * held. With a series a few hours old the oldest point is a few hours old,
     * and labelling that difference "1d" would be a lie about the window.
     */
    const target = latest.at.getTime() - DAY_MS;
    let best: (typeof known)[number] | undefined;
    let bestGap = Number.POSITIVE_INFINITY;

    for (const p of known) {
      const gap = Math.abs(p.at.getTime() - target);
      if (gap < bestGap) {
        bestGap = gap;
        best = p;
      }
    }

    if (best === undefined || bestGap > TOLERANCE_MS || best === latest) return undefined;
    const percent = changePercent(best.floorWei, latest.floorWei);
    return percent === undefined ? undefined : { percent };
  }, [known]);

  const path = useMemo(() => {
    if (known.length < 2) return "";

    const ys = known.map((p) => Number(p.floorWei));
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const firstAt = known[0]!.at.getTime();
    const lastAt = known.at(-1)!.at.getTime();

    return smoothPath(
      known.map((p, i) => ({
        /**
         * Spaced by time, not by index. Evenly spacing the points would draw a
         * six-hour gap the same width as a one-hour one, which makes a flat
         * stretch look like activity.
         */
        x:
          PAD +
          (W - PAD * 2) *
            (lastAt === firstAt ? i / (known.length - 1) : norm(p.at.getTime(), firstAt, lastAt)),
        /** Inverted: SVG y grows downward and a rising floor must rise. */
        y: PAD + (H - PAD * 2) * (1 - norm(Number(p.floorWei), minY, maxY)),
      })),
    );
  }, [known]);

  /**
   * Nothing to say yet, and the cell steps aside rather than showing a dash.
   *
   * A dash in a stats bar reads as "this figure is broken". An absent cell
   * reads as "not shown", which is the truth while the series is younger than
   * the window it would describe.
   */
  if (isLoading || unavailable || change === undefined) return null;

  const tone = change.percent > 0 ? "up" : change.percent < 0 ? "down" : "flat";
  const sign = change.percent > 0 ? "+" : "";

  return (
    <div className="cs-cell">
      <dt className="cs-label">1d floor</dt>
      <dd className="cs-value fs-value">
        <span className={`fs-pct fs-${tone}`}>
          {sign}
          {change.percent.toFixed(1)}%
        </span>

        {/*
          Decoration, and marked as such. The figure beside it already carries
          the claim, and a screen reader being told about a curve it cannot read
          a value from is noise.
        */}
        {path === "" ? null : (
          <svg
            className={`fs-spark fs-${tone}`}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d={path} />
          </svg>
        )}
      </dd>
    </div>
  );
}
