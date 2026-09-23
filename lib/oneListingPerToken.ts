/**
 * One row per piece, from a feed that has one row per order.
 *
 * ---
 *
 * **A token can carry more than one live listing, and that is legal.** Seaport
 * orders are independent: a seller can list the same piece twice, at the same
 * price or different ones, and both stay valid until one fills or is cancelled.
 * Seen for real on 2026-09-23 — SoDEX Treasure Box #53201 and #53204 each held
 * two live 9 SOSO listings from the same seller, placed about twenty seconds
 * apart in separate transactions.
 *
 * The listing feed produced a row per ORDER, so each of those became two cards
 * keyed `collection-id`. Duplicate React keys make reconciliation undefined:
 * switching filters could not tell the two cards apart, left stale ones
 * mounted, and they accumulated. Measured on the live market — 77 cards for 73
 * distinct tokens after a few filter changes, and two Commons sitting in the
 * "Uncommon box" grid while the chip itself correctly counted 4. The predicate
 * was right; the page was showing cards that were no longer in its list.
 *
 * A market also has no use for the second card. A buyer can only buy the piece
 * once, and whoever fills pays the cheaper order, so the cheaper one is the
 * whole truth about what the piece costs.
 *
 * ---
 *
 * **Which one survives.** A listing that can be filled beats one that cannot,
 * whatever the price — an unfillable 1 SOSO row is not a 1 SOSO piece. Then
 * the cheaper. Then whichever came first, so the result is stable and a refetch
 * does not reshuffle a grid somebody is reading.
 */
export interface ListedRow {
  collection: string;
  id: bigint;
  /** Fillable right now. */
  active: boolean;
  listing?: { price: bigint };
}

const keyOf = (row: ListedRow) => `${row.collection.toLowerCase()}-${row.id.toString()}`;

/** Whether `a` should replace `b` as the row shown for their token. */
function beats(a: ListedRow, b: ListedRow): boolean {
  if (a.active !== b.active) return a.active;
  const pa = a.listing?.price;
  const pb = b.listing?.price;
  if (pa === undefined) return false;
  if (pb === undefined) return true;
  return pa < pb;
}

export function oneListingPerToken<T extends ListedRow>(rows: ReadonlyArray<T>): T[] {
  const chosen = new Map<string, { row: T; at: number }>();

  rows.forEach((row, at) => {
    const key = keyOf(row);
    const current = chosen.get(key);
    // Keep the FIRST position even when a later row wins, so the survivor sits
    // where its token first appeared and a refetch does not move it.
    if (current === undefined) chosen.set(key, { row, at });
    else if (beats(row, current.row)) chosen.set(key, { row, at: current.at });
  });

  return [...chosen.values()].sort((a, b) => a.at - b.at).map((c) => c.row);
}
