import { describe, expect, it } from "vitest";
import { agreedOpenings, cybereatorGroups, galleryLevel, parseGallery } from "@/lib/cybereatorSets";

const piece = (id: number, openIndex: number, extra: Record<string, unknown> = {}) => ({
  id,
  openIndex,
  type: "standard",
  race: "Female",
  class: "Common",
  sub: "",
  traits: { Background: "Brick Red", Hair: "Orange Shag", Effect: "None" },
  ...extra,
});

describe("Cybereator trait sets", () => {
  it("parses the gallery and drops None parts", () => {
    const [p] = parseGallery([piece(2882, 0)]);
    expect(p!.id).toBe(2882n);
    expect(p!.traits).toEqual({ Background: "Brick Red", Hair: "Orange Shag" });
  });

  it("matches cybereator.com's levels", () => {
    const level = (extra: Record<string, unknown>) => galleryLevel(parseGallery([piece(1, 0, extra)])[0]!);
    expect(level({})).toBe("Common");
    expect(level({ race: "Robot" })).toBe("Uncommon");
    expect(level({ class: "Rare", sub: "Hair" })).toBe("Uncommon");
    expect(level({ class: "Rare", sub: "Both" })).toBe("Rare");
    expect(level({ class: "Gold", sub: "3" })).toBe("Epic");
    expect(level({ race: "Cat", class: "Gold", sub: "3" })).toBe("Legendary");
    expect(level({ race: "Demon", traits: { Effect: "Sparks" } })).toBe("Epic");
    expect(level({ type: "oneofone" })).toBeUndefined();
    expect(level({ race: "Dragon" })).toBeUndefined();
  });

  it("stops the bound at the first opening the gallery does not show or disagrees on", () => {
    const gallery = parseGallery([piece(10, 0), piece(11, 1), piece(13, 3)]);
    const chain = [
      { id: 10n, index: 0 },
      { id: 11n, index: 1 },
      { id: 12n, index: 2 }, // still rendering: not in the gallery yet
      { id: 13n, index: 3 },
    ];
    expect(agreedOpenings(chain, gallery).map((p) => p.id)).toEqual([10n, 11n]);
    // The gallery naming a different order than the chain is not trusted.
    expect(agreedOpenings([{ id: 11n, index: 0 }], gallery)).toEqual([]);
    // A piece the chain has not seen opened is never included, whatever the gallery says.
    expect(agreedOpenings([], gallery)).toEqual([]);
  });

  it("builds the same groups at an earlier bound after more openings", () => {
    const chain = [0, 1, 2].map((i) => ({ id: BigInt(100 + i), index: i }));
    const early = agreedOpenings(chain.slice(0, 2), parseGallery([piece(100, 0), piece(101, 1)]));
    const later = agreedOpenings(chain, parseGallery([piece(100, 0), piece(101, 1), piece(102, 2, { race: "Cat" })]));
    expect(cybereatorGroups(later, 2)).toEqual(cybereatorGroups(early, 2));
    const rarity = cybereatorGroups(later, 3).filter((g) => g.traitType === "Rarity");
    expect(rarity.map((g) => [g.value, g.ids])).toEqual([
      ["Any", [100n, 101n, 102n]],
      ["Common", [100n, 101n]],
      ["Epic", [102n]],
    ]);
    /* "Rarity: Any": every agreed opening up to the bound, and nothing else. */
    expect(cybereatorGroups(later, 2).find((g) => g.value === "Any")!.ids).toEqual([100n, 101n]);
  });
});
