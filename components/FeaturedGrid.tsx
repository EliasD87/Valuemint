"use client";

import Link from "next/link";
import { useState } from "react";
import { Art } from "@/components/Art";
import { SodexLogo } from "@/components/SodexLogo";
import { FEATURED, PINNED_COLLECTIONS } from "@/config/featured";
import { tierClass } from "@/lib/tokenMetadata";
import { WarmCollection } from "@/components/WarmChain";
/**
 * The card styles, imported HERE and not only by `TokenCard`.
 *
 * This grid borrows `TokenCard`'s markup without rendering a `TokenCard`, and
 * the front page no longer renders one at all — so nothing was pulling this
 * stylesheet into the route. The result was not a slightly plain card: with
 * `.tcard-media` unstyled it has no `position: relative`, so `<Image fill>`
 * positioned itself against the viewport and one piece of artwork covered the
 * entire page. Exactly the failure `Art.tsx` warns about at its top.
 */
import "@/components/TokenCard.css";
import "./FeaturedGrid.css";

/**
 * The front page's grid, drawn from a list rather than from the chain.
 *
 * Everything a card needs — the picture, the name, where it goes — is in
 * `config/featured.ts`, so this renders on the first paint with no RPC call, no
 * metadata fetch and nothing to wait for. Measured before, the front page could
 * not so much as *request* its first image until 4,240 ms, because five network
 * round trips had to happen in order first: collections, supply, ids, tokenURI,
 * metadata.
 *
 * Nothing here reads a price, and that is the point. A price is a second
 * question with a second answer time, and the page should not hold a picture
 * hostage to it — the live hooks elsewhere on the page settle prices in
 * afterwards without moving anything that has already been drawn.
 *
 * Cards open the COLLECTION, not the token, unless the entry names a token.
 * Somebody clicking a picture on the front page is asking "what is this and
 * what else is there", and a collection answers both.
 */
export function FeaturedGrid() {
  /**
   * The collection somebody looks like opening, read ahead of them.
   *
   * A pointer resting on a card, or a finger touching one, is the best signal
   * available that it is about to be clicked — and at that moment reading that
   * ONE collection is cheap and nearly always useful.
   *
   * This replaced warming a fixed list on arrival, which measured twenty RPC
   * requests over 11.6 seconds on the live home page, peaking at seven at once,
   * paid by everybody including the people who only scrolled. Now nobody pays
   * for a collection they never looked at.
   *
   * It holds ONE at a time on purpose. Moving across the grid should not leave
   * a trail of twelve collections being read at once, which would be the old
   * problem with extra steps — and the caches are permanent, so a collection
   * already read stays read after the pointer moves on.
   */
  const [warming, setWarming] = useState<`0x${string}` | undefined>(undefined);

  return (
    <div className="grid-tokens">
      {/* Renders nothing; it only issues the reads the next page will want. */}
      {warming === undefined ? null : <WarmCollection address={warming} />}

      {FEATURED.map((piece, i) => {
        const href =
          piece.tokenId === undefined
            ? `/collection/${piece.collection}`
            : `/token/${piece.collection}/${piece.tokenId}`;

        const warmThis =
          piece.tokenId === undefined ? () => setWarming(piece.collection) : undefined;

        /**
         * The two collections this marketplace is about, given a moving ring.
         *
         * Read from `PINNED_COLLECTIONS` rather than counted by position, so it
         * is the same named list that already leads /collections and the home
         * rail. Reordering the featured pieces cannot light the wrong card, and
         * there is one place to change which two are the headline.
         */
        const lit = PINNED_COLLECTIONS.some(
          (p) => p.toLowerCase() === piece.collection.toLowerCase(),
        );

        return (
          <article
            className={`tcard${lit ? " tcard-lit" : ""}`}
            key={`${piece.collection}-${piece.name}-${i}`}
          >
            <Link
              href={href}
              className="tcard-hit"
              aria-label={`${piece.name} — ${piece.collectionName}`}
              /*
                Three ways in, because a phone has no pointer and a keyboard has
                no touch: hover, first touch, and focus. All three mean the same
                thing here — this one, next.

                Only for a card that opens a COLLECTION. A card naming a token
                goes to that token's page, which wants that one piece and the
                order book (already warm) — not this collection's sixty ids and
                sixty URIs, which would be spent on nothing.
              */
              onPointerEnter={warmThis}
              onTouchStart={warmThis}
              onFocus={warmThis}
              /**
               * Next fetches the destination's code as this scrolls into view,
               * so the click itself has nothing to download. The destination's
               * chain data is warmed separately — see `useWarmChain`.
               */
              prefetch
            />

            <div className="tcard-media">
              <Art
                src={piece.image}
                alt={piece.name}
                sizes="(max-width: 560px) 50vw, (max-width: 1100px) 33vw, 260px"
                /**
                 * The first row is eager; the rest load as they are reached.
                 * These are the first images on the site, so the top of the
                 * grid should not wait on an intersection callback.
                 */
                priority={i < 4}
                /** Only where the artwork actually moves. See `FeaturedPiece`. */
                motion={piece.motion === true}
              />

              <div className="tcard-badges">
                {piece.note === undefined ? (
                  <span />
                ) : (
                  <span className={`chip chip-${tierClass(piece.note) ?? "accent"}`}>
                    {piece.note}
                  </span>
                )}
              </div>
            </div>

            <div className="tcard-body">
              <div className="tcard-head">
                <span className="tcard-title">{piece.name}</span>
                {piece.tokenId === undefined ? null : (
                  <span className="tcard-num">#{piece.tokenId}</span>
                )}
              </div>
              {/*
                Not when it would say the same thing twice. A card standing for
                its whole collection is named after it, and "SoDEX Treasure
                Box" over "SoDEX Treasure Box" reads as a rendering fault.
              */}
              {piece.collectionName === piece.name ? null : (
                <p className="tcard-sub dim">{piece.collectionName}</p>
              )}

              {/*
                Whose collection it is, in their own mark.
                
                The inlined `SodexLogo` rather than the hero's `/brand/*.svg`
                file, because this sits on the card BODY — which is `--surface`
                and flips with the theme — where the hero's sits on artwork
                that is always dark. The inline one reproduces both official
                colour pairs through tokens, so it is correct in either.
                
                Decorative: no `title`, so it is `aria-hidden`. The collection
                is already named in the link's own label a few lines up, and a
                screen reader announcing "SoDEX" twice helps nobody.
              */}
              {piece.brand === "sodex" ? (
                <SodexLogo className="tcard-brand" />
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
