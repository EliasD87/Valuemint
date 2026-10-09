import { describe, expect, it } from "vitest";
import { indexLagMs } from "./indexLag";

const STALE_MS = 180_000;
const at = (iso: string) => new Date(iso).getTime();

describe("indexLagMs", () => {
  it("measures the index at the moment the server answered, not when the copy arrived", () => {
    // Built 40s after the last sync, then held at the edge for five minutes.
    const lag = indexLagMs(
      { indexedAt: "2026-10-09T08:00:00Z", servedAt: "2026-10-09T08:00:40Z" },
      at("2026-10-09T08:05:40Z"),
    );
    expect(lag).toBe(40_000);
    expect(lag <= STALE_MS).toBe(true);
  });

  it("does not care how wrong the visitor's clock is", () => {
    const payload = { indexedAt: "2026-10-09T08:00:00Z", servedAt: "2026-10-09T08:00:30Z" };
    expect(indexLagMs(payload, at("2026-10-09T08:30:00Z"))).toBe(30_000);
  });

  it("still catches a reader that has stopped", () => {
    const lag = indexLagMs({ indexedAt: "2026-10-09T08:00:00Z", servedAt: "2026-10-09T08:10:00Z" });
    expect(lag > STALE_MS).toBe(true);
  });

  it("falls back to the visitor's clock for a copy from before servedAt existed", () => {
    expect(indexLagMs({ indexedAt: "2026-10-09T08:00:00Z" }, at("2026-10-09T08:04:00Z"))).toBe(240_000);
  });

  it("treats an index that has never run as infinitely behind", () => {
    expect(indexLagMs({ indexedAt: null, servedAt: "2026-10-09T08:00:00Z" })).toBe(Number.POSITIVE_INFINITY);
  });

  it("gives NaN for a timestamp that will not parse, which the callers refuse", () => {
    expect(Number.isFinite(indexLagMs({ indexedAt: "nonsense", servedAt: "2026-10-09T08:00:00Z" }))).toBe(false);
  });
});
