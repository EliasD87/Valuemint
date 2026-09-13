/**
 * Turning raw offer reads into "the best live offer on each token".
 *
 * Pure and separate from the hook that feeds it because the pairing it does is
 * the kind of mistake nothing catches at runtime. `acceptOffer` is keyed by
 * bidder *and* guarded by a minimum price, so a summary that reports one
 * bidder's price next to another bidder's address does not look wrong anywhere
 * on screen — it produces a transaction that reverts in the wallet, and the
 * owner has no way to tell why.
 */

export interface OfferBid {
  collection: `0x${string}`;
  id: bigint;
  bidder: `0x${string}`;
}

/** What `getOffer` returns; a withdrawn or accepted offer reads back zeroed. */
export interface OfferState {
  paymentToken: `0x${string}`;
  price: bigint;
  expiry: bigint;
}

export interface OfferSummary {
  /** Highest live offer on the token, in wei. */
  best: bigint;
  count: number;
  /** Who made `best` — the bidder an owner would accept from. */
  bidder: `0x${string}`;
  paymentToken: `0x${string}`;
  /** Unix seconds, or 0 for no expiry. */
  expiry: bigint;
}

export const offerKey = (collection: string, id: bigint | string): string =>
  `${collection.toLowerCase()}-${id.toString()}`;

/**
 * @param bids   one entry per (token, bidder) seen in the logs
 * @param states the contract's answer for each, positionally aligned with `bids`
 * @param now    unix seconds, passed in so expiry is testable
 */
export function summariseOffers(
  bids: readonly OfferBid[],
  states: readonly (OfferState | undefined)[],
  now: bigint,
): Map<string, OfferSummary> {
  const byToken = new Map<string, OfferSummary>();

  bids.forEach((b, i) => {
    const o = states[i];
    if (o === undefined) return;
    // Logs only say an offer was once made. Withdrawn, accepted and overwritten
    // offers all read back as a zero price.
    if (o.price === 0n) return;
    if (o.expiry !== 0n && o.expiry <= now) return;

    const k = offerKey(b.collection, b.id);
    const prev = byToken.get(k);
    const here: Omit<OfferSummary, "count"> = {
      best: o.price,
      bidder: b.bidder,
      paymentToken: o.paymentToken,
      expiry: o.expiry,
    };

    byToken.set(k, {
      ...(prev === undefined || o.price > prev.best ? here : prev),
      count: (prev?.count ?? 0) + 1,
    });
  });

  return byToken;
}
