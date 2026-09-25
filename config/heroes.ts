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
   * Fills the band, `object-fit: cover`. Required unless `video` is given.
   *
   * Composition should survive a hard crop: the band is roughly 5:1 on a
   * desktop and a great deal squarer on a phone, so anything that must be seen
   * belongs near the vertical centre.
   */
  background?: string;

  /**
   * A looping, muted banner video, drawn in place of `background` by
   * `BannerVideo` — which crossfades its end into its start.
   */
  video?: {
    /** MP4 with its index at the front (`-movflags faststart`), or the
        browser has to fetch the end of the file before the first frame. */
    src: string;
    /** The video's first frame. Painted at once, and all that reduced motion
        sees. */
    still: string;
    /** The same loop as an animated image, crossfade baked in, for browsers
        that refuse to autoplay video. Without it they get the still. */
    fallback?: string;
  };

  /**
   * Where the band's crop sits in the background, as CSS `object-position` —
   * `"center 10%"` keeps the top of the picture and gives up the bottom.
   *
   * Optional, and centred when left out. The band is ~5:1 on a desktop, so a
   * banner drawn at ~2.7:1 loses nearly half its height, and centred it loses
   * the top quarter and the bottom quarter. That is right for art composed
   * around its middle (the boxes, Genesis) and wrong for art that puts its
   * title in the top band — which is exactly where a banner usually puts it.
   * Set this from a rendered crop, not a guess: see the Larpers entry.
   *
   * It only moves the crop vertically. `cover` scales a band this wide by its
   * WIDTH, so there is no horizontal slack to position.
   */
  position?: string;

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

  /*
    SoDEXTreasureBox — supplied by the owner, and it needs no foreground.

    The source is already composed as a banner: 2048x768, the three boxes
    arranged across it with room around them. So there is nothing to cut out and
    nothing to align — `foreground` is omitted and the band is simply the
    picture.

    Re-encoded to 1600 wide as WebP. The band never draws wider than about
    1168 CSS pixels, and checked against the real crop (cover into 1168x240)
    all three boxes survive with the concrete above and below taken off.
  */
  "0x371c4f7f68be3e558b89cc1f0fb113851c76e750": {
    background: "/heroes/treasurebox.webp",
  },

  /*
    ValueChain Genesis — a video supplied by the owner, 2026-09-25: 992x432,
    5s, H.264. The index was moved in front of the media (faststart) before it
    was committed; as supplied it sat at the end of the file.

    `genesis-loop.webp` is its 121 frames at 720px, with the last 19 (0.8s)
    crossfaded into the first 19 and the output starting at frame 19: measured,
    the step from its last frame to its first is 0.70 against 0.85 between
    ordinary neighbours, so the loop has no seam. 2.2 MB, and only fetched by a
    browser that refused the video.

    It replaced `genesis.webp`, the six-panel still, which is no longer drawn.
  */
  "0x5fadc59297e86acea20bff519aea0f9651cdc90b": {
    video: {
      src: "/heroes/genesis.mp4",
      still: "/heroes/genesis-still.webp",
      fallback: "/heroes/genesis-loop.webp",
    },
  },

  /*
    SoDex Larpers — supplied by the owner, 2026-09-23. A composed banner like
    the boxes, so no foreground.

    2056x765 PNG (2.2 MB) re-encoded to 1600 wide as WebP: 135 KB.

    CROPPED AT 10%, NOT CENTRED, and that was measured rather than chosen. The
    art is ~2.7:1 and the desktop band ~4.9:1, so the band shows about 55% of
    its height. Centred, that window is rows 133-462 of 595 — and the "SoDEX"
    half of the wordmark sits above row 133, so the band showed "LARPERS" under
    the sheared-off feet of the letters above it. At 10% the window is rows
    26-355: the whole wordmark and its crown, the helicopter, and the
    character's face. Both crops were rendered and looked at before choosing.
  */
  "0x0273df41b56e3480886fe8f0451349bec0f8edf6": {
    background: "/heroes/larpers.webp",
    position: "center 10%",
  },

  /*
    The Oracle, Hypno Plush and Orange Companions — supplied by the owner,
    2026-09-23, all ~2056x765 composed banners re-encoded to 1600 wide as WebP.

    Each crop was chosen by rendering the band at its real desktop size across
    several positions and looking at them, for the reason in the Larpers entry:
    the band shows ~55% of the picture's height, and centred it cut something
    that mattered in all three.

    The Oracle, 15%. Centred cut the bust off at the eyes — the laurel and the
    top of the head gone. 15% keeps the whole head with the wordmark sitting at
    mid-height; 5% was more sky than statue.
  */
  "0xc486e7aa1c971a61c2a9c6b8ccf671acb0ffd064": {
    background: "/heroes/the-oracle.webp",
    position: "center 15%",
  },

  /*
    Hypno Plush, 30%. Centred kept the wordmark but clipped the big bear's ears
    at the top edge; 30% has the whole head, its swirl eyes and the full
    "HYPNO PLUSH" with the spiral beside it.
  */
  "0x01c28095bfffc9973da4c4e8a34e9d5b6649c988": {
    background: "/heroes/hypno-plush.webp",
    position: "center 30%",
  },

  /*
    Orange Companions, 22%, and this one has the least room. Centred sliced
    "ORANGE" through the middle, exactly as it did the Larpers wordmark. 15%
    kept the title but dropped the characters' faces off the bottom; 30%
    clipped the top of the title again. 22% is the setting with a margin above
    the letters AND every face below them — the title and the characters are
    close to the band's full height between them, so there is not much slack
    either way.
  */
  "0xfe7b74f5dbaeea6a0ef0385f572d60083fefe0c0": {
    background: "/heroes/orange-companions.webp",
    position: "center 22%",
  },

  /*
    The Trenches — supplied by the owner, 2026-09-25: all ten depths in one
    2048x768 cut-out, Halo (#1) at the centre, on a transparent ground.

    This band is that PNG with its alpha channel dropped rather than
    flattened: the colour under the transparent pixels is a dark ground with
    each figure's glow in it, which is what a band wants. 1600 wide as WebP,
    3.0 MB to 206 KB. /trenches uses the cut-out itself, transparency kept
    (`trenches-cutout*.webp`), standing on its paper.

    Centred: the figures stand across the middle of the picture, hoods at
    roughly a third of its height, and the band's window keeps every hood.
  */
  "0xaab0dc8f2835ed903b35d2f52ff17c4bc92bec19": {
    background: "/heroes/trenches.webp",
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
