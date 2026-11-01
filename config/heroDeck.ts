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
 * not be for anything that quotes a number. The artwork lives in
 * `public/covers/` and `public/boxes/`.
 *
 * Everything below the hero is still live, including the collections rail - so
 * the front page still answers "what is on this marketplace" even while the
 * deck is pointed at one thing.
 *
 * ---
 *
 * **Five cards, five collections (owner, 2026-11-01).**
 *
 * The Cybereator keeps the middle slot, the front of the fan. The four around it were two Treasure Boxes and two
 * Genesis helmets, so the deck showed three collections and sent four clicks
 * to two pages. Each is now one piece the owner picked from a different
 * collection: Wickborn's The Dealer, the Trenches' Warlord, the SuperRare box
 * and a Larper.
 *
 * The Dealer moves, as it does on its own page: the 1.1 MB, 72-frame GIF as an
 * animated WebP at 456px (twice the card's widest), 265 KB with every frame
 * and the GIF's timing. Warlord is the tier's art from `config/tiers.ts` at
 * 512px. Both are in `public/hero/`, served from our own origin with a day's
 * CDN cache (`next.config.ts`) — nothing in the deck reads the chain. A re-cut
 * Trenches tier means re-making that file under a new name.
 *
 * Arranged against the faded cutouts behind the hero (`.hx-cut-*` in
 * hero.css): the Larpers figure floats on the left, so the Larpers card sits
 * on the right, away from its twin. White grounds on the two outer cards,
 * dark ones on the two inner, so the fan is even either side of the centre.
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
   * What the piece belongs to, when the name alone does not say ("The Dealer",
   * "Wickborn"). Not drawn: the cards are artwork only. It completes the
   * image's alt text, which is the link's accessible name.
   */
  caption?: string;
}

const CYBEREATOR = "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30" as const;
/* The four around it. Each verified by `name()` on the explorer before linking
   (2026-11-01), and none is in config/hidden.ts. */
const WICKBORN = "0x5DbD25366a60bbD07960535760Cf6eef36128404" as const;
const TRENCHES = "0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19" as const;
const TREASURE_BOX = "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750" as const;
const LARPERS = "0x0273DF41B56E3480886Fe8f0451349bEc0f8edf6" as const;

export const HERO_DECK: HeroCard[] = [
  {
    name: "The Dealer",
    address: WICKBORN,
    image: "/hero/wickborn-dealer.webp",
    caption: "Wickborn",
  },
  {
    name: "Warlord",
    address: TRENCHES,
    image: "/hero/trenches-warlord.webp",
    caption: "The Trenches",
  },
  {
    /**
     * The middle slot, which is the front of the fan.
     *
     * `axis` is `(deck.length - 1) / 2`, so on five cards index 2 sits at slot
     * 0: no tilt, no offset, on top of the other four. It is the one card
     * anybody looks at first.
     *
     * Converted from the 1,053 KB source GIF to a 324 KB animated WebP - all
     * 33 frames, a 69% saving. With The Dealer (265 KB) the two animated cards
     * are most of the deck's weight, and every card is above the fold and
     * fetched at high priority. Two is the owner's call (2026-11-01); a third
     * would want measuring first.
     */
    name: "Cybereator",
    address: CYBEREATOR,
    image: "/boxes/cybereator.webp",
  },
  {
    name: "SuperRare box",
    address: TREASURE_BOX,
    image: "/boxes/superrare.webp",
    caption: "SoDEX Treasure Box",
  },
  {
    name: "SoDex Larpers",
    address: LARPERS,
    image: "/covers/0273df41-1.webp",
  },
];
