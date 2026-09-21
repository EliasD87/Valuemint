import { describe, expect, it } from "vitest";
import { shortAddress, tinyAddress } from "@/lib/format";

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
