"use client";

import { useMemo } from "react";
import { useFloorHistory } from "@/hooks/useFloorHistory";
import { changePercent, smoothPath, norm } from "@/lib/priceSeries";
import "./FloorSpark.css";

/**
 * How the floor has moved, as a shape and a number.
 *
 * ---
 *
 * **The number is the claim; the curve is only a shape.**
 *
 * The percentage compares two recorded hours — the newest, and the earliest
 * inside the last day — and both are figures the sync actually wrote.
 * The curve between them is an interpolation: the floor did not slide smoothly
 * from one to the other, it held and jumped. So nothing may be read off the
 * line, and the whole cell is `aria-hidden` apart from the figure, which is
 * what a screen reader is given.
 *
 * ---
 *
 * **The label is always 24h; the note says when the data is younger.**
 *
 * A floor cannot be reconstructed backwards — it is the minimum over the orders
 * live at a moment, and fills, cancellations, expiries and counter increments
 * do not all leave a trace per order. An attempt would be wrong in a known
 * direction, because a stale cheap listing that nothing records as dead drags
 * it down. So the series genuinely starts when recording started.
 *
 * The first version refused to draw anything until two points sat a day apart,
 * which left an empty slot in the stats bar for a whole day and read as broken.
 * 24 hours is the reference somebody opens a collection page for, so that is
 * what the cell says — and while the recorded series is shorter than that, the
 * cell carries a `title` stating exactly what it does cover. The headline is
 * the reference; the hover is the precision.
 */

/** The drawing's own space. Width is arbitrary; CSS stretches it. */
const W = 96;
const H = 26;
const PAD = 3;

const DAY_MS = 24 * 3600_000;

/**
 * How long the figure actually covers, in words.
 *
 * The cell is always labelled "24h" because that is the reference somebody
 * reads a collection page for. While the recorded series is younger than a
 * day the number necessarily covers less, and this is what says so — on the
 * cell's `title`, so the headline stays the reference and the precise truth is
 * one hover away rather than absent.
 *
 * Anything within an hour of 24 needs no note at all: the buckets are hourly,
 * so a series that has just crossed a day lands at 23-point-something.
 */
function spanNote(ms: number): string | undefined {
  const hours = ms / 3600_000;
  if (hours >= 23) return undefined;
  const span =
    hours >= 1
      ? `${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`
      : `${Math.max(1, Math.round(ms / 60_000))} minutes`;
  return (
    `Covers the ${span} recorded so far. The floor is written hourly and ` +
    `cannot be reconstructed from before recording started, so this reaches a ` +
    `full 24 hours once a day has been logged.`
  );
}

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
    if (latest === undefined || known.length < 2) return undefined;

    /**
     * The earliest reading inside the last day — so the window is a full day
     * once one exists, and everything recorded so far before that.
     *
     * This used to demand a point within six hours of exactly 24 ago and
     * render NOTHING otherwise, which meant a freshly created series showed an
     * empty slot in the stats bar for its first day and looked broken. The
     * window is now named by what it really is, which is both honest and
     * visible: two hours of history reads "2h floor", and the same cell becomes
     * "1d floor" the moment a day is behind it.
     */
    const cutoff = latest.at.getTime() - DAY_MS;
    const earliest = known.find((p) => p.at.getTime() >= cutoff) ?? known[0]!;
    if (earliest === latest) return undefined;

    const percent = changePercent(earliest.floorWei, latest.floorWei);
    if (percent === undefined) return undefined;

    return { percent, spanMs: latest.at.getTime() - earliest.at.getTime() };
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

  const note = spanNote(change.spanMs);

  return (
    /*
      `title` on the cell rather than the figure, so a hover anywhere over it
      explains the window. Only present while the series is short of a day —
      a permanent tooltip on a figure that is exactly what it says is noise.
    */
    <div className="cs-cell" {...(note === undefined ? {} : { title: note })}>
      <dt className="cs-label">24h floor</dt>
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
