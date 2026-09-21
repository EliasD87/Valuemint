/**
 * What the landing page shows, chosen by hand.
 *
 * ── EDIT THIS FILE TO CHANGE THE FRONT PAGE ──────────────────────────────
 *
 * Add, remove or reorder the entries below. The first one is the first card.
 * Nothing else needs changing and no deploy step is special: the grid renders
 * exactly this list, in this order.
 *
 * -------------------------------------------------------------------------
 *
 * Why a list rather than a query.
 *
 * The front page used to work out its own contents from the chain: every
 * collection, then `totalSupply` for each, then `tokenByIndex`, then `ownerOf`
 * and `tokenURI`, then a metadata document per token. Five network round trips
 * in strict order before anything knew what to draw — measured live, with a
 * 106 ms TTFB and the DOM ready at 383 ms, the first piece of artwork was not
 * even *requested* until 4,240 ms.
 *
 * It also meant the front page belonged to whoever deployed a contract last.
 * Every collection anyone created walked straight onto it, in whatever order
 * the chain happened to answer in.
 *
 * Both problems have the same answer. These images are named here, so the grid
 * is HTML on the first paint with no chain reads at all, and what appears on it
 * is a decision rather than an accident.
 *
 * Prices, offers and "not listed" arrive afterwards from the live hooks and
 * settle into the cards without moving anything. Nobody waits on a price to see
 * a picture.
 *
 * -------------------------------------------------------------------------
 *
 * About the images. They are the collections' real artwork at its real address,
 * so nothing is copied or re-hosted and nothing can go stale. They are served
 * through `/api/still`, which resizes and re-encodes them and is cached for a
 * year — that is what turns Cybereator's 6.58 MB GIF into 22 KB for a card, or
 * 1.59 MB of animated WebP when it plays.
 */

export interface FeaturedPiece {
  /** The collection this belongs to. Clicking the card opens it. */
  collection: `0x${string}`;
  /** What to call it on the card. */
  name: string;
  /** The collection's name, under it. */
  collectionName: string;
  /**
   * The artwork, served from our own origin.
   *
   * A path under `public/`, not a gateway URL. These used to point at
   * `ipfs.filebase.io` and `gateway.pinata.cloud`, which put a third party on
   * the critical path of the first thing anybody sees: every visitor waited on
   * a gateway answering and then on `/api/still` resizing what came back,
   * before the front page had a picture on it.
   *
   * This is a curated list that only ever changes by hand, so there is nothing
   * to discover at runtime. `metadata/scripts/localise-featured.mjs` fetches,
   * resizes to 640px WebP and writes into `public/featured/` — 5.58MB of
   * gateway sources became 657KB committed, and the grid now paints from our
   * own CDN with no gateway and no transform.
   *
   * A remote URL still works if one is ever put back: `Art` falls through to a
   * plain `<img>` for a host it cannot optimise. It is simply slower.
   */
  image: string;
  /**
   * Open this token rather than the collection.
   *
   * Left out for a piece that stands for its collection — a tier, a cover —
   * where the collection is the more useful destination.
   */
  tokenId?: string;
  /** A short label: a tier, an edition, whatever is worth saying. */
  note?: string;
  /**
   * Let it animate on the front page.
   *
   * Only worth it for artwork that actually moves. An animation costs many
   * times its still — 1.59 MB against 22 KB for Cybereator — so this is opt-in
   * per piece rather than a property of the grid.
   */
  motion?: boolean;
  /**
   * Whose collection this is, shown as their own mark under the name.
   *
   * Deliberately its own field rather than being inferred from whether the
   * card is highlighted. The two happen to coincide today — SoDEX's two
   * collections are the two the front page leads with — and they are different
   * facts: one is whose artwork it is, the other is what this site is choosing
   * to point at. Tying them together would put SoDEX's trademark on whatever
   * got promoted next.
   */
  brand?: "sodex";
}

