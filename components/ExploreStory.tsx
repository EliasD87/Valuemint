"use client";

import Link from "next/link";
import { useMemo, useRef, type ReactNode } from "react";
import { Art } from "@/components/Art";
import { WarmLink } from "@/components/WarmLink";
import { Soso } from "@/components/Soso";
import { TopCollections } from "@/components/TopCollections";
import { FEATURED } from "@/config/featured";
import { BAND_ART, CASCADE, WALLET_ART } from "@/config/exploreStory";
import { coverFor } from "@/config/covers";
import { formatCount, formatSoso } from "@/lib/format";
import { stillUrl } from "@/lib/media";
import type { ExploreSummary } from "@/lib/exploreTypes";
import type { CollectionSummary } from "@/hooks/useAllCollections";
import "@/styles/explore.css";

/**
 * Everything on Explore below the hero (2026-10-24 redesign).
 *
 * The 10-09 version told the site as a long gallery scroll: a second opener
 * that repeated the hero, a run of name chips, a statement set in display
 * type, a bento. It read well and said little, and it was most of the page.
 * This one is shorter and plainer: the top four collections, what is minting,
 * a run of pieces, and what the site can do. (The collection banner went
 * 2026-11-01, at the owner's request.)
 * Compact, like the token page.
 *
 * The page's rule still holds: nothing here reads the chain. Pictures are our
 * own files (config/exploreStory.ts, config/featured.ts) and figures come from
 * the index summary baked into the page. The one exception is the mint rail,
 * which shows the same collection registry the page already loaded before.
 */

type Market = ReadonlyMap<string, { floorWei?: string; listed: number }>;

export function ExploreStory({
  summary,
  collections,
}: {
  summary: ExploreSummary | undefined;
  collections: readonly CollectionSummary[];
}) {
  /**
   * Only collections the registry vouches for, once it has loaded.
   *
   * The index records every contract that ever traded through Seaport, and
   * the order book is permissionless: anyone can deploy a contract, name it
   * after a real one and wash-trade it up a ranking. The registry is what the
   * market and the collections page already trust, so the ranking does too.
   * Before it loads, the summary stands alone rather than the table waiting.
   */
  const trusted = useMemo((): ExploreSummary | undefined => {
    if (summary === undefined || collections.length === 0) return summary;
    const known = new Set(collections.map((c) => c.address.toLowerCase()));
    return { ...summary, collections: summary.collections.filter((c) => known.has(c.address.toLowerCase())) };
  }, [summary, collections]);

  const names = useMemo(
    () => new Map(collections.map((c) => [c.address.toLowerCase(), { name: c.name, symbol: c.symbol }])),
    [collections],
  );

  const market: Market = useMemo(
    () => new Map((summary?.collections ?? []).map((c) => [c.address, { floorWei: c.floorWei, listed: c.listed }])),
    [summary],
  );

  return (
    <>
      <section className="ex page">
        <SectionHead title="Top collections" href="/collections" link="All collections" />
        <TopCollections summary={trusted} names={names} />
      </section>

      <Mints collections={collections} />
      <Featured market={market} />
      <Features />
    </>
  );
}

/* ----------------------------------------------------------- section head */

