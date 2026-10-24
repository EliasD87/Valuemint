"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Art } from "@/components/Art";
import { Soso } from "@/components/Soso";
import { Wordmark } from "@/components/Wordmark";
import { TopCollections } from "@/components/TopCollections";
import { wordmarkFor } from "@/config/wordmarks";
import { FEATURED } from "@/config/featured";
import { BAND_ART, CASCADE, SPOTLIGHT, WALLET_ART } from "@/config/exploreStory";
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
 * This one is shorter and plainer: the top four collections, a collection
 * banner, what is minting, a run of pieces, and what the site can do.
 * Compact, like the token page.
 *
 * The page's rule still holds: nothing here reads the chain. Pictures are our
 * own files (config/exploreStory.ts, config/featured.ts) and figures come from
 * the index summary baked into the page. The one exception is the mint rail,
 * which shows the same collection registry the page already loaded before.
 */

type Market = ReadonlyMap<string, { floorWei?: string; listed: number }>;

const vars = (v: Record<string, string | number>) => v as CSSProperties;

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

      <Spotlight market={market} />
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

/* ------------------------------------------------------------- spotlight */

/** How long each collection holds the banner before the next slides in. */
const SPOTLIGHT_MS = 1500;

/** The slide itself; must match `.ex-banner-track`'s transition in explore.css. */
const SLIDE_MS = 650;

/** Whether the visitor has asked for less motion. Off until known, so nothing moves on a guess. */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduce;
}

/**
 * Four collections on a track that slides sideways on its own, forever in one
 * direction (2026-10-09).
 *
 * A loop, not a rewind: a copy of the first slide waits after the last. The
 * track slides onto it, and once it has arrived the track jumps back to the
 * real first slide with no animation, which looks identical. Stepping back
 * from the first slide does the same in reverse.
 *
 * It pauses while a pointer is over it. Keyboard focus inside it also holds it
 * still, only when the focus came from the keyboard, so a mouse click on an
 * arrow does not leave it paused. It never moves for anyone who asks for
 * reduced motion, and it does not tick while the tab is hidden.
 *
 * A slide carries the same layers as its collection page's header: the
 * picture, then any cut-out standing on it, and the collection's own wordmark
 * where it has one.
 */
function Spotlight({ market }: { market: Market }) {
  const count = SPOTLIGHT.length;
  /** The track's position: 0..count, where `count` is the copy of the first slide. */
  const [pos, setPos] = useState(0);
  /** True for the one frame the track jumps instead of sliding. */
  const [instant, setInstant] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const reduce = useReducedMotion();
  const playing = !hovered && !keyboard && !reduce;
  const at = pos % count;

  /* Restarted on every move, so a click resets the clock rather than racing it. */
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setPos((p) => Math.min(p + 1, count));
    }, SPOTLIGHT_MS);
    return () => window.clearInterval(id);
  }, [playing, pos, count]);

  /* Landed on the copy of the first slide: jump to the real one once the slide has finished. */
  useEffect(() => {
    if (pos !== count) return;
    const id = window.setTimeout(() => {
      setInstant(true);
      setPos(0);
    }, SLIDE_MS + 40);
    return () => window.clearTimeout(id);
  }, [pos, count]);

  /* Sliding comes back on once the jump has been painted. */
  useEffect(() => {
    if (!instant) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setInstant(false));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [instant]);

  const next = () => setPos((p) => Math.min(p + 1, count));
  const prev = () => {
    if (pos > 0) {
      setPos(pos - 1);
      return;
    }
    /* From the first slide: jump to its copy at the end, then slide back onto the last. */
    setInstant(true);
    setPos(count);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setInstant(false);
        setPos(count - 1);
      }),
    );
  };

  const slides = [...SPOTLIGHT, SPOTLIGHT[0]!];

  return (
    <section className="ex page">
      <div
        className="ex-banner"
        role="region"
        aria-roledescription="carousel"
        aria-label="Collection spotlight"
        data-playing={playing ? "" : undefined}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={(e) => {
          if (e.target.matches(":focus-visible")) setKeyboard(true);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboard(false);
        }}
      >
        <div
          className="ex-banner-track"
          style={vars({ "--at": pos })}
          data-instant={instant ? "" : undefined}
          aria-live={playing ? "off" : "polite"}
        >
          {slides.map((slide, i) => {
            const m = market.get(slide.address);
            const mark = wordmarkFor(slide.address);
            const copy = i === count;
            const shown = i === pos;
            return (
              <div
                key={`${slide.address}-${i}`}
                className="ex-slide"
                role={copy ? undefined : "group"}
                aria-roledescription={copy ? undefined : "slide"}
                aria-label={copy ? undefined : `${i + 1} of ${count}: ${slide.name}`}
                aria-hidden={copy || !shown}
                inert={copy || !shown}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="ex-banner-img"
                  src={slide.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={slide.focus === undefined ? undefined : { objectPosition: slide.focus }}
                />
                <div className="ex-banner-shade" aria-hidden="true" />
                {slide.foreground === undefined ? null : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="ex-banner-fg"
                    src={slide.foreground}
                    alt={slide.foregroundAlt ?? ""}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <div className="ex-banner-body">
                  <h3 className="ex-banner-name">
                    {mark === undefined ? slide.name : <Wordmark mark={mark} name={slide.name} on="art" />}
                  </h3>
                  {m === undefined ? null : (
                    <p className="ex-banner-meta">
                      {m.floorWei === undefined ? null : (
                        <>
                          Floor <b>{formatSoso(BigInt(m.floorWei), 2)} SOSO</b>
                          {" · "}
                        </>
                      )}
                      <b>{formatCount(BigInt(m.listed))}</b> for sale
                    </p>
                  )}
                  <Link className="btn btn-sm ex-banner-btn" href={`/collection/${slide.address}`}>
                    Open collection
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Which slide, and while it plays, how long until the next one. */}
        <div className="ex-banner-dots">
          {SPOTLIGHT.map((slide, i) => (
            <button
              key={slide.address}
              type="button"
              className={i === at ? "ex-dot is-on" : "ex-dot"}
              aria-label={`Show ${slide.name}`}
              aria-current={i === at ? "true" : undefined}
              onClick={() => setPos(i)}
            >
              <span>
                <i key={i === at ? `on-${pos}` : "off"} style={vars({ "--dur": `${SPOTLIGHT_MS}ms` })} />
              </span>
            </button>
          ))}
        </div>

        <div className="ex-banner-nav">
          <button type="button" className="ex-round" aria-label="Previous collection" onClick={prev}>
            <Chevron left />
          </button>
          <button type="button" className="ex-round" aria-label="Next collection" onClick={next}>
            <Chevron />
          </button>
        </div>
      </div>
    </section>
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
                  <Link key={c.address} className="ex-mint" href={`/collection/${c.address}`} prefetch={false}>
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
                  </Link>
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
            <Link
              key={`${piece.collection}-${piece.name}-${i}`}
              className="ex-tile"
              href={`/collection/${piece.collection}`}
              prefetch={false}
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
            </Link>
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
