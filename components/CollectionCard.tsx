"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Art } from "@/components/Art";
import { Wordmark } from "@/components/Wordmark";
import { VerifiedMark } from "@/components/VerifiedMark";
import { wordmarkFor } from "@/config/wordmarks";
import { shortAddress } from "@/lib/format";

/**
 * One collection, as a card.
 *
 * This markup existed in four places across /collections and /mint, which is
 * why every one of them showed two grey initials where the artwork should be:
 * adding art meant editing four copies. It is one component now.
 *
 * The pieces are the point, so they lead. A collection with nothing minted
 * still gets a cover - its initials, set large and faint - so a grid of cards
 * keeps one rhythm instead of some being short and some tall.
 */

export interface CollectionStat {
  label: string;
  value: ReactNode;
}

interface Props {
  href: string;
  name: string;
  symbol?: string;
  address: `0x${string}`;
  /** Up to four pieces from this collection, already resolved to URLs. */
  images: string[];
  badge?: ReactNode;
  stats: CollectionStat[];
}

export function CollectionCard({ href, name, symbol, address, images, badge, stats }: Props) {
  const initials = (symbol || name || "?").slice(0, 2).toUpperCase();

  /**
   * `wordmarkFor`, not `wordmarkSaying`: this really is the collection's name,
   * so the drawing of that name always says the same thing. The narrower check
   * is only for a PIECE's name — see the note in `config/wordmarks.ts`.
   */
  const mark = wordmarkFor(address);

  /**
   * Every card gets the same strip, whatever the collection holds.
   *
   * A collection can be one picture in many editions - SoDex Larpers is a single
   * design with a hundred - and a card that draws one full-bleed image next to
   * cards drawing three looks like two different components. Repeating the one
   * image across the strip costs nothing (the browser fetches it once) and makes
   * the row read as one grid.
   *
   * Three, not four: three panels are wide enough to show what a piece is at
   * card size, and four in the same band start to read as thumbnails.
   */
  const STRIP = 3;
  const unique = images.slice(0, STRIP);
  const art =
    unique.length === 0
      ? []
      : Array.from({ length: STRIP }, (_, i) => unique[i % unique.length]!);

  return (
    <Link
      href={href}
      className="coll-card card card-hover"
    >
      <div className="coll-cover" data-empty={art.length === 0 ? "" : undefined}>
        {art.length > 0 ? (
          art.map((src, i) => (
            // Decorative: the collection is named right below, so announcing
            // each thumbnail would only repeat it.
            <span className="coll-cover-cell" key={`${src}-${i}`} aria-hidden="true">
              <Art
                src={src}
                sizes="(max-width: 700px) 32vw, 160px"
                /*
                  The cover moves too. This mosaic is the first Cybereator
                  anybody meets — it is what the owner photographed and sent
                  back saying the GIF was not playing — and the three cells of
                  a collection like that are the same file, so all three
                  animate off one download.
                */
                motion
              />
            </span>
          ))
        ) : (
          <span className="coll-cover-empty" aria-hidden="true">
            {initials}
          </span>
        )}
      </div>

      <div className="coll-card-body">
        <div className="coll-card-head">
          <div className="coll-card-name">
            {/* Inside the `<b>`, not instead of it: this row is a flex COLUMN,
                which would either stretch a bare mark across the card or, with
                the `align-self` Wordmark.css carries, centre it over the symbol
                below. The `<b>` also gives it the font-size its `em` sizing
                reads. */}
            {/*
              The mark rides inside the `<b>` with the name, not beside it in
              the column. As a sibling it would be a row of its own under the
              name — the container is a flex COLUMN — and would end up between
              the name and the symbol.
            */}
            <b className="coll-card-title">
              {mark === undefined ? name : <Wordmark mark={mark} name={name} />}
              <VerifiedMark collection={address} size={14} />
            </b>
            <span className="mono dim">{symbol || shortAddress(address, 4)}</span>
          </div>
          {badge}
        </div>

        <dl className="coll-card-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd className="mono">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Link>
  );
}

export function CollectionCardSkeleton() {
  return (
    <div className="coll-card card" aria-hidden="true">
      <div className="coll-cover">
        <div className="skeleton coll-cover-skeleton" />
      </div>
      <div className="coll-card-body">
        <div className="skeleton" style={{ height: "1.1rem", width: "55%" }} />
        <div className="skeleton" style={{ height: "2.2rem" }} />
      </div>
    </div>
  );
}
