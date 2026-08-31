"use client";

import Image from "next/image";
import { Art } from "@/components/Art";
import { KOLS, kolImage } from "@/config/kols";
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
  { file: "takimi", letter: "L", tint: "var(--plinth-c)", shift: "16%" },
] as const;

export default function Kols() {
  return (
    <div className="kol">
      <section className="kol-hero">
        <div className="kol-deep" aria-hidden="true" />

        <div className="page kol-hero-inner">
          <p className="kol-eyebrow">
            <span className="kol-flag">Not minted yet</span>
            One of one
          </p>
          <h1 className="kol-title">The people who show up</h1>
          <p className="kol-lede">
            Portraits of the regulars on SoDEX — the ones posting through every candle. Made
            for them, given to them. Never for sale.
          </p>
          {/* Replaces a bare "coming soon", which sets an expectation of a date
              that does not exist. This says what the state actually is and why. */}
          <p className="kol-note">
            The list is still open. Nothing is written to the chain until it stops
            growing, so anyone worth adding can still be added.
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
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
