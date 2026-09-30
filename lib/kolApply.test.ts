import { describe, expect, it } from "vitest";
import { applyMessage, normaliseHandle } from "@/lib/kolApply";

describe("normaliseHandle", () => {
  it.each([
    ["eliasing__", "eliasing__"],
    ["@eliasing__", "eliasing__"],
    ["  @BTCtensai  ", "BTCtensai"],
    ["https://x.com/iRalmix", "iRalmix"],
    ["x.com/iRalmix/status/123", "iRalmix"],
    ["https://twitter.com/Lutz_S120?s=21", "Lutz_S120"],
    ["https://mobile.x.com/taka_fit", "taka_fit"],
  ])("reads %j as %j", (raw, handle) => {
    expect(normaliseHandle(raw)).toBe(handle);
  });

  it.each(["", "@", "has space", "way_too_long_for_x_1", "name!", "https://example.com/name", "@@name"])(
    "refuses %j",
    (raw) => {
      expect(normaliseHandle(raw)).toBeUndefined();
    },
  );
});

describe("applyMessage", () => {
  it("names the wallet, the handle and the time, and says it sends nothing", () => {
    const m = applyMessage({ wallet: "0xAbC", handle: "someone", issuedAt: "2026-09-30T07:00:00.000Z" });
    expect(m).toContain("Wallet: 0xAbC");
    expect(m).toContain("X: @someone");
    expect(m).toContain("Issued: 2026-09-30T07:00:00.000Z");
    expect(m).toMatch(/sends nothing/);
  });
});
