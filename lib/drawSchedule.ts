/**
 * When SoDEX's Treasure Box snapshots happen (2026-10-28).
 *
 * Every Tuesday at 12:00 UTC SoDEX takes a snapshot, and the live draw that
 * follows on Wednesday counts the boxes minted in the week BEFORE it. So at
 * any moment, the boxes that count for the next draw are the ones minted
 * since the most recent Tuesday 12:00 UTC, and that window closes at the next
 * one. Owner's rule, stated 2026-10-28.
 *
 * Pure date arithmetic, no clock of its own: every function takes `now`, so
 * the tests can stand on any day of the week.
 */

const WEEK_MS = 7 * 86_400_000;
const TUESDAY = 2;
const SNAPSHOT_HOUR_UTC = 12;

/** The most recent Tuesday 12:00 UTC at or before `now`. */
export function lastSnapshotAt(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SNAPSHOT_HOUR_UTC));
  const back = (d.getUTCDay() - TUESDAY + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  /* Tuesday before noon: this week's snapshot has not happened yet. */
  if (d.getTime() > now.getTime()) d.setTime(d.getTime() - WEEK_MS);
  return d;
}

/** The snapshot that closes the current window: the one after `lastSnapshotAt`. */
export function nextSnapshotAt(now: Date): Date {
  return new Date(lastSnapshotAt(now).getTime() + WEEK_MS);
}

/** The Wednesday draw that the boxes minted in the current window enter. */
export function nextDrawDay(now: Date): Date {
  return new Date(nextSnapshotAt(now).getTime() + 86_400_000);
}
