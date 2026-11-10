import { cybereatorLevel, CYBEREATOR_LEVELS, CYBEREATOR_RACES, type CybereatorLevel } from "@/lib/cybereatorRarity";

/**
 * The groups Cybereator trait offers are made over: which opened pieces have
 * each Rarity, Race and part. Kept free of I/O so it can be tested.
 *
 * Two sources, each trusted for one thing only:
 *
 *   - **The chain says what is opened**, and in what order: the opener's
 *     `Opened` logs (lib/cybereatorOpenings.ts). A sealed piece must never be
 *     in a set. It could be sold into an "Epic" offer and then open as a
 *     Common.
 *   - **cybereator.com's gallery says what each opened piece is**: race,
 *     class and parts, the same data its own site draws rarity from. Once a
 *     piece is revealed this never changes (the team's rule: no `Status`,
 *     final).
 *
 * The bound is a count of openings. A set at bound B holds only the pieces
 * opened B-th or earlier, so it can be rebuilt identically later, which is how
 * an offer made at B is still recognised and accepted after more openings.
 * The bound stops at the first opening the gallery does not yet show (still
 * rendering), or whose order disagrees with the chain's. Anything uncertain
 * stays out of every set.
 */

export interface GalleryPiece {
  id: bigint;
  openIndex: number;
  type: string;
  race: string;
  class: string;
  sub: string;
  traits: Record<string, string>;
}

/** The gallery's JSON, keeping only well-formed entries. */
export function parseGallery(json: unknown): GalleryPiece[] {
  if (!Array.isArray(json)) throw new Error("The Cybereator gallery is not a list.");
  const out: GalleryPiece[] = [];
  for (const raw of json as Array<Record<string, unknown>>) {
    const id = raw?.id;
    const openIndex = raw?.openIndex;
    if ((typeof id !== "number" && typeof id !== "string") || !/^[0-9]{1,78}$/.test(String(id))) continue;
    if (typeof openIndex !== "number" || !Number.isSafeInteger(openIndex) || openIndex < 0) continue;
    const traits: Record<string, string> = {};
    if (raw.traits !== null && typeof raw.traits === "object") {
      for (const [k, v] of Object.entries(raw.traits as Record<string, unknown>)) {
        if (typeof v === "string" && v !== "" && v !== "None") traits[k] = v;
      }
    }
    out.push({
      id: BigInt(String(id)),
      openIndex,
      type: typeof raw.type === "string" ? raw.type : "",
      race: typeof raw.race === "string" ? raw.race : "",
      class: typeof raw.class === "string" ? raw.class : "",
      sub: typeof raw.sub === "string" ? raw.sub : "",
      traits,
    });
  }
  return out;
}

/**
 * cybereator.com's own level for a gallery entry, as its gallery code
 * computes it. Undefined for one-of-ones and anything it would not class.
 */
export function galleryLevel(p: GalleryPiece): CybereatorLevel | undefined {
  if (p.type !== "standard" || !CYBEREATOR_RACES.includes(p.race)) return undefined;
  const gold = p.class === "Gold" ? Number(p.sub) || 1 : 0;
  const rare = p.class === "Rare" ? (p.sub === "Both" ? 2 : 1) : 0;
  if (!Number.isInteger(gold) || gold < 0 || gold > 3) return undefined;
  return cybereatorLevel(p.race, gold, rare, p.traits.Effect !== undefined);
}

/**
 * The pieces opened first, in order, as far as chain and gallery agree:
 * position i is the piece the chain says was opened i-th, and the gallery
 * has it at the same position. Its length is the current bound.
 */
export function agreedOpenings(
  openings: ReadonlyArray<{ id: bigint; index: number }>,
  gallery: readonly GalleryPiece[],
): GalleryPiece[] {
  const byIndex = new Map<number, bigint>();
  for (const o of openings) byIndex.set(o.index, o.id);
  const byId = new Map(gallery.map((p) => [p.id, p]));
  const out: GalleryPiece[] = [];
  for (let i = 0; ; i++) {
    const id = byIndex.get(i);
    if (id === undefined) break;
    const piece = byId.get(id);
    if (piece === undefined || piece.openIndex !== i) break;
    out.push(piece);
  }
  return out;
}

/** The metadata's trait order (cybereator.com/metadata), after Rarity. */
const ORDER = ["Rarity", "Race", "Background", "Backdrop", "Body", "Face", "Hair", "Clothes", "Accessory", "Drink", "Effect"];
const rank = (t: string) => {
  const i = ORDER.indexOf(t);
  return i === -1 ? ORDER.length : i;
};

const levelRank = (v: string) => (CYBEREATOR_LEVELS as readonly string[]).indexOf(v);

export interface SetGroup {
  traitType: string;
  value: string;
  ids: bigint[];
}

/** Every Rarity, Race and part group among the first `bound` agreed openings. */
export function cybereatorGroups(agreed: readonly GalleryPiece[], bound: number): SetGroup[] {
  const groups = new Map<string, SetGroup>();
  const add = (traitType: string, value: string, id: bigint) => {
    const k = `${traitType}\u0000${value}`;
    const g = groups.get(k) ?? { traitType, value, ids: [] };
    g.ids.push(id);
    groups.set(k, g);
  };
  for (const p of agreed.slice(0, bound)) {
    const level = galleryLevel(p);
    if (level !== undefined) add("Rarity", level, p.id);
    if (p.race !== "") add("Race", p.race, p.id);
    for (const [t, v] of Object.entries(p.traits)) if (t !== "Race" && t !== "Rarity") add(t, v, p.id);
  }
  return [...groups.values()].sort(
    (a, b) =>
      rank(a.traitType) - rank(b.traitType) ||
      a.traitType.localeCompare(b.traitType) ||
      /* Rarity lowest first, as cybereator.com lists it; the rest A to Z. */
      (a.traitType === "Rarity" ? levelRank(a.value) - levelRank(b.value) : a.value.localeCompare(b.value)),
  );
}
