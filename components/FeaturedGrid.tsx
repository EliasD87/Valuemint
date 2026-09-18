"use client";

import Link from "next/link";
import { Art } from "@/components/Art";
import { FEATURED } from "@/config/featured";
import { tierClass } from "@/lib/tokenMetadata";

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
  return (
    <div className="grid-tokens">
      {FEATURED.map((piece, i) => {
        const href =
          piece.tokenId === undefined
            ? `/collection/${piece.collection}`
            : `/token/${piece.collection}/${piece.tokenId}`;

        return (
          <article className="tcard" key={`${piece.collection}-${piece.name}-${i}`}>
            <Link
              href={href}
              className="tcard-hit"
              aria-label={`${piece.name} — ${piece.collectionName}`}
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
              <p className="tcard-sub dim">{piece.collectionName}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
