/**
 * The pictures Explore's story is told with (2026-10-09).
 *
 * Everything below the hero draws from this file and from the market figures
 * baked into the page, never from the chain: every image here is our own WebP
 * in `public/`, so the sections paint as soon as they are scrolled to. Change
 * a picture here, not in the component.
 */

export interface SpotlightSlide {
  /** Lower-cased collection address; floors and listings are looked up by it. */
  address: `0x${string}`;
  name: string;
  /** A wide picture, cropped to the banner by `object-fit: cover`. */
  image: string;
  /** Where the crop centres, as `object-position`. */
  focus?: string;
  /**
   * A cut-out standing on the banner's floor at the right, over the picture:
   * the same layers the collection page's own header uses (config/heroes.ts).
   */
  foreground?: string;
  foregroundAlt?: string;
}

export const SPOTLIGHT: SpotlightSlide[] = [
  {
    address: "0x371c4f7f68be3e558b89cc1f0fb113851c76e750",
    name: "SoDEX Treasure Box",
    image: "/heroes/treasurebox.webp",
  },
  {
    address: "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30",
    name: "Cybereator",
    image: "/heroes/cybereator-bg.webp",
    foreground: "/heroes/cybereator-cat.webp",
    foregroundAlt: "The Cybereator cat, leaning on a bar",
  },
  {
    address: "0x5fadc59297e86acea20bff519aea0f9651cdc90b",
    name: "ValueChain Genesis",
    image: "/heroes/genesis-still.webp",
  },
  {
    address: "0xaab0dc8f2835ed903b35d2f52ff17c4bc92bec19",
    name: "The Trenches",
    image: "/heroes/trenches-cover-v3.webp",
    focus: "50% 30%",
  },
];

export interface CascadeCard {
  image: string;
  /** The collection the card opens. */
  collection: `0x${string}`;
  /** Shown on the card when it is lifted, and read out as the link's name. */
  name: string;
}

/** The fanned stack beside the opening headline, back to front. Each card opens its collection. */
export const CASCADE: CascadeCard[] = [
  { image: "/covers/aab0dc8f-v2-halo.webp", collection: "0xaab0dc8f2835ed903b35d2f52ff17c4bc92bec19", name: "The Trenches" },
  { image: "/featured/hypno-plush-violet-pulse.webp", collection: "0x01c28095bfffc9973da4c4e8a34e9d5b6649c988", name: "Hypno Plush" },
  { image: "/boxes/rare.webp", collection: "0x371c4f7f68be3e558b89cc1f0fb113851c76e750", name: "SoDEX Treasure Box" },
  { image: "/featured/valuechain-genesis-obsidian.webp", collection: "0x5fadc59297e86acea20bff519aea0f9651cdc90b", name: "ValueChain Genesis" },
  { image: "/boxes/cybereator.webp", collection: "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30", name: "Cybereator" },
];

/** The four pieces fanned out on the bento's portfolio card. */
export const WALLET_ART: string[] = [
  "/covers/371c4f7f-1.webp",
  "/covers/5fadc592-1.webp",
  "/covers/01c28095-1.webp",
  "/covers/fe7b74f5-1.webp",
];

/** The four box levels, on the bento's bulk-buy and listing cards. */
export const BAND_ART: string[] = [
  "/boxes/sobox/common.webp",
  "/boxes/sobox/uncommon.webp",
  "/boxes/sobox/rare.webp",
  "/boxes/sobox/superrare.webp",
];
