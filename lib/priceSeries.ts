import { SECONDS_PER_BLOCK } from "@/config/chain";

/**
 * Sales, turned into something that can be drawn.
 *
 * ---
 *
 * **Everything here is display maths and none of it may be acted on.**
 *
 * A price becomes a float the moment it is plotted — an SVG coordinate cannot
 * be a bigint — and a float cannot hold a uint256. That is fine for a pixel and
 * catastrophic for a figure somebody buys at, so `priceWei` is carried
 * alongside every point and is what any label quotes. `y` is for the geometry
 * and nothing else.
 *
 * Time is an estimate too. Events carry a block number and no timestamp;
 * recording one would mean a `getBlock` per event at index time. The distance
 * from the chain head is converted at the measured block spacing instead, which
 * is accurate to well inside the hour a chart's axis implies and is exactly
 * what the activity panel already does to date a row.
 */

export interface Sale {
  priceWei: bigint;
  blockNumber: bigint;
  tokenId: bigint;
}

export interface Point {
  /** Seconds before now. 0 is the newest, larger is older. */
  ago: number;
  /** Exact. This is what a label quotes. */
  priceWei: bigint;
  /** Lossy past ~17 digits, for geometry only. Never shown. */
  y: number;
  tokenId: bigint;
}

/**
 * Sales as plottable points, oldest first.
 *
 * Oldest first because a line is drawn left to right and a chart reversed is
 * not obviously wrong to look at — it just tells the opposite story.
 */
export function salesToPoints(sales: readonly Sale[], head: bigint | undefined): Point[] {
  if (head === undefined) return [];

  return sales
    .filter((s) => s.priceWei > 0n)
    .map((s) => ({
      /**
       * Clamped at zero. A sale can sit a block or two AHEAD of the head we
       * happen to hold — the head is polled and the index is not — and a
       * negative age would plot off the right edge of the drawing.
       */
      ago: Math.max(0, Number(head - s.blockNumber) * SECONDS_PER_BLOCK),
      priceWei: s.priceWei,
      y: Number(s.priceWei),
      tokenId: s.tokenId,
    }))
    .sort((a, b) => b.ago - a.ago);
}

export interface Extent {
  /** Seconds. `oldest` is the largest `ago`. */
  oldest: number;
  newest: number;
  minWei: bigint;
  maxWei: bigint;
  /** For geometry. */
  minY: number;
  maxY: number;
}

/**
 * The box the points live in, padded so nothing sits on an edge.
 *
 * `undefined` for an empty series — a chart of nothing has no axes, and
 * inventing a 0-to-1 range would draw a confident grid over no data.
 */
export function extentOf(points: readonly Point[]): Extent | undefined {
  if (points.length === 0) return undefined;

  let minWei = points[0]!.priceWei;
  let maxWei = points[0]!.priceWei;
  let oldest = points[0]!.ago;
  let newest = points[0]!.ago;

  for (const p of points) {
    if (p.priceWei < minWei) minWei = p.priceWei;
    if (p.priceWei > maxWei) maxWei = p.priceWei;
    if (p.ago > oldest) oldest = p.ago;
    if (p.ago < newest) newest = p.ago;
  }

  /**
   * A single point, or several at one price, has no range at all — and every
   * scale built from it divides by zero. Widening to a band around the value
   * puts the point in the middle of a chart rather than at an undefined
   * coordinate.
   */
  let minY = Number(minWei);
  let maxY = Number(maxWei);
  if (minY === maxY) {
    const pad = minY === 0 ? 1 : Math.abs(minY) * 0.25;
    minY -= pad;
    maxY += pad;
  }
  if (oldest === newest) {
    oldest += 1;
  }

  return { oldest, newest, minWei, maxWei, minY, maxY };
}

/**
 * Round tick values covering a range.
 *
 * Plain 1/2/5 stepping. The alternative — dividing the range into N equal parts
 * — produces axes labelled 0.0347, 0.0694, 0.1041, which are numbers nobody can
 * hold in their head while reading a chart.
 *
 * Returns at most `count + 2` values, all inside or touching the range.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || count < 1) return [];

  const raw = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalised = raw / magnitude;

  /**
   * The thresholds are the midpoints between 1, 2, 5 and 10, not those values
   * themselves, and getting that wrong is silent.
   *
   * Shifted up a notch, a normalised 2.33 rounds to a step of 5 rather than 2 —
   * which over 0.002..0.009 lands the first tick at 0.005 and the second past
   * the end of the range, so the axis draws exactly ONE label and looks
   * deliberate while saying nothing.
   */
  const step =
    (normalised < 1.5 ? 1 : normalised < 3 ? 2 : normalised < 7 ? 5 : 10) * magnitude;
  if (!Number.isFinite(step) || step <= 0) return [];

  /**
   * Multiplied out from the start rather than accumulated with `v += step`.
   *
   * Repeated addition of a value like 0.002 drifts: by the fifth tick it is
   * 0.010000000000000002, which formats as an extra digit on an axis that is
   * supposed to read as round numbers.
   */
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let i = 0; i < 33; i++) {
    const v = start + i * step;
    if (v > max + step * 1e-9) break;
    out.push(v);
  }
  return out;
}

/**
 * Where a value sits across a span, as 0..1.
 *
 * Clamped, because a floor line drawn from a different source than the points
 * can legitimately fall outside their range — and an unclamped 1.4 puts it
 * outside the drawing where it silently disappears.
 */
export function norm(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const t = (value - min) / (max - min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Percentage change between two prices.
 *
 * `undefined` when the earlier price is zero, never `Infinity`. A collection
 * whose floor went from nothing to something has not risen by an infinite
 * percentage — the question simply does not have a number as its answer, and
 * rendering one would be a fabrication.
 *
 * Computed in basis points as bigints before touching a float, so a pair of
 * uint256 values cannot lose their difference to rounding on the way in.
 */
export function changePercent(fromWei: bigint, toWei: bigint): number | undefined {
  if (fromWei === 0n) return undefined;
  const bps = ((toWei - fromWei) * 10_000n) / fromWei;
  return Number(bps) / 100;
}

/**
 * A smooth path through a series, as SVG cubic beziers.
 *
 * Catmull-Rom control points converted to beziers, with the ends clamped to
 * themselves so the curve starts and finishes exactly on the data rather than
 * overshooting past it.
 *
 * **A curve is an interpolation and a sparkline is a shape, not a quote.** The
 * prices between two recorded points were never real, so nothing may read a
 * value off this path — it exists to show a direction at a glance, and the
 * figure beside it is what states the change.
 */
export function smoothPath(
  pts: ReadonlyArray<{ x: number; y: number }>,
  tension = 1,
): string {
  if (pts.length === 0) return "";
  const first = pts[0]!;
  if (pts.length === 1) return `M ${first.x} ${first.y}`;

  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let i = 0; i < pts.length - 1; i++) {
    /**
     * At the ends there is no neighbour to take a tangent from, so the point
     * stands in for its own. Without this the curve is computed from an
     * undefined slope and flies off the drawing at the first and last segment.
     */
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;

    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    d +=
      ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)},` +
      ` ${c2x.toFixed(2)} ${c2y.toFixed(2)},` +
      ` ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return d;
}
