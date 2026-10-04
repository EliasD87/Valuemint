/**
 * The floor's change over a day: the cheapest listing now against the floor
 * the index recorded 24 hours ago. No averages anywhere — one floor against
 * one floor (the owner's call, 2026-10-04, replacing "floor vs the average
 * price sold in 24 hours").
 *
 * Yesterday's floor cannot be worked out from the chain — it was the minimum
 * over the orders live at that moment, and what retires an order does not
 * always leave a trace — so it comes from `floor_history`, which the index
 * sync records forward, bucketed by the hour (see `snapshotFloors`).
 */

export interface FloorAt {
  at: Date;
  /** Undefined: nothing was listed in that hour. */
  floorWei?: bigint;
}

export type FloorChange =
  | { kind: "change"; percent: number; nowWei: bigint; thenWei: bigint; then: Date }
  /** Nothing is listed now, so there is no floor to compare. */
  | { kind: "no-floor-now" }
  /** The record has no hour near 24 hours ago — the index was down, or is new. */
  | { kind: "no-record" }
  /** There is a record for then, and nothing was listed. */
  | { kind: "no-floor-then"; then: Date };

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * How far the recorded hour may sit from exactly 24 hours ago and still count
 * as "yesterday's floor". Snapshots land every ten minutes into hourly
 * buckets, so the right bucket is normally the one containing that moment; a
 * few hours' slack covers a sync that missed some runs without ever reaching
 * back far enough to be a different day.
 */
const SLACK_MS = 3 * HOUR_MS;

export function floorChange(points: readonly FloorAt[], nowWei: bigint | undefined, now: Date = new Date()): FloorChange {
  if (nowWei === undefined || nowWei <= 0n) return { kind: "no-floor-now" };

  const target = now.getTime() - DAY_MS;
  /** The hour holding the moment 24 hours ago: the latest bucket that starts at or before it. */
  let then: FloorAt | undefined;
  for (const p of points) {
    const t = p.at.getTime();
    if (t <= target && (then === undefined || t > then.at.getTime())) then = p;
  }
  if (then === undefined || target - then.at.getTime() > SLACK_MS) return { kind: "no-record" };
  if (then.floorWei === undefined || then.floorWei <= 0n) return { kind: "no-floor-then", then: then.at };

  /**
   * In basis points first, so the arithmetic stays in integers until the very
   * end — wei values do not fit a float, and the ratio is what matters.
   */
  const bps = ((nowWei - then.floorWei) * 1_000_000n) / then.floorWei;
  return { kind: "change", percent: Number(bps) / 10_000, nowWei, thenWei: then.floorWei, then: then.at };
}
