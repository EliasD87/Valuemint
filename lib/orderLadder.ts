import type { SeaportOrder } from "@/lib/seaport";

/**
 * Standing orders, gathered into price levels.
 *
 * ---
 *
 * **The two sides of an NFT book are not symmetric, and drawing them as if
 * they were is a lie about what you can do.**
 *
 * On an exchange, "12 at 9" means twelve interchangeable units and you may take
 * any number of them. Here an ask is a SPECIFIC TOKEN: three listings at 9 SOSO
 * are three named pieces, and buying one is choosing which. Stacking them into a
 * single rung labelled "3" implies a fungibility that does not exist — so every
 * ask level carries the ids it is made of, and the UI names them.
 *
 * Bids are the other way round. A collection-wide offer is genuinely fungible:
 * it fills against any piece its maker does not already own, which is exactly
 * what makes it worth something to every holder. A bid naming one token is not.
 * Those two cannot share a rung either, and `anyToken` is what tells them apart.
 *
 * So this returns levels that know what they are made of, and refuses to
 * flatten the distinction that matters.
 */

export interface Level {
  /** Exact, in wei. Never a float — this is the figure somebody acts on. */
  priceWei: bigint;
  /** Orders standing at this price. */
  count: number;
  /**
   * Orders at this price or better, counted from the best.
   *
   * "Better" means cheaper for asks and dearer for bids, so on both sides the
   * first level's cumulative equals its own count and the last level's equals
   * the whole side. That is what makes a depth bar mean the same thing on
   * either side of the book.
   */
  cumulative: number;
  /**
   * Which pieces stand at this price, ascending. Empty only where every order
   * on the rung names no token.
   */
  tokenIds: bigint[];
  /**
   * At least one order here fills against any piece in the collection.
   *
   * Only ever true on the bid side — a listing must name the token it is
   * selling. A level that is both (a token-specific bid and a collection-wide
   * one at the same price) reports true and lists the ids it does know, because
   * the fungible one is the stronger claim for a holder deciding whether they
   * can take it.
   */
  anyToken: boolean;
}

/**
 * Levels, best first.
 *
 * `side` is not inferred from the orders, deliberately. A caller that has
 * already filtered to listings and passes "bid" would otherwise get a book
 * sorted the wrong way with no complaint — and a book sorted the wrong way puts
 * the *worst* price where a reader looks for the best.
 */
export function ladder(orders: readonly SeaportOrder[], side: "ask" | "bid"): Level[] {
  const byPrice = new Map<string, Level>();

  for (const order of orders) {
    const key = order.priceWei.toString();
    const level = byPrice.get(key) ?? {
      priceWei: order.priceWei,
      count: 0,
      cumulative: 0,
      tokenIds: [],
      anyToken: false,
    };

    level.count += 1;
    if (order.tokenId === undefined) level.anyToken = true;
    else level.tokenIds.push(order.tokenId);

    byPrice.set(key, level);
  }

  const levels = [...byPrice.values()].sort((a, b) =>
    /**
     * Ascending for asks, descending for bids, so index 0 is the best price on
     * either side. Compared as bigints: a `Number()` here would collapse two
     * prices that differ past 2^53 into one, which for figures in wei is every
     * price over about 0.009 SOSO.
     */
    side === "ask"
      ? a.priceWei < b.priceWei
        ? -1
        : a.priceWei > b.priceWei
          ? 1
          : 0
      : b.priceWei < a.priceWei
        ? -1
        : b.priceWei > a.priceWei
          ? 1
          : 0,
  );

  let running = 0;
  for (const level of levels) {
    running += level.count;
    level.cumulative = running;
    level.tokenIds.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  }

  return levels;
}

/**
 * The gap between the best bid and the best ask.
 *
 * `undefined` when either side is empty, which is the normal state of most
 * collections here — a spread needs two sides and quoting one as though it were
 * a spread would invent a market that does not exist.
 *
 * **A negative spread is possible and is not a bug.** The best bid can exceed
 * the best ask: the two are in different currencies (bids are WSOSO, listings
 * native SOSO), nothing forces a holder to take a bid, and neither side is
 * matched automatically the way an exchange would. Callers must render it
 * rather than assume it away.
 */
export function spread(
  bestAskWei: bigint | undefined,
  bestBidWei: bigint | undefined,
): { absWei: bigint; negative: boolean; percent: number } | undefined {
  if (bestAskWei === undefined || bestBidWei === undefined) return undefined;

  const negative = bestBidWei > bestAskWei;
  const absWei = negative ? bestBidWei - bestAskWei : bestAskWei - bestBidWei;

  /**
   * As a share of the ask, which is the price somebody would actually pay.
   *
   * Float only here, and only for display: a percentage rendered to one decimal
   * cannot be harmed by the last digits of a uint256, and nothing acts on this
   * number. The exact figure stays in `absWei`.
   */
  const percent = bestAskWei === 0n ? 0 : Number((absWei * 10_000n) / bestAskWei) / 100;

  return { absWei, negative, percent };
}
