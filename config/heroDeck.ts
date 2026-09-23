/**
 * The hero deck: a poster, not a data view.
 *
 * This was built from live chain data, one card per collection, on the
 * principle that the hero should be the marketplace's own contents and could
 * not go stale. Correct in spirit, and it made the first thing anyone sees the
 * slowest thing on the page.
 *
 * Measured on the home page: the DOM was ready at 251ms and the deck had no
 * images until **11.7 seconds**. Not the artwork - those bytes arrive in 30-90ms
 * once requested - but everything that has to finish before the URL is known:
 * enumerate collections, read `tokenURI` for a sample of each, fetch every
 * metadata document, then pick one image. Roughly a hundred round trips to
 * choose five pictures.
 *
 * So the deck is a curated snapshot now, bundled and served from our own
 * origin. It paints immediately.
 *
 * **The cost, stated plainly:** this is a hardcoded list, which is the thing
 * CLAUDE.md warns about, and it will not notice a new collection or one that
 * gets hidden. That is acceptable for a decorative fan of five cards and would
 * not be for anything that quotes a number. The artwork lives in `public/hero/`
 * and `public/boxes/`; `scripts/refresh-hero.mjs` re-downloads the former.
 *
 * Everything below the hero is still live, including the collections rail - so
 * the front page still answers "what is on this marketplace" even while the
 * deck is pointed at one thing.
 *
 * ---
 *
 * **Why the deck is the SoDEX treasure boxes.**
 *
 * They are not minted and cannot be bought. SoDEX sends them to people who
 * finish tasks, so a holder did not buy one and cannot buy another - the only
 * thing left to do with it is trade it, and this is where that happens. That
 * makes them the best answer this page has to "why would I come here", which
 * is the hero's whole job.
 *
 * The fan used to be four tiers of one box collection around the Cybereator,
 * which meant four of five cards led to the same page. The two boxes that
 * remain sit either side of the centre and keep their order; the outermost
 * card on each side is ValueChain Genesis, so the deck now shows three
 * collections rather than one contract four times. The Cybereator keeps the
 * middle slot, which is the front of the fan, because it is the only animated
 * card.
 */

export interface HeroCard {
  /**
   * Where the card links. Live, so a wrong address here is a broken link.
   *
   * Optional, because a card can exist before its collection does. The SoDEX
   * boxes are announced and not yet deployed: there is no address to link to,
   * and inventing one sends people to somebody else's contract. A card without
   * an address renders as a card rather than a link.
   *
   * **On the day the real collection ships**, add its address to the four box
   * cards and they start linking. Nothing else needs to change - the rest of
   * the site picks the collection up on its own, because the marketplace lists
   * any ERC-721 the explorer indexes.
   */
  address?: `0x${string}`;
  name: string;
  /** Bundled WebP, served from our own origin. See `public/`. */
  image: string;
  /**
   * The line under the name.
   *
   * Defaults to "View collection", which is a promise a card cannot keep when
   * there is no collection yet. For the boxes it carries the tier instead,
   * which is the useful thing to say about four pictures of the same object.
   */
  caption?: string;
  /**
   * Show SoDEX's own wordmark in front of the caption.
   *
   * Four pictures of a box do not say "SoDEX Treasure Box" to anyone who has
   * not seen one, and that is the thing worth saying - it is the reason
   * somebody would come here. The mark carries it better than the word would,
   * and it belongs on the cards rather than on a line of its own above them:
   * a separate lockup made the hero taller, and on a phone it detached from the
   * deck entirely and read as a footer.
   */
  brand?: "sodex";
}

/**
 * Where the cards go, now that both collections exist.
 *
 * Every card was unlinked, because when the deck was built the treasure boxes
 * were announced rather than deployed and `/collection/undefined` is not a
 * page. The test contract has been live and trading for a while — 6,451 pieces
 * — and Cybereator is live too, so five pictures of things people can actually
 * open were the one part of the front page that went nowhere.
 *
 * The two boxes point at the same collection, which is right: they are two
 * tiers of one contract, not two collections.
 */
/*
  The real boxes, not the test ones.

  These four cards pointed at the test contract for as long as that was the
  only one deployed — the note further up this file said to repoint them "on
  the day the real collection ships", and it has. Verified on chain before
  changing anything: name "SoDEXTreasureBox", symbol SOBOX, answers
  `supportsInterface(ERC721)`, and `tokenURI(1)` resolves to SoDEX's own
  metadata host. It is a proxy, 163 bytes of bytecode, same shape as
  Cybereator.

  Two things it is worth knowing this sends people to. It is young, so there is
  very little in it yet — the test contract still holds essentially every box
  that has traded. And it does not implement Enumerable (`tokenByIndex`
  reverts), so its page finds pieces by the fallback path rather than by
  walking an index.
*/
const TREASURE_BOX = "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750" as const;
const CYBEREATOR = "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30" as const;
/* Verified before linking, the way the box address above was: `name()` on this
   contract answers "ValueChain Genesis". */
const GENESIS = "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B" as const;

export const HERO_DECK: HeroCard[] = [
  /*
    The two ends of the fan are a second collection, not two more tiers of the
    first.

    Four of the five cards pointed at `TREASURE_BOX`, so a deck whose job is to
    say "here is what this marketplace holds" said one thing four times and
    sent every click to the same page. The outermost card on each side now
    carries different artwork and goes somewhere else, which is also the pair
    of slots where it costs least: the fan tilts them furthest and clips them
    most, so the two cards seen least completely are the two that are no longer
    the same object as their neighbours.

    Both are ValueChain Genesis, so both link there. Two cards from one
    collection is the same arrangement the boxes have either side of the
    centre — a deck of five slots showing three collections rather than one.
  */
  {
    name: "ValueChain Genesis",
    address: GENESIS,
    image: "/hero/genesis-red.webp",
  },
  {
    name: "Uncommon box",
    address: TREASURE_BOX,
    image: "/boxes/uncommon.webp",
    caption: "Treasure Box",
    brand: "sodex",
  },
  {
    /**
     * The middle slot, which is the front of the fan.
     *
     * `axis` is `(deck.length - 1) / 2`, so on five cards index 2 sits at slot
     * 0: no tilt, no offset, on top of the other four. It is the one card
     * anybody looks at first, and it is the only animated one.
     *
     * Converted from the 1,053 KB source GIF to a 324 KB animated WebP - all
     * 33 frames, a 69% saving. It is still the heaviest thing in the deck by
     * far (the next is 41 KB), which matters because every card is above the
     * fold and fetched at high priority. Worth it for the front card; do not
     * add a second.
     */
    name: "Cybereator",
    address: CYBEREATOR,
    image: "/boxes/cybereator.webp",
    caption: "Unrevealed",
  },
  {
    name: "Rare box",
    address: TREASURE_BOX,
    image: "/boxes/rare.webp",
    caption: "Treasure Box",
    brand: "sodex",
  },
  {
    name: "ValueChain Genesis",
    address: GENESIS,
    image: "/hero/genesis-mono.webp",
  },
];
