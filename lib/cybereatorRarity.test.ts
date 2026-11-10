import { describe, expect, it } from "vitest";
import { cybereatorLevel, enrichCybereatorDoc, type CybereatorCatalog } from "./cybereatorRarity";

/** A slice of the real catalog (rules 5303b4402b65), enough to class these pieces. */
const catalog: CybereatorCatalog = {
  races: [
    { name: "Female", probability: 0.3355, traits: { Effect: { none: 0.95, noneName: "None" }, Hair: { none: 0.028, noneName: "Bald" } } },
    { name: "Robot", probability: 0.1006, traits: { Effect: { none: 0.95, noneName: "None" } } },
    { name: "Cat", probability: 0.01, traits: {} },
  ],
  components: {
    a: { name: "Brick Red", trait: "Background", race: "General", tier: "Common", byRace: { Female: 0.1111, Robot: 0.1111 } },
    b: { name: "Lavender Layered Bob", trait: "Hair", race: "Female", tier: "Common", byRace: { Female: 0.0282 } },
    c: { name: "Golden Swirl Goblet", trait: "Drink", race: "General", tier: "Gold", byRace: { Robot: 0.0092 } },
    d: { name: "Grin.exe", trait: "Body", race: "Robot", tier: "Exclusive", byRace: { Robot: 0.0558 } },
    e: { name: "Spark", trait: "Effect", race: "General", tier: "Common", byRace: { Robot: 0.05 } },
  },
};

const doc = (race: string, attrs: Array<[string, string]>) => ({
  name: "CybeReator #1",
  attributes: [{ trait_type: "Race", value: race }, ...attrs.map(([t, v]) => ({ trait_type: t, value: v }))],
});
const level = (d: ReturnType<typeof doc>) =>
  (enrichCybereatorDoc(d, catalog)!.attributes as Array<{ value: unknown }>)[0]!.value;

describe("cybereator.com's rarity formula", () => {
  it("starts from the race and adds Gold, rare parts and an Effect, capped", () => {
    expect(cybereatorLevel("Female", 0, 0, false)).toBe("Common");
    expect(cybereatorLevel("Robot", 0, 0, false)).toBe("Uncommon");
    expect(cybereatorLevel("Cat", 0, 0, false)).toBe("Epic");
    expect(cybereatorLevel("Female", 1, 0, true)).toBe("Rare");
    expect(cybereatorLevel("Female", 2, 0, true)).toBe("Rare"); // capped at +2
    expect(cybereatorLevel("Female", 3, 0, true)).toBe("Epic"); // three Gold allows +3
    expect(cybereatorLevel("Cat", 3, 0, true)).toBe("Legendary"); // never past the top
  });

  it("labels real-shaped pieces the way the gallery does", () => {
    expect(level(doc("Female", [["Background", "Brick Red"], ["Hair", "Lavender Layered Bob"]]))).toBe("Common");
    expect(level(doc("Robot", [["Body", "Grin.exe"]]))).toBe("Rare"); // base 1 + exclusive 1
    expect(level(doc("Robot", [["Drink", "Golden Swirl Goblet"], ["Effect", "Spark"]]))).toBe("Epic"); // 1 + gold 1 + effect 1
    expect(level(doc("Robot", [["Effect", "None"]]))).toBe("Uncommon"); // "None" is no Effect
  });
});

describe("Cybereator trait odds", () => {
  it("puts the race's and each part's odds on its trait, empties included", () => {
    const out = enrichCybereatorDoc(doc("Female", [["Hair", "Lavender Layered Bob"], ["Effect", "None"]]), catalog)!;
    const odds = Object.fromEntries((out.attributes as Array<{ trait_type: string; odds?: number }>).map((a) => [a.trait_type, a.odds]));
    expect(odds).toEqual({ Rarity: undefined, Race: 0.3355, Hair: 0.0282, Effect: 0.95 });
  });

  it("labels nothing it cannot fully explain", () => {
    expect(enrichCybereatorDoc(doc("Female", [["Hair", "A Hair Nobody Listed"]]), catalog)).toBeUndefined();
    expect(enrichCybereatorDoc(doc("Unicorn", []), catalog)).toBeUndefined();
    expect(enrichCybereatorDoc({ attributes: [{ trait_type: "Status", value: "Unopened" }] }, catalog)).toBeUndefined();
  });
});
