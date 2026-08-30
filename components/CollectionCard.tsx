"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Art } from "@/components/Art";
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
  const art = images.slice(0, 4);

  /**
   * One design gets the whole card; several get the strip.
   *
   * A collection can be a single picture in many editions, and that picture in a
   * 116px-tall band was cropped to a slice — the screenshot that prompted this
   * had the character's head cut off. Four thumbnails need the band because they
   * share it; one does not, and letting it fill the card shows the art as it was
   * drawn rather than as it fits.
   *
   * The text then sits over the image on a gradient, which is why `is-solo` also
   * changes what the body is drawn against.
   */
  const solo = art.length === 1;

  return (
    <Link
      href={href}
      className={`coll-card card card-hover${solo ? " is-solo" : ""}`}
    >
      <div className="coll-cover" data-empty={art.length === 0 ? "" : undefined}>
        {art.length > 0 ? (
          art.map((src, i) => (
            // Decorative: the collection is named right below, so announcing
            // each thumbnail would only repeat it.
            <span className="coll-cover-cell" key={`${src}-${i}`} aria-hidden="true">
              <Art
                src={src}
                sizes={solo ? "(max-width: 700px) 92vw, 380px" : "(max-width: 700px) 25vw, 160px"}
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
            <b>{name}</b>
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
