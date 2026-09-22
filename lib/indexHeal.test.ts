import { describe, expect, it } from "vitest";
import { healDecision, type HealState } from "@/lib/indexHeal";

/**
 * The decision, not the sync.
 *
 * `healDecision` is split out of `healIfCold` precisely so this file can exist:
 * the question "is the index cold enough to act on" is pure, and its answer
 * decides whether a production request starts a chain scan. Testing it through
 * the sync would mean standing up an RPC in order to assert a boolean.
 */

const MINUTE = 60_000;
const NOW = new Date("2026-09-22T12:00:00.000Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

/** Idle: nothing in flight, nothing attempted. The common case. */
const idle = (): HealState => ({ inFlight: false, lastAttempt: 0 });

describe("healDecision", () => {
  it("leaves a fresh index alone", () => {
    expect(healDecision(ago(10_000), idle(), NOW)).toBe(false);
  });

  /**
   * The threshold sits deliberately above the client's own 180s tolerance.
   * Between the two the pages have stopped trusting the index, but the
   * scheduler has missed only a run or two and is probably still there —
   * firing here would race the thing that is doing its job.
   */
  it("holds off while the client has only just given up on the index", () => {
    expect(healDecision(ago(3 * MINUTE), idle(), NOW)).toBe(false);
  });

  it("acts once the scheduler has clearly stopped", () => {
    expect(healDecision(ago(5 * MINUTE), idle(), NOW)).toBe(true);
  });

  /** The outage this was written for. */
  it("acts on a four-and-three-quarter-hour stall", () => {
    expect(healDecision(ago(4.75 * 60 * MINUTE), idle(), NOW)).toBe(true);
  });

  /**
   * A cursor that has never been written is a brand new index. Returning false
   * here would mean a fresh deployment never advanced unless pg_cron had
   * already been configured by hand.
   */
  it("acts when the cursor has never been written", () => {
    expect(healDecision(null, idle(), NOW)).toBe(true);
  });

  /**
   * An unparseable timestamp says something is wrong with the ROW, not with
   * its age. Treating it as infinitely old would start a chain scan on every
   * request for as long as the bad value sat there.
   */
  it("does not act on a timestamp it cannot read", () => {
    expect(healDecision("not a date", idle(), NOW)).toBe(false);
  });

  /**
   * Clock skew putting the cursor in the future must not read as cold. `age`
   * goes negative, which is finite — so this asserts the comparison is `>`
   * against the threshold and not an absolute distance from it.
   */
  it("does not act on a cursor dated in the future", () => {
    expect(healDecision(new Date(NOW + 10 * MINUTE).toISOString(), idle(), NOW)).toBe(false);
  });

  it("does not start a second sync while one is running", () => {
    const busy: HealState = { inFlight: true, lastAttempt: 0 };
    expect(healDecision(ago(10 * MINUTE), busy, NOW)).toBe(false);
  });

  /**
   * The retry floor, which is what stops a FAILING sync being retried on every
   * request. `inFlight` has already cleared by then — it is `lastAttempt` that
   * has to hold the line.
   */
  it("refuses a fresh attempt inside the retry window", () => {
    const justTried: HealState = { inFlight: false, lastAttempt: NOW - MINUTE };
    expect(healDecision(ago(10 * MINUTE), justTried, NOW)).toBe(false);
  });

  it("allows another attempt once the retry window has passed", () => {
    const tried: HealState = { inFlight: false, lastAttempt: NOW - 3 * MINUTE };
    expect(healDecision(ago(10 * MINUTE), tried, NOW)).toBe(true);
  });

  /**
   * The retry floor outranks a never-written cursor too. A brand new index
   * whose first sync is failing must back off like any other.
   */
  it("applies the retry window even to a cursor that was never written", () => {
    const justTried: HealState = { inFlight: false, lastAttempt: NOW - MINUTE };
    expect(healDecision(null, justTried, NOW)).toBe(false);
  });
});
