import { describe, expect, it } from "vitest";
import { anchoredCollection, holdingsAnchor } from "@/lib/anchors";

describe("holdingsAnchor", () => {
  /**
   * The whole point of the helper: a link built from a checksummed address and
   * an id built from a lower-cased one have to meet. This is the assertion
   * that fails if either end starts spelling it differently.
   */
  it("is the same for a checksummed and a lower-cased address", () => {
    expect(holdingsAnchor("0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B")).toBe(
      holdingsAnchor("0x5fadc59297e86acea20bff519aea0f9651cdc90b"),
    );
  });

  it("is a valid html id — no leading digit, nothing needing escaping", () => {
    const id = holdingsAnchor("0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B");
    expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("distinguishes two collections", () => {
    expect(holdingsAnchor("0xaaa")).not.toBe(holdingsAnchor("0xbbb"));
  });
});

describe("anchoredCollection", () => {
  const genesis = "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B";

  it("reads back the collection a holdingsAnchor names, with or without the #", () => {
    expect(anchoredCollection(`#${holdingsAnchor(genesis)}`)).toBe(genesis.toLowerCase());
    expect(anchoredCollection(holdingsAnchor(genesis))).toBe(genesis.toLowerCase());
  });

  it("ignores any other hash", () => {
    expect(anchoredCollection("")).toBeUndefined();
    expect(anchoredCollection("#top")).toBeUndefined();
    expect(anchoredCollection("#holdings-0xabc")).toBeUndefined();
  });
});
