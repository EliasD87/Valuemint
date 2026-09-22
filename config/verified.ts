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
 * `reason` is the SHORT public claim. The evidence behind it — which wallet
 * deployed what, and how it was confirmed — stays in the comment above each
 * entry, because that is the part a future maintainer needs and the part a
 * visitor does not.
 *
 * It says nothing about whether a piece is a good buy. It has no opinion about
 * price, rarity or the creator's future conduct.
 */

export interface VerifiedCollection {
  /** Why this address is the real one. Shown to visitors, not just to us. */
  reason: string;
  /**
   * Which mark to draw.
   *
   * **Two colours must mean two things, or they read as two ranks.** The
   * distinction here is WHO is being vouched for, not how good the collection
   * is:
   *
   *   `mint`      — ValueMint's own, and verified by us directly.
   *   `publisher` — somebody else's, and confirmed as genuinely theirs.
   *
   * Nothing about either says a piece is worth buying. If a third tone is ever
   * wanted, it needs a third answer to "who", not a third level of approval.
   */
  tone: "mint" | "publisher";
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
    reason: "An official SoDEX collection.",
    tone: "publisher",
  },

  /*
    SoDEXTreasureBox — the same publisher, and the banner on its collection
    page was supplied by them directly.
  */
  "0x371c4f7f68be3e558b89cc1f0fb113851c76e750": {
    reason: "An official SoDEX collection.",
    tone: "publisher",
  },

  /*
    ValueChain Genesis — ours, and the first NFT collection on this chain.

    The only entry carrying the `mint` tone, and the reason is two claims rather
    than one: that this marketplace vouches for it, and that it was first. The
    second is a matter of record on the chain rather than an opinion, which is
    the only kind of superlative worth putting on a badge.
  */
  "0x5fadc59297e86acea20bff519aea0f9651cdc90b": {
    /*
      No "Verified by" here: the mark's label already opens with "Verified
      collection —", and the two together read "Verified collection — Verified
      by ValueMint".
    */
    reason: "The first NFT collection on ValueChain.",
    tone: "mint",
  },
};

/**
 * The whole entry for a collection, or `undefined` if it is not marked.
 *
 * Returns the ENTRY rather than a boolean on purpose: a caller that has to
 * carry the reason to the screen cannot accidentally render a tick with
 * nothing behind it, and it cannot pick a colour that has no meaning attached.
 */
export function verifiedAs(address: string | undefined): VerifiedCollection | undefined {
  if (address === undefined) return undefined;
  return VERIFIED_COLLECTIONS[address.toLowerCase()];
}
