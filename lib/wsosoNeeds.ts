/**
 * What a bidder must hold and must have approved, given what they are about to
 * offer and what they already have standing.
 *
 * ---
 *
 * **Every standing offer needs its own money at the same time.**
 *
 * This used to hold that the balance only had to cover the bid being placed —
 * "you only have to hold the money for the bid you are placing now" — while the
 * allowance covered everything standing. That is true of an allowance and false
 * of a balance, and the difference is the whole bug.
 *
 * Seaport offers are independent orders. Three bids of 10 WSOSO are three
 * things any three holders can fill, in any order, at any moment — nobody takes
 * turns. Funding only the newest leaves a wallet holding 10 against 30 of live
 * bids: the first fill succeeds, and the other two revert at the moment someone
 * accepts them. Reported from the live site as "only one offer can be
 * accepted", which is exactly what it looks like from the outside.
 *
 * Worse, nothing showed it. `offerIsFillable` asks `balance >= this order's
 * price`, one order at a time, so all three answered yes on a balance that
 * could only ever settle one.
 *
 * So both figures rest on the same total. The bidder wraps enough to cover
 * every bid they have live, including the one they are placing.
 */
export interface WsosoNeeds {
  /** Everything this wallet must hold for all of its live bids to settle. */
  totalNeeded: bigint;
  /** Wrap this much more SOSO. Zero when the balance already covers it. */
  shortfall: bigint;
  needsWrap: boolean;
  needsAllowance: boolean;
}

export function wsosoNeeds({
  needed,
  alsoCover,
  held,
  approved,
}: {
  /** The bid being placed now. */
  needed: bigint;
  /** The total of this wallet's bids already on chain, in the same currency. */
  alsoCover: bigint;
  /** Current WSOSO balance. */
  held: bigint;
  /** Current WSOSO allowance for the spender. */
  approved: bigint;
}): WsosoNeeds {
  const totalNeeded = needed + alsoCover;

  return {
    totalNeeded,
    shortfall: totalNeeded > held ? totalNeeded - held : 0n,
    needsWrap: totalNeeded > 0n && held < totalNeeded,
    needsAllowance: totalNeeded > 0n && approved < totalNeeded,
  };
}
