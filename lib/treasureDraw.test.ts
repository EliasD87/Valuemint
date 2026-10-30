import { describe, expect, it } from "vitest";
import { countsForNextDraw } from "@/config/treasureDraw";
import { lastSnapshotAt, nextDrawDay, nextSnapshotAt } from "@/lib/drawSchedule";

const BOX = "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750";

describe("countsForNextDraw", () => {
  /* This week's cut-off as read off the chain on 2026-10-28: first box minted after Tue Oct 27 12:00 UTC. */
  const CUT = 116_157n;

  it("counts the first box minted after the snapshot, and everything after it", () => {
    expect(countsForNextDraw(BOX, CUT, CUT)).toBe(true);
    expect(countsForNextDraw(BOX, 117_000n, CUT)).toBe(true);
  });

  it("does not count boxes minted before it, including last week's", () => {
    expect(countsForNextDraw(BOX, CUT - 1n, CUT)).toBe(false);
    expect(countsForNextDraw(BOX, 102_862n, CUT)).toBe(false);
  });

  it("badges nothing while the cut-off is not known", () => {
    expect(countsForNextDraw(BOX, 999_999n, undefined)).toBe(false);
  });

  it("is about Treasure Boxes only, whatever the id", () => {
    expect(countsForNextDraw("0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30", 200_000n, CUT)).toBe(false);
    expect(countsForNextDraw(undefined, 200_000n, CUT)).toBe(false);
  });
});

describe("the weekly snapshot", () => {
  const at = (iso: string) => lastSnapshotAt(new Date(iso)).toISOString();

  it("is the most recent Tuesday 12:00 UTC", () => {
    expect(at("2026-10-28T09:00:00Z")).toBe("2026-10-27T12:00:00.000Z"); // Wednesday
    expect(at("2026-11-02T23:59:59Z")).toBe("2026-10-27T12:00:00.000Z"); // Monday night
  });

  it("moves at exactly 12:00 UTC on Tuesday, not before", () => {
    expect(at("2026-11-03T11:59:59Z")).toBe("2026-10-27T12:00:00.000Z");
    expect(at("2026-11-03T12:00:00Z")).toBe("2026-11-03T12:00:00.000Z");
  });

  it("names the window's close and the Wednesday draw it feeds", () => {
    const now = new Date("2026-10-28T09:00:00Z");
    expect(nextSnapshotAt(now).toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(nextDrawDay(now).toISOString().slice(0, 10)).toBe("2026-11-04");
  });

  it("crosses a month and a year end", () => {
    expect(at("2027-01-01T00:00:00Z")).toBe("2026-12-29T12:00:00.000Z");
  });
});
