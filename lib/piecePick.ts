/**
 * Choosing exactly which pieces, rather than "the first N" (2026-10-09).
 *
 * Bulk listing and selling into a batch offer both took the count and picked
 * the pieces themselves, lowest ids first. Pieces of one level are
 * interchangeable for pricing, but not always to their holder: a low number, a
 * favourite, one being kept for later. So the count still picks a starting
 * selection, and every piece can then be added or taken out by hand.
 *
 * Ids are kept as decimal strings: a `Set<bigint>` compares by value, but
 * strings survive `useState`, JSON and React keys without surprises.
 */

export const pieceKey = (id: bigint) => id.toString();

/** The first `n` of `ids`, in the order given. */
export function firstPieces(ids: readonly bigint[], n: number): Set<string> {
  return new Set(ids.slice(0, Math.max(0, n)).map(pieceKey));
}

/** `id` in or out. Never past `max`: adding beyond it does nothing. */
export function togglePiece(selected: ReadonlySet<string>, id: bigint, max: number): Set<string> {
  const next = new Set(selected);
  const key = pieceKey(id);
  if (next.has(key)) next.delete(key);
  else if (next.size < max) next.add(key);
  return next;
}

/**
 * The chosen pieces, in the order of `ids`, at most `max` of them.
 *
 * Read through `ids` rather than out of the set, so a piece that has since
 * been listed, sold or sent away, and has left `ids`, is never sent.
 */
export function chosenPieces(ids: readonly bigint[], selected: ReadonlySet<string>, max = Infinity): bigint[] {
  return ids.filter((id) => selected.has(pieceKey(id))).slice(0, max);
}
