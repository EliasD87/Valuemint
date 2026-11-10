/**
 * Cybereator rarity, from its team's own catalog (published at the reveal,
 * 2026-11-10: `…/catalog/{rules_version}/catalog.json`).
 *
 * The metadata names a piece's parts but not how rare they are, and its price
 * follows exactly that. The catalog has the rest:
 *
 *   - each race's share of the collection (Male and Female 33.6% each, down to
 *     Cat at 1%), and the chance of each part within a race;
 *   - a tier for every part. A piece is **Gold** if any part is Gold, **Rare**
 *     if any part is Exclusive, Rare Hair or Rare Clothes, and **Common**
 *     otherwise. Those are the catalog's own classes (5% Gold in every race,
 *     Rare from 1% for Orcs and Cats to 29% for Robots); checked against the
 *     first 60 opened pieces, 3% Gold and 5% Rare.
 *
 * `enrichCybereatorDoc` adds a `Rarity` trait and an `odds` (0-1) to every
 * trait, so the token page, the cards and the filters can use them without
 * knowing anything about Cybereator.
 */

export type CybereatorClass = "Gold" | "Rare" | "Common";

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

const RARE_TIERS = new Set(["exclusive", "rareclothes", "rarehair"]);

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
  let klass: CybereatorClass = "Common";
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
    if (tier === "gold") klass = "Gold";
    else if (klass !== "Gold" && RARE_TIERS.has(tier)) klass = "Rare";
    const odds = part.byRace?.[race];
    out.push(typeof odds === "number" ? { ...a, odds } : a);
  }

  /* Rarity first, ahead of Race: it is the line a buyer reads first. */
  return { ...doc, attributes: [{ trait_type: "Rarity", value: klass }, ...out] };
}
