/**
 * Which attributes are traits, which are bookkeeping, and which can be filtered on.
 *
 * ---
 *
 * **Three roles, not two.** `/api/metadata` composes a token document from its
 * collection's manifest and includes fields the rest of the app reads. Sorting
 * those into "show" and "hide" is not enough, because an attribute can be worth
 * reading on a piece and useless as a column to slice a collection by. So:
 *
 *   - **plumbing** — never shown to anybody. `Editions Minted` is the number the
 *     Rarity cell is computed from, and `Design Number` is the index into the
 *     manifest. Neither is something a collector reads about a piece.
 *   - **not filterable** — shown on the piece, absent from the filter row.
 *   - everything else — shown, and offered as a filter.
 *
 * The collection page used to have no notion of any of this: it built a
 * dropdown for every attribute carrying more than one distinct value, so a
 * manifest-backed collection got four — Design, Tier, Edition and Editions
 * Minted — where only two of them slice anything a person would ask for.
 *
 * ---
 *
 * **These are NAMED LISTS rather than a rule**, for the reason `TokenTraits`
 * has always given: a rule like "drop numeric attributes" looks right and is
 * wrong, because a numeric attribute can be perfectly real. A Trenches piece
 * has a tier and a serial, and a rule would empty the panel for a whole
 * collection.
 *
 * Compared lower-cased, because a manifest is written by hand and the casing of
 * a field name is not something to rely on.
 */

/** Carried for other parts of the app to read. Shown nowhere. */
const PLUMBING = new Set(["editions minted", "design number"]);

/**
 * Real on a piece, meaningless as an axis.
 *
 * **`Edition`** is a piece's own serial — "3 of 10" — and a collector wants to
 * see it. As a filter its values run across designs rather than within one, so
 * picking "1 of 15" on ValueChain Genesis selects ELEVATE #1 and STRIDE #1:
 * two tokens that share a number and nothing else. It also carries no rarity at
 * all, since every design has exactly one of each edition, while spending a
 * dropdown of fifteen entries to say so.
 *
 * **`Status`** exists only while a v3 collection is holding its tail back, and
 * it must not become a bucket. `lib/tokenDocument.ts` goes out of its way to
 * give an unrevealed token no Design and no Tier — not even "Unknown" — because
 * a browsable rarity bucket announces exactly how many are left. Offering
 * "Status: Unrevealed" as a filter would hand back the count that care was
 * taken to withhold. It stays visible ON the piece, where it is an honest
 * answer to "what is this", and the manifest's own design counts are public
 * regardless — what is withheld is which token gets what, not the odds.
 */
const NOT_FILTERABLE = new Set(["edition", "status"]);

const key = (traitType: unknown): string => String(traitType ?? "").toLowerCase();

/** Bookkeeping the app reads and nobody should be shown. */
export function isPlumbing(traitType: unknown): boolean {
  return PLUMBING.has(key(traitType));
}

/** Worth showing on a piece. Everything that is not plumbing. */
export function isDisplayable(traitType: unknown): boolean {
  return !isPlumbing(traitType);
}

/** Worth offering as a way to narrow a collection. */
export function isFilterable(traitType: unknown): boolean {
  const k = key(traitType);
  return k !== "" && !PLUMBING.has(k) && !NOT_FILTERABLE.has(k);
}
