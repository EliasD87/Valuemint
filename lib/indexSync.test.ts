import { describe, expect, it } from "vitest";
import { floorSnapshotDue } from "@/lib/indexSync";

/**
 * The floor snapshot was three of every sync run's four database requests,
 * every thirty seconds. It now runs in the first minute of every ten.
 */
describe("floorSnapshotDue", () => {
  const at = (minute: number, second = 0) => new Date(Date.UTC(2026, 8, 30, 7, minute, second));

  it("is due in the first minute of every ten", () => {
    for (const minute of [0, 10, 20, 30, 40, 50]) {
      expect(floorSnapshotDue(at(minute))).toBe(true);
      expect(floorSnapshotDue(at(minute, 59))).toBe(true);
    }
  });

  it("is not due in any other minute", () => {
    const due = Array.from({ length: 60 }, (_, m) => m).filter((m) => floorSnapshotDue(at(m)));
    expect(due).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("still lands at least once in every hour, so no hourly bucket is skipped", () => {
    for (let hour = 0; hour < 24; hour++) {
      const minutes = Array.from({ length: 60 }, (_, m) => new Date(Date.UTC(2026, 8, 30, hour, m)));
      expect(minutes.some(floorSnapshotDue)).toBe(true);
    }
  });
});
