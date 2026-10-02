/**
 * Collections holding part of their supply back, and the proof that the held
 * part was decided before anybody could mint it.
 *
 * ── TO DESCRIBE A HELD-BACK TAIL, ADD AN ENTRY BELOW ──────────────────────
 *
 * Keys are collection addresses, lower-cased.
 *
 * -------------------------------------------------------------------------
 *
 * **Everything here is already public, and that is the point.**
 *
 * A v3 manifest publishes the assignments of the minted pieces and stops. The
 * tail's ORDER is withheld; its COMPOSITION is not, and cannot be — the design
 * counts are declared in the same manifest, so anybody can subtract the
 * published head and get the tier breakdown exactly. Printing it here gives
 * nothing away and turns a fact somebody could derive into a fact everybody is
 * told. A mystery box that shows its odds is a different product from one that
 * does not.
 *
 * What is NOT here, and must never be, is which token gets what. That lives in
 * one gitignored file and is published at reveal.
 */

export interface HeldBack {
  /** How many pieces at the end of the supply have no published design yet. */
  count: number;

  /**
   * The tier breakdown of those pieces, largest group first.
   *
   * These are the odds for a mint, and they do not sharpen as minting goes on:
   * nothing is revealed until the reveal, so the piece minted before yours
   * tells you nothing. That is deliberate — it is what stops somebody watching
   * outcomes and timing their entry.
   */
  tiers: ReadonlyArray<{ name: string; count: number }>;

  /**
   * The transaction that published a hash of the tail, before the first of
   * these could be minted.
   *
   * This is the entire proof. Without it the collection is asking to be taken
   * at its word, and a reader who wants to check has somewhere to go.
   */
  commitmentTx: `0x${string}`;

  /** The pinned manifest that withholds the tail. Shown as the thing hashed. */
  hiddenCid: string;

  /**
   * A date the reveal happens by, whatever minting has done — ISO `YYYY-MM-DD`.
   *
   * **Leaving this undefined is a decision, not a default.** Without it the
   * promise is "revealed when the last one is minted", and if minting stalls
   * five pieces short then those holders wait forever. Naming a date costs the
   * creator nothing — revealing is one `setBaseURI` — and it is the difference
   * between a wait and an open-ended one.
   */
  revealBy?: string;
}

export const HELD_BACK: Record<string, HeldBack> = {
  /*
    ValueChain Genesis, 2026-09-22.

    77 of 100 were minted against a fully public manifest; the remaining 23
    were re-ordered under a secret seed and their order withheld. The hash of
    that order went on chain at block 14,668,651 — twenty-one blocks before the
    `setBaseURI` that reopened minting against the hidden manifest, which is
    what makes it a commitment rather than a claim.

    2026-10-02: the minted ones, #78-#85, were revealed on the announced date
    (tx 0x5485cc0b…df2e84). #86-#100 stay sealed — revealing them while unminted
    would show which design each id carries, and mints go in id order.

    The tiers below are what is left of the pot, derived from the live manifest
    (declared design counts minus the 85 published): 7 Common, 6 Rare, 1 Epic,
    1 Legendary, totalling 15. Before the partial reveal it was 10/10/2/1 of 23.
  */
  "0x5fadc59297e86acea20bff519aea0f9651cdc90b": {
    count: 15,
    tiers: [
      { name: "Common", count: 7 },
      { name: "Rare", count: 6 },
      { name: "Epic", count: 1 },
      { name: "Legendary", count: 1 },
    ],
    commitmentTx: "0x3763dc71d4c82ce6830634ac4e0220bc1e2a72d387b243000fae813d4fd0a27f",
    /* The manifest Genesis points at since the partial reveal: #1-#85 published. */
    hiddenCid: "QmaiYADuP5ZzM5v9n4nNeoDtoHopvu6V8KmUhZyCryT3ea",
    /* Set by the owner, 2026-09-23, as 2 October; moved by the owner to
       15 October on 2026-10-02 for the pieces still unminted after the first
       reveal. Revealing is one setBaseURI, so the date can always be beaten,
       never missed. */
    revealBy: "2026-10-15",
  },
};

/** What a collection is holding back, or nothing if it holds nothing back. */
export function heldBackFor(address: string | undefined): HeldBack | undefined {
  if (address === undefined) return undefined;
  return HELD_BACK[address.toLowerCase()];
}