/** Twelve pieces: three rows of four on a desktop grid. */
export const FEATURED: FeaturedPiece[] = [
  // ── row one ────────────────────────────────────────────────────────────
  {
    /*
      The one card pointed at a local file rather than at the artwork's own
      address, and the reason is worth keeping.

      Through `/api/still` this animation is generated on demand: 6.58 MB
      fetched from Pinata and 125 frames re-encoded, about ten seconds. Once
      made it is cached hard — but a CDN evicts by region and popularity, and a
      low-traffic edge drops an 800 KB file quickly. Measured on the live site,
      the very URL this card uses came back MISS with an `age` of 57 seconds,
      meaning the copy had just been rebuilt.

      Every one of those misses is somebody looking at the front page's most
      prominent card while it sits on its still frame — which is a static
      picture, which is what people were reporting.

      A file in `public/` cannot miss. It is 331 KB against 800 KB, it is served
      from our own origin as an immutable asset, and it animates the instant it
      arrives. The hero deck above has worked this way from the start for
      exactly this reason.

      The trade, stated plainly: this is a re-encode we made — 320px and 33
      frames against the token artwork's 480px and 125 — so it is the same
      character on a shorter loop, not the canonical file. Acceptable for a
      poster card on the front page; it would not be acceptable on a token page,
      where the artwork is the thing being bought.

      `motion` is gone with it: there is no still to upgrade from, the file is
      simply animated.
    */
    collection: "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
    collectionName: "Cybereator",
    name: "Cybereator",
    image: "/boxes/cybereator.webp",
    brand: "sodex",
  },
  {
    /*
      ONE box card, and no tier on it.

      There were three — SuperRare, Rare and Uncommon — each labelled with its
      tier, and three cards carrying three different names read as three
      collections. They are one contract: 6,451 pieces, four tiers. The label
      was what made them look separate, so it is gone with the other two, and
      this card stands for the collection rather than for a tier of it.
    */
    /*
      Repointed to the real contract along with the hero cards above it.

      Two cards on one page showing the same artwork and opening different
      contracts is the kind of thing nobody notices until somebody buys on the
      wrong one, so this moved with them rather than being left behind.
    */
    collection: "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750",
    collectionName: "SoDEX Treasure Box",
    name: "SoDEX Treasure Box",
    image:
      "/featured/sodex-treasure-box-sodex-treasure-box.webp",
    brand: "sodex",
  },
  {
    collection: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    collectionName: "ValueChain Genesis",
    name: "OBSIDIAN",
    tokenId: "2",
    image: "/featured/valuechain-genesis-obsidian.webp",
  },
  {
    collection: "0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19",
    collectionName: "The Trenches",
    name: "Scout",
    tokenId: "1000001",
    note: "Depth 1",
    /* Kept in step with `config/tiers.ts` by hand, because this file is a
       curated poster list rather than a query. Tier 1's name and artwork both
       changed when the collection was re-cut; leaving either behind would have
       put a retired picture on the front page under a name that no longer
       exists. */
    image: "/featured/the-trenches-scout.webp",
  },

  // ── row two ────────────────────────────────────────────────────────────
  {
    collection: "0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988",
    collectionName: "Hypno Plush",
    name: "VIOLET PULSE",
    tokenId: "2",
    image: "/featured/hypno-plush-violet-pulse.webp",
  },
  {
    collection: "0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988",
    collectionName: "Hypno Plush",
    name: "BUBBLE POP",
    tokenId: "1",
    image: "/featured/hypno-plush-bubble-pop.webp",
  },
  {
    collection: "0xfE7b74F5dbAeEA6A0Ef0385F572D60083FEFE0C0",
    collectionName: "Orange Companions",
    name: "Master Chef",
    tokenId: "1",
    image: "/featured/orange-companions-master-chef.webp",
  },
  {
    collection: "0xc486e7AA1C971a61c2a9c6B8ccf671AcB0FFD064",
    collectionName: "The Oracle",
    name: "The Oracle",
    tokenId: "1",
    image: "/featured/the-oracle-the-oracle.webp",
  },

  // ── row three ──────────────────────────────────────────────────────────
  {
    collection: "0xfE7b74F5dbAeEA6A0Ef0385F572D60083FEFE0C0",
    collectionName: "Orange Companions",
    name: "Bug Hunter",
    tokenId: "2",
    image: "/featured/orange-companions-bug-hunter.webp",
  },
  {
    collection: "0x0273DF41B56E3480886Fe8f0451349bEc0f8edf6",
    collectionName: "SoDex Larpers",
    name: "SoDex Larper",
    tokenId: "1",
    image: "/featured/sodex-larpers-sodex-larper.webp",
  },
  {
    collection: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    collectionName: "ValueChain Genesis",
    name: "LUMINATE",
    tokenId: "4",
    image: "/featured/valuechain-genesis-luminate.webp",
  },
  {
    collection: "0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19",
    collectionName: "The Trenches",
    name: "Architect",
    tokenId: "4000001",
    note: "Depth 4",
    image: "/featured/the-trenches-architect.webp",
  },
];

