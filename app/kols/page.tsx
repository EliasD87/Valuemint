"use client";

import Image from "next/image";
import { Art } from "@/components/Art";
import { KOLS, kolImage, xHandle } from "@/config/kols";
import "@/styles/kols.css";

/**
 * The KOL portraits.
 *
 * Given, never minted or sold — so this page is a showcase rather than a
 * storefront. There is no price, no claim button and nothing to connect a
 * wallet for; the only thing a visitor does here is look.
 *
 * The three at the top are cutouts standing in front of the letters K, O and L,
 * which is the whole reason they are separate assets from the twelve below: the
 * roster art is square and framed, and a square cannot break out of anything.
 *
 * The letters replaced three plain rounded slabs. Those slabs were a third
 * narrower than the figures standing on them, so all that showed of each was a
 * coloured sliver either side of a character — decoration that read as debris.
 * Spelling the word instead gives the shapes a job: the page now says what it
 * is at the size of the artwork, and the figures rising through the letterforms
 * is the composition rather than an accident of sizing.
 */

/**
 * The three with transparent cutouts, each paired with the letter it stands in.
 *
 * Order is not cosmetic — it spells KOL. Changing it, or dropping one on a
 * narrow screen, leaves a word that is missing a letter, which is why the
 * mobile rules below shrink the row rather than hiding its third member.
 */
const FEATURED = [
  /**
   * `shift` nudges the figure sideways within its own letter, as a fraction of
   * the figure's width. It exists because the three letterforms are not alike:
   * a figure centred on its glyph reads differently on each.
   *
   * K has arms reaching right of its stem, so centred works — the stem shows
   * one side, the arms the other. O is a closed ring and the head sits inside
   * it, which is the best of the three. L is the problem: its ink is a stem on
   * the far left and a foot along the bottom, and a centred figure covers the
   * stem completely, leaving a shape that could be anything. Pushing right
   * stands her on the foot and leaves the stem clear.
   */
  { file: "markinho", letter: "K", tint: "var(--plinth-a)", shift: "0%" },
  // Versioned filename: the artwork was replaced, and the image optimiser
  // caches by source URL — same path with different bytes serves the old cut.
  { file: "lutz-v2", letter: "O", tint: "var(--plinth-b)", shift: "0%" },
  // Replaced Takimi's figure 2026-09-26. A new filename rather than new bytes
  // under the old one, for the same reason as lutz-v2. A broad bust where hers
  // was narrow, so it has to move much further right to leave the stem clear:
  // at 16% it covered the whole stem; 48% clears it by 7px at 1440 and 4px at
  // 390, measured, where the right shoulder runs ~20px off a phone screen.
  { file: "cigar-l", letter: "L", tint: "var(--plinth-c)", shift: "48%" },
] as const;

export default function Kols() {
  return (
    <div className="kol">
      <section className="kol-hero">
        <div className="kol-deep" aria-hidden="true" />

        <div className="page kol-hero-inner">
          {/* The production status line and the "list is still open" note were
              working notes addressed at us, not at a visitor. What is left says
              what the set is and who it is for. */}
          {/*
            What the set is and when it is, on one line.

            The status was its own pill under this, which made two uppercase
            tracked labels stacked competing to be read first — and it carried
            `align-self: flex-start` inside a centred column, so it hung 466px
            off the axis everything else lines up on. Both are facts about the
            set, so they belong on the same line; this eyebrow was already an
            inline-flex with a gap, waiting for exactly this.

            Still near the top, for the reason it always was: the page
            otherwise reads as a shop, and nothing here can be acted on yet.
          */}
          <p className="kol-eyebrow">
            {/* An explicit space, or the two halves concatenate in the
                accessible name and are read as "One of oneComing soon". A
                whitespace-only text node generates no flex item, so this
                changes nothing on screen. */}
            One of one{" "}
            <span className="kol-eyebrow-rule" aria-hidden="true" />
            <span className="kol-soon">
              <span className="kol-soon-dot" aria-hidden="true" />
              Coming soon
            </span>
          </p>
          <h1 className="kol-title">The people who show up</h1>
          <p className="kol-lede">
            Portraits of the regulars on SoDEX — the ones posting through every candle. Made
            for them, given to them. Never for sale.
          </p>
        </div>

        {/* The letters carry meaning now, so the row is announced as the word it
            spells rather than hidden outright. The individual glyphs stay out of
            the accessibility tree — read one at a time they are noise — and the
            portraits remain decorative. */}
        <div className="kol-stage" role="img" aria-label="KOL">
          {FEATURED.map((f) => (
            <div
              className="kol-plinth"
              key={f.file}
              style={{ ["--tint" as string]: f.tint, ["--shift" as string]: f.shift }}
            >
              <span className="kol-letter" aria-hidden="true">
                {f.letter}
              </span>
              <Image
                className="kol-figure"
                src={`/kols/${f.file}.webp`}
                alt=""
                width={760}
                height={760}
                priority
                sizes="(max-width: 760px) 30vw, 260px"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="roster">
        <div className="page">
          <div className="kol-grid">
            {KOLS.map((k) => (
              <article className="kol-card" key={k.n}>
                <div className="kol-card-art">
                  <Art src={kolImage(k)} alt={k.name} sizes="(max-width: 700px) 45vw, 240px" />
                </div>
                <div className="kol-card-foot">
                  <b>{k.name}</b>
                  <span className="mono">#{k.n}</span>
                </div>
                {k.x === undefined ? null : (
                  <a
                    className="kol-card-x"
                    href={k.x}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${k.name} on X`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.8L18.9 2Zm-1.1 18.1h1.7L8.3 3.8H6.5l11.3 16.3Z" />
                    </svg>
                    {xHandle(k.x)}
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
