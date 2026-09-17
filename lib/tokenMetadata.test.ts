import { describe, expect, it } from "vitest";
import { readTokenMetadata, traitOf } from "./tokenMetadata";

/**
 * These are not shape-checking exercises. Every case below is a document a
 * contract we do not control could return today, and before this validator
 * existed several of them took a page down with a TypeError during render.
 *
 * The marketplace lists any ERC-721 the explorer has indexed, so the metadata
 * URL is chosen by a stranger and fetched by every visitor's browser. That
 * makes this hostile input, and the point of the whole file is that nothing in
 * it throws.
 */

const GOOD = {
  name: "ValueChain Genesis #67 — LUMINATE",
  description: "The first NFT collection on ValueChain.",
  image: "ipfs://QmZUQTa5waSZCEqGiynkiTFyE9v9cgHEynP3BwwzuL4P4L",
  attributes: [
    { trait_type: "Design", value: "LUMINATE" },
    { trait_type: "Tier", value: "Epic" },
    { trait_type: "Edition", value: "6 of 8" },
    { trait_type: "Editions Minted", value: 8 },
  ],
};

describe("readTokenMetadata — a well-formed document", () => {
  it("passes a real first-party document through intact", () => {
    const doc = readTokenMetadata(GOOD);
    expect(doc).toBeDefined();
    expect(doc?.name).toBe("ValueChain Genesis #67 — LUMINATE");
    expect(doc?.image).toBe("ipfs://QmZUQTa5waSZCEqGiynkiTFyE9v9cgHEynP3BwwzuL4P4L");
    expect(doc?.attributes).toHaveLength(4);
  });

  it("keeps numeric trait values as numbers", () => {
    const doc = readTokenMetadata(GOOD);
    expect(doc?.attributes.find((a) => a.trait_type === "Editions Minted")?.value).toBe(8);
  });
});

describe("readTokenMetadata — what used to crash the page", () => {
  /**
   * The one that matters most. `"none".find` is not a function, and six hooks
   * called `.find` on this value during render.
   */
  it("survives attributes being a string", () => {
    const doc = readTokenMetadata({ name: "X", image: "ipfs://cid", attributes: "none" });
    expect(doc?.attributes).toEqual([]);
    expect(() => traitOf(doc, "Tier")).not.toThrow();
    expect(traitOf(doc, "Tier")).toBeUndefined();
  });

  /** `.map` on an object is the token page's version of the same fault. */
  it("survives attributes being an object", () => {
    const doc = readTokenMetadata({ name: "X", image: "ipfs://cid", attributes: { Tier: "Rare" } });
    expect(doc?.attributes).toEqual([]);
  });

  it("survives attributes being null", () => {
    const doc = readTokenMetadata({ name: "X", image: "ipfs://cid", attributes: null });
    expect(doc?.attributes).toEqual([]);
  });

  it("survives a number where a name should be", () => {
    const doc = readTokenMetadata({ name: 42, image: "ipfs://cid", attributes: [] });
    expect(doc?.name).toBe("");
    expect(doc?.image).toBe("ipfs://cid");
  });
});

describe("readTokenMetadata — things that are valid JSON but not documents", () => {
  it.each([
    ["a bare string", '"hello"'],
    ["a number", "7"],
    ["null", "null"],
    ["a top-level array", "[1,2,3]"],
    ["an empty object", "{}"],
  ])("returns undefined for %s", (_label, json) => {
    expect(readTokenMetadata(JSON.parse(json))).toBeUndefined();
  });

  it("returns undefined when every displayable field is missing", () => {
    // Describes nothing, so callers show "nothing was published" rather than a
    // shell with every field blank.
    expect(readTokenMetadata({ description: "just a description" })).toBeUndefined();
  });
});

describe("readTokenMetadata — partial documents keep what is good", () => {
  it("keeps a valid image when the traits array is rubbish", () => {
    const doc = readTokenMetadata({ image: "ipfs://cid", attributes: "broken" });
    expect(doc?.image).toBe("ipfs://cid");
  });

  it("drops only the bad entries out of a mixed attributes array", () => {
    const doc = readTokenMetadata({
      name: "X",
      attributes: [
        { trait_type: "Tier", value: "Rare" },
        "not an entry",
        null,
        { value: "no trait_type" },
        { trait_type: "Nested", value: { a: 1 } },
        { trait_type: "Design", value: "GOOD" },
      ],
    });
    expect(doc?.attributes).toHaveLength(2);
    expect(traitOf(doc, "Tier")).toBe("Rare");
    expect(traitOf(doc, "Design")).toBe("GOOD");
  });

  it("renders a boolean trait as a word rather than 'true'", () => {
    const doc = readTokenMetadata({ name: "X", attributes: [{ trait_type: "Burned", value: true }] });
    expect(traitOf(doc, "Burned")).toBe("Yes");
  });

  it("treats an empty image string as no image", () => {
    const doc = readTokenMetadata({ name: "X", image: "   " });
    expect(doc?.image).toBeUndefined();
  });
});

describe("traitOf", () => {
  it("matches exactly and case-sensitively, which is the documented behaviour", () => {
    const doc = readTokenMetadata(GOOD);
    expect(traitOf(doc, "Tier")).toBe("Epic");
    // Not a bug to fix by lowercasing: "Tier" and "tier" are different traits,
    // and guessing would let a collection shadow a real one.
    expect(traitOf(doc, "tier")).toBeUndefined();
  });

  it("is undefined-safe", () => {
    expect(traitOf(undefined, "Tier")).toBeUndefined();
  });

  it("stringifies numeric values so callers can render them", () => {
    const doc = readTokenMetadata(GOOD);
    expect(traitOf(doc, "Editions Minted")).toBe("8");
  });
});