/**
 * Collections read in the background while somebody is on the front page, so
 * that opening one is instant.
 *
 * ── KEEP THIS SHORT ──────────────────────────────────────────────────────
 *
 * Each entry is roughly sixty `tokenByIndex` and sixty `tokenURI` calls plus
 * one batched metadata request, paid by every home-page visitor whether or not
 * they click. Two or three is the right size.
 *
 * This existed before, warmed all three starting 1.5 s in, and cost twenty RPC
 * requests over 11.6 seconds peaking at seven at once — which made the whole
 * page feel slow. It is back because these three are where people actually go,
 * but spaced out: the first starts well after the artwork has the network to
 * itself, and they go one at a time. Hovering a card still warms it
 * immediately, which is the fast path for somebody who is about to click.
 */
/**
 * Collections pinned to the front of a listing, in this order.
 *
 * /collections is otherwise in discovery order, which means the block
 * explorer's order, which means no order at all from a reader's point of view —
 * and what it happened to put first was the two TEST contracts. A visitor
 * landing there met "TestSoDEXTreasureBox" and "TestCybereator" before either
 * of the real collections, which reads as though the test ones are the
 * headline act.
 *
 * Named rather than ranked. Ranking by supply or by listings would put the
 * test contracts first again on the numbers — the test boxes hold 6,451 pieces
 * against the real one's handful — and no arithmetic knows which of two
 * identical-looking contracts is the one that counts. That is a decision, so
 * it is written down.
 *
 * Anything not named here keeps its existing order, after these.
 */
export const PINNED_COLLECTIONS: ReadonlyArray<`0x${string}`> = [
  /**
   * SoDEX Treasure Box, the real one, and first by decision.
   *
   * Cybereator led this list until 2026-09-21, which cost nothing while
   * neither contract had a listing. It stopped being free the moment /market
   * started reading this order too: the boxes are the collection that is
   * actually trading, and the owner asked for them at the top twice. Written
   * here rather than as a special case in /market, so the two pages that
   * consult this list cannot disagree about it.
   */
  "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750",

  /** Cybereator, the real one. */
  "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
];

export const WARM_COLLECTIONS: ReadonlyArray<`0x${string}`> = [
  /**
   * The real boxes, first, because every card in the hero now opens this one.
   *
   * It is also the cheapest entry in this list by a wide margin, which is what
   * makes a fourth affordable at all: it holds a handful of pieces rather than
   * the test contract's 6,451, so warming it is a couple of reads and a
   * metadata request rather than sixty of each. That will stop being true as
   * it fills up — when it does, this list wants to lose an entry, not gain
   * one.
   */
  "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750",

  /*
    The two test contracts used to sit here, and they earned it: they held
    nearly every traded box and most of the traded Cybereators, so warming
    them warmed what people were about to look at.

    They went into `hidden.ts` on 2026-09-21, which means no page this list
    serves enumerates them any more — warming a collection the visitor is
    never shown is spend with nothing on the other side of it. Their own
    pages still work, and land cold, which is the right trade for two
    contracts nothing links to.
  */

  /** Cybereator, the real one. */
  "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
];