function SectionHead({
  title,
  href,
  link,
  children,
}: {
  title: ReactNode;
  href?: string;
  link?: string;
  /** Extra controls on the right, before the link. */
  children?: ReactNode;
}) {
  return (
    <div className="ex-head">
      <h2 className="ex-h">{title}</h2>
      {href === undefined && children === undefined ? null : (
        <div className="ex-head-tools">
          {children}
          {href === undefined ? null : (
            <Link className="ex-more" href={href}>
              {link}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Chevron({ left = false }: { left?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d={left ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------- mints */

/** Minted as a share of the cap, 0 to 1; 0 when the cap is unknown. */
function mintedShare(minted: bigint | undefined, cap: bigint | undefined): number {
  if (minted === undefined || cap === undefined || cap === 0n) return 0;
  return Number((minted * 10_000n) / cap) / 10_000;
}

function Mints({ collections }: { collections: readonly CollectionSummary[] }) {
  const rail = useRef<HTMLDivElement>(null);

  /** Closest to selling out first, then cheapest: the one worth acting on today leads. */
  const mintable = useMemo(
    () =>
      collections
        .filter((c) => c.publicMintEnabled === true && (c.publicMintRemaining ?? 0n) > 0n)
        .sort((a, b) => {
          const d = mintedShare(b.totalSupply, b.maxSupply) - mintedShare(a.totalSupply, a.maxSupply);
          return d !== 0 ? d : Number((a.mintPrice ?? 0n) - (b.mintPrice ?? 0n));
        }),
    [collections],
  );

  /** Only once the mint settings have actually been read: before that, every collection looks closed. */
  const known = collections.some((c) => c.publicMintEnabled !== undefined);

  const scroll = (by: number) =>
    rail.current?.scrollBy({ left: by * rail.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section className="ex page">
      <SectionHead title="Minting now" href="/mint" link="All mints">
        <button type="button" className="ex-round ex-round-line" aria-label="Scroll back" onClick={() => scroll(-1)}>
          <Chevron left />
        </button>
        <button type="button" className="ex-round ex-round-line" aria-label="Scroll on" onClick={() => scroll(1)}>
          <Chevron />
        </button>
      </SectionHead>

      {known && mintable.length === 0 ? (
        <p className="ex-empty">
          Nothing is minting at the moment. Everything already minted is on the <Link href="/market">market</Link>.
        </p>
      ) : (
        <div className="ex-rail" ref={rail}>
          {!known
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="ex-mint skeleton ex-mint-wait" />)
            : mintable.map((c) => {
                const art = coverFor(c.address)?.[0];
                const share = mintedShare(c.totalSupply, c.maxSupply);
                return (
                  <WarmLink key={c.address} className="ex-mint" href={`/collection/${c.address}`}>
                    <span className="ex-mint-media">
                      {art === undefined ? null : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={stillUrl(art, 480)} alt="" loading="lazy" decoding="async" />
                      )}
                    </span>
                    <span className="ex-mint-body">
                      <b className="ex-mint-name">{c.name}</b>
                      <span className="ex-mint-price">
                        <Soso size={13}>{formatSoso(c.mintPrice)}</Soso> each
                      </span>
                      {c.maxSupply !== undefined && c.maxSupply > 0n && c.totalSupply !== undefined ? (
                        <>
                          <span className="ex-bar" aria-hidden="true">
                            <i style={{ width: `${Math.min(100, share * 100)}%` }} />
                          </span>
                          <span className="ex-mint-count">
                            {formatCount(c.totalSupply)} of {formatCount(c.maxSupply)} minted
                          </span>
                        </>
                      ) : (
                        <span className="ex-mint-count">{formatCount(c.publicMintRemaining)} left</span>
                      )}
                    </span>
                  </WarmLink>
                );
              })}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- featured */

function Featured({ market }: { market: Market }) {
  return (
    <section className="ex page">
      <SectionHead title="Featured pieces" href="/market" link="Browse the market" />

      <div className="ex-tiles">
        {FEATURED.map((piece, i) => {
          const m = market.get(piece.collection.toLowerCase());
          return (
            <WarmLink
              key={`${piece.collection}-${piece.name}-${i}`}
              className="ex-tile"
              href={`/collection/${piece.collection}`}
            >
              <span className="ex-tile-media">
                <Art src={piece.image} alt={piece.name} sizes="(max-width: 520px) 30vw, 180px" />
              </span>
              <span className="ex-tile-name">{piece.name}</span>
              <span className="ex-tile-sub">
                {m?.floorWei === undefined ? (
                  piece.collectionName
                ) : (
                  <>
                    Floor <Soso size={10}>{formatSoso(BigInt(m.floorWei), 2)}</Soso>
                  </>
                )}
              </span>
            </WarmLink>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- features */

/**
 * What the site does that a buyer would not guess, in four small cards.
 *
 * This was a bento of four very different boxes under a display headline,
 * the tallest section on the page. The point of it is the four sentences.
 */
function Features() {
  const cards: Array<{ href: string; title: string; text: string; art: string[] }> = [
    {
      href: "/market",
      title: "Bulk buy",
      text: "Pick up to ten pieces on the market and buy them with one signature.",
      art: CASCADE.slice(1, 4).map((c) => c.image),
    },
    {
      href: "/collections",
      title: "Offers that wait",
      text: "Bid on a piece, a trait or a whole collection. Your WSOSO stays in your wallet until someone accepts.",
      art: ["/featured/valuechain-genesis-luminate.webp"],
    },
    {
      href: "/portfolio",
      title: "List a whole level",
      text: "Price every Common at once, or pick exactly which pieces go up.",
      art: BAND_ART.slice(0, 3),
    },
    {
      href: "/portfolio",
      title: "Your portfolio",
      text: "Everything you hold, what it is worth at the floor, and the offers waiting on it.",
      art: WALLET_ART.slice(0, 3),
    },
  ];

  return (
    <section className="ex page">
      <SectionHead title="Built for trading" />
      <div className="ex-feats">
        {cards.map((c) => (
          <Link key={c.title} className="ex-feat" href={c.href}>
            <span className="ex-feat-art" aria-hidden="true">
              {c.art.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" loading="lazy" decoding="async" />
              ))}
            </span>
            <b className="ex-feat-title">{c.title}</b>
            <span className="ex-feat-text">{c.text}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
