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
   * The artwork, at its own address.
   *
   * An `https://` gateway URL. Anything on a host `/api/still` is allowed to
   * fetch is resized and cached; anything else still renders, just heavier.
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
}

/** Twelve pieces: three rows of four on a desktop grid. */
export const FEATURED: FeaturedPiece[] = [
  // ── row one ────────────────────────────────────────────────────────────
  {
    collection: "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
    collectionName: "Cybereator",
    name: "Cybereator",
    image:
      "https://gateway.pinata.cloud/ipfs/bafybeiexxwgg46ucafzx4fpesmobil45cwrspb34pefegnpzz5qux762p4",
    motion: true,
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
    collection: "0x761C3DD0f7a9282E9c5D108394EC7f3AB524A213",
    collectionName: "SoDEX Treasure Box",
    name: "SoDEX Treasure Box",
    image:
      "https://gateway.pinata.cloud/ipfs/bafybeihqcahgiep6s2ech2imswhn2azwylilhq2cvuvuzquyhs5xccrvmu",
  },
  {
    collection: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    collectionName: "ValueChain Genesis",
    name: "OBSIDIAN",
    tokenId: "2",
    image: "https://ipfs.filebase.io/ipfs/QmaoM1sKhgYxjEyaF2H9BjZCjTNfwj4GK1AhvyvvrAoomM",
  },
  {
    collection: "0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19",
    collectionName: "The Trenches",
    name: "Ripple",
    tokenId: "1000001",
    note: "Depth 1",
    image: "https://ipfs.filebase.io/ipfs/QmaRw3gCPDSJ4cErcLf9V8bUUKckC5UP8kTF8jBrmcoyJ8",
  },

  // ── row two ────────────────────────────────────────────────────────────
  {
    collection: "0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988",
    collectionName: "Hypno Plush",
    name: "VIOLET PULSE",
    tokenId: "2",
    image: "https://ipfs.filebase.io/ipfs/QmbKZv4181zFxCF3kk3vNuKeVQxGPNQ61DiDBBuPGti1xv",
  },
  {
    collection: "0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988",
    collectionName: "Hypno Plush",
    name: "BUBBLE POP",
    tokenId: "1",
    image: "https://ipfs.filebase.io/ipfs/QmP62BaaW6qitRgGyzBBakn96MM3KQQL5LHXwy9e3mvm55",
  },
  {
    collection: "0xfE7b74F5dbAeEA6A0Ef0385F572D60083FEFE0C0",
    collectionName: "Orange Companions",
    name: "Master Chef",
    tokenId: "1",
    image: "https://ipfs.filebase.io/ipfs/QmbkHuFCw2ARHDTDzuqEJEnqUpRwZL9LsUyvYsk7yNehBT",
  },
  {
    collection: "0xc486e7AA1C971a61c2a9c6B8ccf671AcB0FFD064",
    collectionName: "The Oracle",
    name: "The Oracle",
    tokenId: "1",
    image: "https://ipfs.filebase.io/ipfs/QmR6DJr2KrZqkzQkcHCxHx956K9qaTnkjVvr9LmCu8etMs",
  },

  // ── row three ──────────────────────────────────────────────────────────
  {
    collection: "0xfE7b74F5dbAeEA6A0Ef0385F572D60083FEFE0C0",
    collectionName: "Orange Companions",
    name: "Bug Hunter",
    tokenId: "2",
    image: "https://ipfs.filebase.io/ipfs/QmZAGyVAeh4HxEb9TrXSxciBCdNeiKfxaFu3g7tECgFvAd",
  },
  {
    collection: "0x0273DF41B56E3480886Fe8f0451349bEc0f8edf6",
    collectionName: "SoDex Larpers",
    name: "SoDex Larper",
    tokenId: "1",
    image: "https://ipfs.filebase.io/ipfs/QmVDPjHpvRa4HMrGwBnZXEcBauRnCu1VZUPukuidRRdzzy",
  },
  {
    collection: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    collectionName: "ValueChain Genesis",
    name: "LUMINATE",
    tokenId: "4",
    image: "https://ipfs.filebase.io/ipfs/QmZUQTa5waSZCEqGiynkiTFyE9v9cgHEynP3BwwzuL4P4L",
  },
  {
    collection: "0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19",
    collectionName: "The Trenches",
    name: "Current",
    tokenId: "4000001",
    note: "Depth 4",
    image: "https://ipfs.filebase.io/ipfs/QmZhR1M4Tmnu42Qgz5c5EcjCBJK7JVaTjgXuRNM2LfkiDq",
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
export const WARM_COLLECTIONS: ReadonlyArray<`0x${string}`> = [
  /** The boxes — the biggest collection here, and the one most opened. */
  "0x761C3DD0f7a9282E9c5D108394EC7f3AB524A213",

  /** TestCybereator, which most of the traded pieces are. */
  "0x412D8af16B7fF3FE75e1CD380BD86Ef33dD8AD0f",

  /** Cybereator, the real one. */
  "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
];
