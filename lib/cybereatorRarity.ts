/**
 * Cybereator rarity, from its team's own catalog (published at the reveal,
 * 2026-11-10: `…/catalog/{rules_version}/catalog.json`).
 *
 * The metadata names a piece's parts but not how rare they are, and its price
 * follows exactly that. The catalog has the rest:
 *
 *   - each race's share of the collection (Male and Female 33.6% each, down to
 *     Cat at 1%), and the chance of each part within a race;
 *   - a tier for every part (Common, Exclusive, Gold, RareHair, RareClothes).
 *
 * The `Rarity` label is cybereator.com's own: Common, Uncommon, Rare, Epic or
 * Legendary, by the formula in its gallery code (`cybereatorLevel`). Checked
 * against its /api/gallery for all 236 pieces opened by 12:40 UTC: 236 match.
 *
 * `enrichCybereatorDoc` adds a `Rarity` trait and an `odds` (0-1) to every
 * trait, so the token page, the cards and the filters can use them without
 * knowing anything about Cybereator.
 */

/** The levels cybereator.com shows, lowest first (read from its own code, 2026-11-10). */
export const CYBEREATOR_LEVELS = ["Common", "Uncommon", "Rare", "Epic", "Legendary"] as const;
export type CybereatorLevel = (typeof CYBEREATOR_LEVELS)[number];

/** Each race's starting level, as cybereator.com has it. */
const RACE_BASE: Record<string, number> = { Male: 0, Female: 0, Robot: 1, Orc: 1, Alien: 1, Demon: 2, Elemental: 2, Cat: 3 };

/** The races cybereator.com classes; a piece of any other race gets no level. */
export const CYBEREATOR_RACES: readonly string[] = Object.keys(RACE_BASE);

/**
 * cybereator.com's own formula. Gold parts (1-3) and rare parts (one, or two
 * for rare Hair and rare Clothes together) and an Effect each raise the race's
 * base level, by at most 2 (3 for a piece with three Gold parts).
 */
export function cybereatorLevel(race: string, gold: number, rare: number, effect: boolean): CybereatorLevel {
  const bonus = Math.min(gold + rare + (effect ? 1 : 0), gold === 3 ? 3 : 2);
  return CYBEREATOR_LEVELS[Math.min(CYBEREATOR_LEVELS.length - 1, (RACE_BASE[race] ?? 0) + bonus)]!;
}

interface CatalogComponent {
  name: string;
  trait: string;
  race: string;
  tier: string;
  byRace?: Record<string, number>;
}

interface CatalogRace {
  name: string;
  probability: number;
  traits?: Record<string, { none?: number; noneName?: string }>;
}

export interface CybereatorCatalog {
  races: CatalogRace[];
  components: Record<string, CatalogComponent> | CatalogComponent[];
}

interface Attribute {
  trait_type?: unknown;
  value?: unknown;
  [key: string]: unknown;
}

/** The catalog's parts, indexed by race, trait and name; "General" parts serve every race. */
function indexOf(catalog: CybereatorCatalog): Map<string, CatalogComponent> {
  const out = new Map<string, CatalogComponent>();
  const list = Array.isArray(catalog.components) ? catalog.components : Object.values(catalog.components);
  for (const c of list) out.set(`${c.race}|${c.trait}|${c.name}`, c);
  return out;
}

/**
 * A revealed document with `Rarity` and per-trait `odds` added, or `undefined`
 * when it cannot be classed (no Race, or a part the catalog does not know).
 * Never guesses: a piece the catalog cannot fully explain gets no label.
 */
export function enrichCybereatorDoc<T extends { attributes?: unknown }>(doc: T, catalog: CybereatorCatalog): T | undefined {
  if (!Array.isArray(doc.attributes)) return undefined;
  const attributes = doc.attributes as Attribute[];
  const race = attributes.find((a) => a.trait_type === "Race")?.value;
  if (typeof race !== "string") return undefined;
  const raceInfo = catalog.races.find((r) => r.name === race);
  if (raceInfo === undefined) return undefined;

  const parts = indexOf(catalog);
  let gold = 0;
  let rareHair = false;
  let rareClothes = false;
  let exclusive = false;
  let effect = false;
  const out: Attribute[] = [];

  for (const a of attributes) {
    if (typeof a.trait_type !== "string" || a.value === undefined) {
      out.push(a);
      continue;
    }
    if (a.trait_type === "Race") {
      out.push({ ...a, odds: raceInfo.probability });
      continue;
    }
    const value = String(a.value);
    const none = raceInfo.traits?.[a.trait_type];
    if (none !== undefined && value === (none.noneName ?? "None")) {
      out.push(typeof none.none === "number" ? { ...a, odds: none.none } : a);
      continue;
    }
    const part = parts.get(`${race}|${a.trait_type}|${value}`) ?? parts.get(`General|${a.trait_type}|${value}`);
    if (part === undefined) return undefined;
    const tier = part.tier.toLowerCase();
    if (tier === "gold") gold += 1;
    else if (tier === "rarehair") rareHair = true;
    else if (tier === "rareclothes") rareClothes = true;
    else if (tier === "exclusive") exclusive = true;
    if (a.trait_type === "Effect") effect = true;
    const odds = part.byRace?.[race];
    out.push(typeof odds === "number" ? { ...a, odds } : a);
  }

  /*
    Their classes: Gold (counting its Gold parts) wins over Rare, and Rare is
    worth two only for rare Hair and rare Clothes together ("Both").
  */
  const rare = gold > 0 ? 0 : rareHair && rareClothes ? 2 : rareHair || rareClothes || exclusive ? 1 : 0;
  const level = cybereatorLevel(race, Math.min(gold, 3), rare, effect);

  /* Rarity first, ahead of Race: it is the line a buyer reads first. */
  return { ...doc, attributes: [{ trait_type: "Rarity", value: level }, ...out] };
}
