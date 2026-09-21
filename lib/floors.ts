import type { TierFloor } from "@/hooks/useFloors";

/**
 * Which floor belongs against a piece somebody holds.
 *
 * A floor is the cheapest way to own a *particular thing*, so it only exists
 * once you have said which thing. Quoting the wrong one is not a rounding
 * error: it tells an owner their Super Rare is worth what a Common is going
 * for, which is the single most misleading number a portfolio page can print.
 *
 * ---
 *
 * **Why there is no fallback when a tier has nothing listed.**
 *
 * The previous rule fell through to the collection floor whenever the token's
 * own tier had no listing, on the reasoning that some number beats none. It
 * does not. The collection floor is the minimum across *every* tier, so the
 * fallback fires exactly when it is most wrong — a Super Rare with none for
 * sale is shown whatever the cheapest Common is asking, labelled as its floor.
 *
 * "No floor" is the true answer to "what is the cheapest comparable piece" when
 * there is no comparable piece, and the card already omits the plate rather
 * than printing a zero. Saying nothing is not a gap here; it is the fact.
 *
 * The one case that still falls through is a token with no tier at all, where
 * the collection floor *is* the comparable figure.
 */
export function floorForTier(
  tokenTier: string | undefined,
  /**
   * Every tier that has a listing, unfiltered.
   *
   * Unfiltered is load-bearing. `useFloors.tierFloorsFor` hides a breakdown of
   * fewer than two rows, because one row repeated under the collection floor is
   * noise on a display. Using that same list to answer *this* question meant a
   * collection with four tiers and one of them listed reported "no tiers at
   * all", and every piece in it fell through to that one tier's price.
   *
   * Treasure Box is exactly that shape: Common, Uncommon, Rare, Super Rare,
   * and frequently only one of them for sale.
   */
  tierRows: readonly TierFloor[],
  collectionFloor: bigint | undefined,
): bigint | undefined {
  if (tokenTier === undefined) return collectionFloor;

  const mine = tierRows.find((f) => f.tier === tokenTier);
  return mine?.price;
}
