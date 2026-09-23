import { describe, expect, it } from "vitest";
import { valueAtFloor } from "@/lib/portfolioValue";

const SOSO = 10n ** 18n;

describe("valueAtFloor", () => {
  const floors: Record<string, bigint | undefined> = { a: 5n * SOSO, b: 2n * SOSO, c: undefined };

  it("adds each piece's floor and counts the ones that have none", () => {
    const result = valueAtFloor(["a", "a", "b", "c"], (k) => floors[k]);
    expect(result).toEqual({ total: 12n * SOSO, priced: 3, unpriced: 1 });
  });

  /** A partial sum must be able to say it is partial. */
  it("reports a portfolio with no floors as unpriced, not as worth nothing", () => {
    expect(valueAtFloor(["c", "c"], (k) => floors[k])).toEqual({ total: 0n, priced: 0, unpriced: 2 });
  });

  it("is empty for an empty wallet", () => {
    expect(valueAtFloor([], () => 1n)).toEqual({ total: 0n, priced: 0, unpriced: 0 });
  });
});
