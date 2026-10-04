import { describe, expect, it } from "vitest";
import { floorChange, type FloorAt } from "./floorChange";

const ONE = 10n ** 18n;
const NOW = new Date("2026-10-04T12:20:00Z");
const hour = (iso: string, floorWei?: bigint): FloorAt => ({ at: new Date(iso), ...(floorWei === undefined ? {} : { floorWei }) });

describe("floorChange: one floor against one floor, a day apart", () => {
  const history = [
    hour("2026-10-03T10:00:00Z", 6n * ONE),
    hour("2026-10-03T11:00:00Z", 5n * ONE),
    // The hour holding 2026-10-03T12:20 — exactly 24 hours before NOW.
    hour("2026-10-03T12:00:00Z", 4n * ONE),
    hour("2026-10-03T13:00:00Z", 9n * ONE),
    hour("2026-10-04T12:00:00Z", 3n * ONE),
  ];

  it("compares today's floor with the floor in the hour 24 hours ago", () => {
    const c = floorChange(history, 5n * ONE, NOW);
    expect(c.kind).toBe("change");
    if (c.kind !== "change") return;
    expect(c.thenWei).toBe(4n * ONE);
    expect(c.percent).toBe(25);
  });

  it("reads a fall as negative, to a hundredth of a percent", () => {
    const c = floorChange(history, 3n * ONE, NOW);
    expect(c.kind === "change" && c.percent).toBe(-25);
    const third = floorChange([hour("2026-10-03T12:00:00Z", 3n * ONE)], 2n * ONE, NOW);
    expect(third.kind === "change" && third.percent).toBe(-33.3333);
  });

  it("never averages: other hours around it do not move the figure", () => {
    const only = floorChange([hour("2026-10-03T12:00:00Z", 4n * ONE)], 5n * ONE, NOW);
    expect(only.kind === "change" && only.percent).toBe(25);
  });

  it("says nothing is listed now rather than inventing a floor", () => {
    expect(floorChange(history, undefined, NOW).kind).toBe("no-floor-now");
  });

  it("says nothing was listed then, when the record shows an empty hour", () => {
    const c = floorChange([hour("2026-10-03T12:00:00Z")], 5n * ONE, NOW);
    expect(c.kind).toBe("no-floor-then");
  });

  it("refuses to reach back further than a few hours past the day", () => {
    const old = floorChange([hour("2026-10-03T06:00:00Z", 4n * ONE)], 5n * ONE, NOW);
    expect(old.kind).toBe("no-record");
    expect(floorChange([], 5n * ONE, NOW).kind).toBe("no-record");
  });

  it("uses an earlier hour within the slack when the exact one is missing", () => {
    const c = floorChange([hour("2026-10-03T10:00:00Z", 4n * ONE)], 4n * ONE, NOW);
    expect(c.kind === "change" && c.percent).toBe(0);
  });
});
