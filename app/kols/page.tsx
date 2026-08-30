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
 * The three at the top are cutouts standing in front of their plinths, which is
 * the whole reason they are separate assets from the twelve below: the roster
 * art is square and framed, and a square cannot break out of anything.
 */

/** The three with transparent cutouts, in the order they read best together. */
const FEATURED = [
  { file: "markinho", tint: "var(--plinth-a)" },
  // Versioned filename: the artwork was replaced, and the image optimiser
  // caches by source URL — same path with different bytes serves the old cut.
  { file: "lutz-v2", tint: "var(--plinth-b)" },
  { file: "takimi", tint: "var(--plinth-c)" },
] as const;

export default function Kols() {
  return (
    <div className="kol">
      <section className="kol-hero">
        <div className="kol-deep" aria-hidden="true" />

        <div className="page kol-hero-inner">
          <p className="kol-eyebrow">
            <span className="kol-flag">Coming soon</span>
            One of one
          </p>
          <h1 className="kol-title">The people who show up</h1>
          <p className="kol-lede">
            Portraits of the regulars on SoDEX — the ones posting through every candle. Made
            for them, given to them. Never minted, never for sale.
          </p>
        </div>

        <div className="kol-stage" aria-hidden="true">
          {FEATURED.map((f) => (
            <div className="kol-plinth" key={f.file} style={{ ["--tint" as string]: f.tint }}>
              <div className="kol-plinth-face" />
              <Image
                className="kol-figure"
                src={`/kols/${f.file}.webp`}
                alt=""
                width={760}
                height={760}
                priority
                sizes="(max-width: 760px) 44vw, 320px"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="roster">
        <div className="page">
          <div className="kol-roster-head">
            <h2>The roster</h2>
            <p>
              {KOLS.length} so far, and not minted yet — the list is still growing, and it is
              worth waiting until it stops before anything is written to the chain. It grows
              whenever someone worth adding turns up; this is not a closed set.
            </p>
          </div>

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
