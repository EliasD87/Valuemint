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
 * The four boxes are a rarity ladder and keep that order outward from the
 * centre - common and uncommon on the left, rare and super rare on the right -
 * so the fan still reads left to right the way the tiers do. The Cybereator
 * takes the middle slot, which is the front of the fan, because it is the only
 * animated card and the other four are stills of the same object.
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
 * The four boxes all point at the same collection, which is right: they are
 * four tiers of one contract, not four collections.
 */
const TREASURE_BOX = "0x761C3DD0f7a9282E9c5D108394EC7f3AB524A213" as const;
const CYBEREATOR = "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30" as const;

export const HERO_DECK: HeroCard[] = [
  {
    name: "Common box",
    address: TREASURE_BOX,
    image: "/boxes/common.webp",
    caption: "Treasure Box",
    brand: "sodex",
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
     * anybody looks at first, and it is the only animated one - the other four
     * are stills of the same object in four materials and would waste the
     * position.
     *
     * Animated, and the only card here that is. Converted from the 1,053 KB
     * source GIF to a 324 KB animated WebP - all 33 frames, a 69% saving. It is
     * still the heaviest thing in the deck by far (the next is 55 KB), which
     * matters because every card is above the fold and fetched at high
     * priority. Worth it for the front card; do not add a second.
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
    name: "Super rare box",
    address: TREASURE_BOX,
    image: "/boxes/superrare.webp",
    caption: "Treasure Box",
    brand: "sodex",
  },
];
