/**
 * Purpose-made banner art for a collection, named rather than derived.
 *
 * ── TO GIVE A COLLECTION A CUSTOM HEADER, ADD AN ENTRY BELOW ──────────────
 *
 * Keys are collection addresses, lower-cased. Without an entry a collection
 * falls back to a band assembled from its `config/covers.ts` thumbnails,
 * blurred — which is fine and is what every collection had before this file
 * existed. This is a fast path for artwork somebody actually composed, not a
 * requirement.
 *
 * -------------------------------------------------------------------------
 *
 * **Local paths, never a third party's URL.** These were supplied as
 * `sodex.com/assets/...` links and are committed under `public/heroes/`
 * instead, for the same reason `config/covers.ts` says in more detail: a
 * remote host in front of the first paint is someone else's uptime, someone
 * else's CORS policy and someone else's hotlink rules deciding whether the
 * top of our page draws. They are also re-encoded on the way in — the pair
 * below went from 130 KB to 62 KB with no visible change at the size they
 * render.
 *
 * **The background must be clear of whatever the foreground draws.** This is
 * the one rule that is easy to get wrong. Cybereator's supplied background is
 * the whole scene including a tinted copy of the cat, and the foreground is
 * that same cat cut out. Laid over each other they showed the character twice,
 * offset — and it could not be fixed with `object-position`, because
 * `object-fit: cover` on a band this wide scales a 16:9 source by its WIDTH, so
 * horizontal positioning does nothing at all. The committed background is
 * cropped to the bar shelves, left of where the cat stands.
 */

export interface HeroArt {
  /**
   * Fills the band, `object-fit: cover`.
   *
   * Composition should survive a hard crop: the band is roughly 5:1 on a
   * desktop and a great deal squarer on a phone, so anything that must be seen
   * belongs near the vertical centre.
   */
  background: string;

  /**
   * A cutout with transparency, standing on the band's floor at the right.
   *
   * Optional. Where a collection has only a background this is omitted and the
   * band is simply the picture.
   */
  foreground?: string;

  /**
   * Alt text for the foreground, which is the one part of a header that is
   * content rather than decoration.
   *
   * The background is always `aria-hidden` — it is atmosphere, and describing
   * it tells a screen reader nothing the collection's name did not. A character
   * standing in the header is closer to a logo, so it gets a name.
   */
  foregroundAlt?: string;
}

/** Lower-cased address -> its banner art. */
export const COLLECTION_HEROES: Record<string, HeroArt> = {
  /*
    Cybereator — SoDEX's own art, supplied by the owner.

    `cybereator-bg.webp` is their `cyber-bg-yellow` cropped to its left 1020px
    and re-encoded: 1600x900 and 42 KB became 1020x600 and 19 KB. The crop is
    what removes the tinted cat from the right side; see the note above.

    `cybereator-cat.webp` is their `cyber-cat-cutout` at 560px tall rather than
    913, which is still twice what it draws at on a retina panel: 88 KB to 43.
  */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": {
    background: "/heroes/cybereator-bg.webp",
    foreground: "/heroes/cybereator-cat.webp",
    foregroundAlt: "The Cybereator cat, leaning on a bar",
  },

  /** TestCybereator — the same artwork, from the same two files. */
  "0x412d8af16b7ff3fe75e1cd380bd86ef33dd8ad0f": {
    background: "/heroes/cybereator-bg.webp",
    foreground: "/heroes/cybereator-cat.webp",
    foregroundAlt: "The Cybereator cat, leaning on a bar",
  },
};

/** The named banner for a collection, or nothing if it has not been given one. */
export function heroFor(address: string | undefined): HeroArt | undefined {
  if (address === undefined) return undefined;
  return COLLECTION_HEROES[address.toLowerCase()];
}
