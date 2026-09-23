import { describe, expect, it } from "vitest";
import { formatSoso, shortAddress, tinyAddress } from "@/lib/format";

/**
 * Two abbreviations, and the difference between them is two characters that
 * are easy to miscount.
 *
 * `shortAddress` keeps the `0x` AND `size` hex digits, so its head is SIX
 * characters wide at the default — which reads as "first six" to anyone
 * counting the string rather than the hex body. `tinyAddress` keeps four from
 * each end, counting the prefix.
 *
 * Worth pinning because both are off-by-two away from each other and neither
 * has a type that would notice.
 */

const ADDRESS = "0x36806932bc43047d0ce6363b8dec79c5d5a73136";

describe("shortAddress", () => {
  it("keeps the prefix and four hex digits — six characters of head", () => {
    expect(shortAddress(ADDRESS)).toBe("0x3680…3136");
  });

  it("takes both ends from one size", () => {
    expect(shortAddress(ADDRESS, 6)).toBe("0x368069…a73136");
  });

  it("returns a too-short string untouched rather than mangling it", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
    expect(shortAddress(undefined)).toBe("");
  });
});

describe("tinyAddress", () => {
  it("keeps four from each end, counting the 0x", () => {
    expect(tinyAddress(ADDRESS)).toBe("0x36…3136");
  });

  it("is exactly two characters shorter in the head than shortAddress", () => {
    const [tinyHead] = tinyAddress(ADDRESS).split("…");
    const [shortHead] = shortAddress(ADDRESS).split("…");
    expect(tinyHead).toHaveLength(4);
    expect(shortHead).toHaveLength(6);
  });

  it("keeps a tail long enough to tell two addresses apart", () => {
    /** The reason this is not `shortAddress(a, 2)`, which would give two. */
    const [, tail] = tinyAddress(ADDRESS).split("…");
    expect(tail).toHaveLength(4);
  });

  it("returns a too-short string untouched rather than mangling it", () => {
    expect(tinyAddress("0x1234")).toBe("0x1234");
    expect(tinyAddress(undefined)).toBe("");
  });
});

describe("formatSoso", () => {
  const SOSO = 10n ** 18n;

  /** The /stats chart's peak label read "25" for a 2,500 SOSO column. */
  it("never trims a whole number's own zeros", () => {
    expect(formatSoso(2500n * SOSO, 0)).toBe("2500");
    expect(formatSoso(10n * SOSO, 0)).toBe("10");
    expect(formatSoso(100n * SOSO)).toBe("100");
    expect(formatSoso(100n * SOSO, 2)).toBe("100");
  });

  it("trims trailing zeros from the fraction, and a bare point with them", () => {
    expect(formatSoso(15n * SOSO / 10n)).toBe("1.5");
    expect(formatSoso(1050n * SOSO / 1000n, 2)).toBe("1.05");
    expect(formatSoso(2n * SOSO, 4)).toBe("2");
  });

  it("rounds to the precision asked for", () => {
    expect(formatSoso(783_987n * SOSO / 1000n, 2)).toBe("783.99");
    expect(formatSoso(2_505_4n * SOSO / 10n, 0)).toBe("2505");
  });

  it("says a dust amount is non-zero rather than rounding it away", () => {
    expect(formatSoso(1n)).toBe("<0.0001");
    expect(formatSoso(0n)).toBe("0");
    expect(formatSoso(undefined)).toBe("—");
  });
});
