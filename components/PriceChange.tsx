"use client";

import { useMemo } from "react";
import { useBlockNumber } from "wagmi";
import { useActivity } from "@/hooks/useActivity";
import { tradedChange, rollingMeans } from "@/lib/salesWindow";
import { smoothPath, norm } from "@/lib/priceSeries";
import { formatSoso } from "@/lib/format";
import "./PriceChange.css";

/**
 * What pieces actually sold for over a day, against the day before.
 *
 * ---
 *
 * **This is a traded price, not a listing floor, and it used to be the latter.**
 *
 * A floor is the cheapest price somebody is ASKING. Nobody has to accept it, it
 * can sit unsold for a week, and one optimistic seller moves it without a
 * single piece changing hands. This is the mean of sales that COMPLETED — what
 * buyers and sellers actually agreed on — over the last 24 hours, against the
 * same mean for the 24 before that.
 *
 * Two consequences, both good. It needs no recording set up first, because
 * sales have always been in the event log: the figure covers the whole history
 * the index holds rather than starting the hour somebody created a table. And
 * it cannot be moved by a listing nobody paid.
 *
 * ---
 *
 * **The mean is fragile on thin volume, and the cell says so.**
 *
 * Two sales in a window, one of them unusual, and the average moves a long way
 * on no real information. That is a property of averaging small samples rather
 * than something the arithmetic can fix, so the counts and both figures ride on
 * the cell's `title` — and a window with nothing in it yields no percentage at
 * all rather than a comparison against a zero.
 *
 * ---
 *
 * **The curve is a ROLLING 24-hour mean, and that is not a detail.**
 *
 * It was an hourly mean over the last day, drawn beside a figure comparing
 * that day against the one before. Both were correct and together they looked
 * like a contradiction: prices climbed through the day so the line rose, while
 * the day still averaged below the previous one so the number was red. A
 * rising curve next to a red figure is indefensible whatever the arithmetic
 * says.
 *
 * Rolling fixes it by construction. The window ending now is exactly the
 * percentage's recent window and the window ending 24 hours ago is exactly its
 * previous one, so the line BEGINS at the figure being compared from and ENDS
 * at the one being compared to. A negative change cannot render as a rising
 * line. There is a test asserting precisely that.
 *
 * The number is still the claim and the curve still only a shape: the points
 * are real means but no price existed along the line between two of them, so
 * the svg is `aria-hidden` and the figure carries the accessible claim.
 */

/** The drawing's own space. Width is arbitrary; CSS stretches it. */
const W = 96;
const H = 26;
const PAD = 3;

export function PriceChange({ collection }: { collection: `0x${string}` | undefined }) {
  const { sales, isLoading, logsUnavailable } = useActivity(collection);
  const { data: head } = useBlockNumber({ watch: false });

  const windowSales = useMemo(
    () =>
      sales.flatMap((s) =>
        s.price === undefined ? [] : [{ priceWei: s.price, blockNumber: s.blockNumber }],
      ),
    [sales],
  );

  const change = useMemo(() => tradedChange(windowSales, head), [windowSales, head]);
  const buckets = useMemo(() => rollingMeans(windowSales, head, 24), [windowSales, head]);

  const path = useMemo(() => {
    if (buckets.length < 2) return "";

    const ys = buckets.map((b) => Number(b.meanWei));
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const oldest = buckets[0]!.hoursAgo;
    const newest = buckets.at(-1)!.hoursAgo;

    return smoothPath(
      buckets.map((b, i) => ({
        /**
         * Spaced by time, not by index. A window with no sales gets no point at
         * all, so evenly spacing what remains would draw a six-hour gap the
         * same width as a one-hour one — and a quiet stretch would read as
         * activity.
         */
        x:
          PAD +
          (W - PAD * 2) *
            (oldest === newest
              ? i / (buckets.length - 1)
              : 1 - norm(b.hoursAgo, newest, oldest)),
        /** Inverted: SVG y grows downward and a rising price must rise. */
        y: PAD + (H - PAD * 2) * (1 - norm(Number(b.meanWei), minY, maxY)),
      })),
    );
  }, [buckets]);

  /**
   * Nothing to compare, so the cell steps aside rather than showing a dash.
   *
   * A dash in a stats bar reads as "this figure is broken". An absent cell
   * reads as "not shown", which is the truth for a collection that has not
   * traded on both of the last two days.
   */
  if (isLoading || logsUnavailable || change === undefined) return null;

  const tone = change.percent > 0 ? "up" : change.percent < 0 ? "down" : "flat";
  const sign = change.percent > 0 ? "+" : "";

  const note =
    `Mean of ${change.countNow} ${change.countNow === 1 ? "sale" : "sales"} in the last 24h ` +
    `(${formatSoso(change.nowWei)} SOSO) against ${change.countPrev} ` +
    `${change.countPrev === 1 ? "sale" : "sales"} the day before ` +
    `(${formatSoso(change.prevWei)} SOSO). Completed sales only — a listing nobody bought does ` +
    `not move this.`;

  return (
    <div className="cs-cell" title={note}>
      <dt className="cs-label">24h price</dt>
      <dd className="cs-value chg-value">
        <span className={`chg-pct chg-${tone}`}>
          {sign}
          {change.percent.toFixed(1)}%
        </span>

        {/*
          Decoration, and marked as such. The figure beside it carries the
          claim, and a screen reader told about a curve it cannot read a value
          from is noise.
        */}
        {path === "" ? null : (
          <svg
            className={`chg-spark chg-${tone}`}
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
