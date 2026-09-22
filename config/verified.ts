/**
 * Collections this marketplace vouches for.
 *
 * ── TO MARK A COLLECTION, ADD AN ENTRY BELOW ─────────────────────────────
 *
 * Keys are collection addresses, lower-cased. The value is why it is here,
 * and it is shown to visitors rather than kept as a code comment.
 *
 * -------------------------------------------------------------------------
 *
 * **A tick is a claim made by us, and the only honest way to run one is to
 * have a reason written down.**
 *
 * On a marketplace this mark answers "is this the real one". A visitor about
 * to spend reads it as the site saying yes, so it cannot mean "we like this",
 * "this sells well" or "we listed it first". Anyone can deploy a contract
 * called SoDEXTreasureBox with the same artwork; the tick is how somebody
 * knows which address is the one the creator actually used.
 *
 * Every entry therefore carries the reason it qualifies, the UI shows that
 * reason on the mark itself, and the absence of a tick means "not checked"
 * rather than "fake" — which is why nothing anywhere draws a negative mark.
 *
 * It says nothing about whether a piece is a good buy. It has no opinion about
 * price, rarity or the creator's future conduct.
 */

export interface VerifiedCollection {
  /** Why this address is the real one. Shown to visitors, not just to us. */
  reason: string;
}

/** Lower-cased address -> why it is marked. */
export const VERIFIED_COLLECTIONS: Record<string, VerifiedCollection> = {
  /*
    Cybereator — SoDEX's own, and the artwork here was supplied by them.

    Verified on the explorer as a proxy created by
    0x888eB1Df1DB074cB50afb509a2aAce23895B86D9, the same wallet behind SoDEX's
    other deployments. It is not a factory collection, which is precisely why
    it needs naming: nothing about it is self-evident from this app's own
    registry.
  */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": {
    reason: "SoDEX's own collection, deployed from their wallet.",
  },

  /*
    SoDEXTreasureBox — the same publisher, and the banner on its collection
    page was supplied by them directly.
  */
  "0x371c4f7f68be3e558b89cc1f0fb113851c76e750": {
    reason: "SoDEX's own collection, deployed from their wallet.",
  },
};

/**
 * Why a collection is verified, or `undefined` if it is not marked.
 *
 * Returns the REASON rather than a boolean on purpose: a caller that has to
 * carry the reason to the screen cannot accidentally render a tick with
 * nothing behind it.
 */
export function verifiedReason(address: string | undefined): string | undefined {
  if (address === undefined) return undefined;
  return VERIFIED_COLLECTIONS[address.toLowerCase()]?.reason;
}
