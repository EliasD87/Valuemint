/**
 * Sales the owner has ruled out of price comparisons, one by one.
 *
 * ── TO LEAVE A SALE OUT, ADD AN ENTRY BELOW ────────────────────────────────
 *
 * A trade that happened is still history: it stays in activity, volume and
 * the piece's own record. What an entry here does is keep it out of the
 * "Floor vs 24h avg" figure, where one unrepresentative price can decide the
 * whole number — a collection whose day held one sale reads that sale as the
 * market.
 *
 * Matched on collection, token and block together, so an entry names exactly
 * one sale and can never catch a later trade of the same piece.
 */

export interface ExcludedSale {
  collection: `0x${string}`;
  tokenId: bigint;
  blockNumber: bigint;
  /** The transaction, for anyone checking the entry against the chain. */
  tx: `0x${string}`;
  why: string;
}

export const EXCLUDED_SALES: readonly ExcludedSale[] = [
  {
    collection: "0x5fadc59297e86acea20bff519aea0f9651cdc90b",
    tokenId: 69n,
    blockNumber: 14_751_038n,
    tx: "0x24b8bbcef716a2d7fec9da8c1bc8c224f4837feca466d97ce635db75d0736bd7",
    why:
      "ValueChain Genesis #69, a Common, sold for 860 SOSO while Commons were listed at 200. " +
      "A special case, per the owner, 2026-09-25 — as the day's only Common sale it read the " +
      "Common floor as 77% under the market.",
  },
];

/** Whether a sale is on the list above. */
export function isExcludedSale(
  collection: string,
  tokenId: bigint,
  blockNumber: bigint,
): boolean {
  const c = collection.toLowerCase();
  return EXCLUDED_SALES.some(
    (e) => e.collection === c && e.tokenId === tokenId && e.blockNumber === blockNumber,
  );
}
