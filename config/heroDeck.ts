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
 * **The cost, stated plainly:** this is a hardcoded list of collections, which
 * is the thing CLAUDE.md warns about, and it will not notice a new collection
 * or one that gets hidden. That is acceptable for a decorative fan of five
 * cards and would not be for anything that quotes a number. If the set of
 * collections changes, update this file - the artwork lives in `public/hero/`
 * and `scripts/refresh-hero.mjs` re-downloads it.
 *
 * Everything below the hero is still live.
 */

export interface HeroCard {
  /** Where the card links. Live, so a wrong address here is a broken link. */
  address: `0x${string}`;
  name: string;
  /** Bundled, 600px WebP. See public/hero/. */
  image: string;
}

export const HERO_DECK: HeroCard[] = [
  {
    address: "0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19",
    name: "The Trenches",
    image: "/hero/trenches.webp",
  },
  {
    address: "0x0273DF41B56E3480886Fe8f0451349bEc0f8edf6",
    name: "SoDex Larpers",
    image: "/hero/larpers.webp",
  },
  {
    address: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    name: "ValueChain Genesis",
    image: "/hero/genesis.webp",
  },
  {
    address: "0xe1C322BC972f78E78cfac98f71aA986C65D9C3bD",
    name: "Trade Buddies",
    image: "/hero/buddies.webp",
  },
  {
    address: "0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988",
    name: "Hypno Plush",
    image: "/hero/hypno.webp",
  },
];
