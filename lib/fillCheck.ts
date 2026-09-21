/**
 * Why a fill would fail, decided before anyone is asked to sign.
 *
 * Losing a race is the ordinary way a trade fails on a marketplace. The page
 * shows a listing, somebody else buys it, and the next person to click is
 * holding a card for a thing that is gone. That has always been true here and
 * the index widens the window: the book is read from a cached copy that can sit
 * up to a few minutes behind before the site gives up on it and scans instead.
 *
 * Until now the only way to find out was to send the transaction. Seaport
 * reverts, `explainTxError` says "somebody else bought this first" — correct,
 * clear, and delivered after the wallet prompt and the gas. This turns that into
 * an answer that costs nothing: `fulfillOrder` is simulated first, and a failure
 * that names the order as gone stops the wallet ever opening.
 *
 * ---
 *
 * **The rule about what to block on is deliberately narrow.** A simulation runs
 * against one node's view of state, which can lag, and refusing a buy that would
 * actually have worked is worse than the problem being solved — the person is
 * told "no" about something that was fine. So only failures that say *the order
 * itself is no longer fillable* stop the flow. Everything else, including
 * running out of SOSO, goes on to the wallet exactly as it did before, because
 * the wallet is better placed to judge it and it is the person's call.
 */

export type FillBlockKind =
  | "sold"
  | "withdrawn"
  | "part-taken"
  | "expired"
  | "gone"
  | "moved";

export interface FillBlock {
  kind: FillBlockKind;
  /** What to tell the person. Written to match `explainTxError`'s wording. */
  say: string;
  /**
   * Whether the book should be re-read straight away.
   *
   * True for every kind here, and carried explicitly rather than assumed: the
   * page that shows this message is still showing the dead listing beside it,
   * and a notice that contradicts the price above it is its own kind of
   * confusing.
   */
  refresh: true;
}

/**
 * Matched in order. Seaport's own errors first, because they are exact; the
 * token-level failures after, because they arrive as whatever the collection's
 * contract chose to revert with.
 */
const RULES: Array<{ test: RegExp; kind: FillBlockKind; say: string }> = [
  {
    test: /OrderAlreadyFilled/,
    kind: "sold",
    say: "Somebody bought this while you were looking. Nothing was sent, and you have not paid any gas.",
  },
  {
    test: /OrderIsCancelled/,
    kind: "withdrawn",
    say: "The seller withdrew this listing. Nothing was sent, and you have not paid any gas.",
  },
  {
    test: /OrderPartiallyFilled/,
    kind: "part-taken",
    say: "Someone took part of this lot while you were looking, so the amount you asked for is no longer there. Try again for what is left.",
  },
  {
    test: /InvalidTime/,
    kind: "expired",
    say: "This listing expired before you got to it. The seller would need to list it again.",
  },
  {
    /**
     * What a counter increment looks like from here.
     *
     * `incrementCounter` voids everything a maker has standing without touching
     * any order's status — it changes the hash future fulfilments compute, so
     * the order still reports itself validated and Seaport finds nothing
     * validated under the new hash. With an empty signature that surfaces as a
     * signer error, which is why this reads as "withdrawn" rather than as
     * anything about signatures.
     */
    test: /InvalidSigner|InvalidSignature|BadSignature|NoSpecifiedOrdersAvailable/,
    kind: "gone",
    say: "This listing is no longer live — the seller withdrew it, or cancelled everything they had for sale. Nothing was sent.",
  },
  {
    /**
     * The seller parted with the token, or revoked Seaport's permission to move
     * it. Seaport knows neither: it tracks cancellation and fills and nothing
     * else, so the order survives its own token leaving and would come back to
     * life at the old price if it ever returned.
     */
    test: /TokenTransferGenericFailure|NotTokenOwner|transfer from incorrect owner|caller is not token owner|insufficient allowance|not approved/i,
    kind: "moved",
    say: "The seller no longer holds this piece, or has withdrawn the marketplace's permission to move it. Nothing was sent.",
  },
];

/**
 * Read a simulation failure, or `undefined` when it is not about the order.
 *
 * `undefined` is the important return. It means "this is not a reason to stand
 * between someone and their wallet" — an unrecognised revert, a node having a
 * bad moment, not enough SOSO — and the caller goes on to sign exactly as
 * before. Only a recognised, order-is-gone failure stops anything.
 */
export function classifyFillFailure(message: string): FillBlock | undefined {
  for (const rule of RULES) {
    if (rule.test.test(message)) return { kind: rule.kind, say: rule.say, refresh: true };
  }
  return undefined;
}

/**
 * What changed about a listing while somebody was looking at it.
 *
 * "Sold" and "re-listed at a different price" are different news, and the
 * second is the one with something to do about it. Called after the book has
 * been re-read, with the price that was on screen and whatever is there now.
 */
export function priceMoved(
  triedWei: bigint,
  nowWei: bigint | undefined,
): { direction: "cheaper" | "dearer"; nowWei: bigint } | undefined {
  if (nowWei === undefined || nowWei === triedWei) return undefined;
  return { direction: nowWei < triedWei ? "cheaper" : "dearer", nowWei };
}
