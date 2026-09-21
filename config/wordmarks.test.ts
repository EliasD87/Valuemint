import { describe, expect, it } from "vitest";
import { wordmarkFor, wordmarkSaying } from "@/config/wordmarks";

/**
 * When a drawing may stand in for a name.
 *
 * `wordmarkFor` answers "does this collection have a mark", which is the right
 * question in the three places that replace the COLLECTION's name: the hero
 * card, the featured grid, the collection heading. A token card asks something
 * narrower. The text there is the piece's own name, taken from the design in
 * the manifest, and it only reads "Cybereator" on every card because that
 * collection ships a single design.
 *
 * Substituting on `wordmarkFor` alone would therefore be right today and
 * wrong the moment a collection with a mark has two designs — every piece
 * relabelled with the collection's name, and the one line on the card that
 * told them apart gone. It would not look broken, which is what makes it worth
 * a test rather than a comment.
 */

const CYBEREATOR = "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30";
const TEST_CYBEREATOR = "0x412D8af16B7fF3FE75e1CD380BD86Ef33dD8AD0f";
const GENESIS = "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B";

describe("wordmarkFor", () => {
  it("finds a mark whatever case the address arrives in", () => {
    expect(wordmarkFor(CYBEREATOR)).toBe("cybereator");
    expect(wordmarkFor(CYBEREATOR.toLowerCase())).toBe("cybereator");
  });

  it("covers the test deployment of the same collection", () => {
    expect(wordmarkFor(TEST_CYBEREATOR)).toBe("cybereator");
  });

  it("is undefined for a collection without one", () => {
    expect(wordmarkFor(GENESIS)).toBeUndefined();
    expect(wordmarkFor(undefined)).toBeUndefined();
  });
});

describe("wordmarkSaying", () => {
  it("substitutes when the drawing spells the text", () => {
    expect(wordmarkSaying(CYBEREATOR, "Cybereator")).toBe("cybereator");
  });

  it("ignores case and surrounding space, which a manifest may carry", () => {
    expect(wordmarkSaying(CYBEREATOR, "  CYBEREATOR ")).toBe("cybereator");
  });

  it("refuses a piece named something else", () => {
    /**
     * The case the whole function exists for. Genesis really does name its
     * designs — VELOCITY, ELEVATE — and a collection with a mark could too.
     */
    expect(wordmarkSaying(CYBEREATOR, "VELOCITY")).toBeUndefined();
    expect(wordmarkSaying(CYBEREATOR, "Cybereator Red")).toBeUndefined();
  });

  it("refuses a collection with no mark, whatever the text says", () => {
    expect(wordmarkSaying(GENESIS, "Cybereator")).toBeUndefined();
  });

  it("refuses a piece with no name at all", () => {
    /** Metadata still loading, or a collection that never published one. */
    expect(wordmarkSaying(CYBEREATOR, undefined)).toBeUndefined();
  });
});
