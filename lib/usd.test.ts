import { describe, expect, it } from "vitest";
import { formatUsd, parseSosoUsd, sosoToUsd } from "@/lib/usd";

const SOSO = 10n ** 18n;

describe("parseSosoUsd", () => {
  it("reads CoinGecko's answer", () => {
    expect(parseSosoUsd({ sosovalue: { usd: 0.305855 } })).toBe(0.305855);
  });

  /** "$0.00" beside a real balance says it is worthless, not that the price is unknown. */
  it("refuses anything that is not a positive price", () => {
    expect(parseSosoUsd({ sosovalue: { usd: 0 } })).toBeUndefined();
    expect(parseSosoUsd({ sosovalue: { usd: -1 } })).toBeUndefined();
    expect(parseSosoUsd({ sosovalue: { usd: "0.3" } })).toBeUndefined();
    expect(parseSosoUsd({ sosovalue: { usd: Number.NaN } })).toBeUndefined();
    expect(parseSosoUsd({ sosovalue: {} })).toBeUndefined();
    expect(parseSosoUsd({})).toBeUndefined();
    expect(parseSosoUsd({ status: { error_code: 429 } })).toBeUndefined();
    expect(parseSosoUsd(null)).toBeUndefined();
    expect(parseSosoUsd("rate limited")).toBeUndefined();
  });
});

describe("sosoToUsd", () => {
  it("prices a balance", () => {
    expect(sosoToUsd(100n * SOSO, 0.3)).toBeCloseTo(30, 10);
    expect(sosoToUsd(2998n * SOSO / 10_000n, 0.305855)).toBeCloseTo(0.0917, 4);
    expect(sosoToUsd(0n, 0.3)).toBe(0);
  });
});

describe("formatUsd", () => {
  it("writes dollars with separators and two places", () => {
    expect(formatUsd(4429.87)).toBe("$4,429.87");
    expect(formatUsd(30)).toBe("$30.00");
    expect(formatUsd(0.0917)).toBe("$0.09");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("never prints a real amount as nothing", () => {
    expect(formatUsd(0.004)).toBe("<$0.01");
    expect(formatUsd(0.005)).toBe("$0.01");
  });
});
