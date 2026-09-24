import { describe, expect, it } from "vitest";
import { needsSoso } from "@/lib/needsSoso";

const SOSO = 10n ** 18n;

describe("needsSoso", () => {
  it("offers help for an empty wallet", () => {
    expect(needsSoso(0n)).toBe(true);
  });

  /** It reads "0.00" and buys nothing; the question it raises is the same. */
  it("treats dust that shows as 0.00 as empty", () => {
    expect(needsSoso(1n)).toBe(true);
    expect(needsSoso((4n * SOSO) / 1000n)).toBe(true);
  });

  it("stays quiet once there is a spendable balance", () => {
    expect(needsSoso((5n * SOSO) / 1000n)).toBe(false);
    expect(needsSoso(1n * SOSO)).toBe(false);
  });

  /** An unread balance is not an empty one. */
  it("says nothing before the balance has loaded", () => {
    expect(needsSoso(undefined)).toBe(false);
  });
});
