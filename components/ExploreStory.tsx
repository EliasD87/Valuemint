"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Art } from "@/components/Art";
import { Soso } from "@/components/Soso";
import { Wordmark } from "@/components/Wordmark";
import { wordmarkFor } from "@/config/wordmarks";
import { FEATURED } from "@/config/featured";
import { AMONG, BAND_ART, CASCADE, SPOTLIGHT } from "@/config/exploreStory";
import { coverFor } from "@/config/covers";
import { CREATE_ENABLED } from "@/config/features";
import { formatCount, formatSoso } from "@/lib/format";
import { stillUrl } from "@/lib/media";
import type { ExploreSummary } from "@/lib/exploreTypes";
import type { CollectionSummary } from "@/hooks/useAllCollections";
import "@/styles/explore.css";

/**
 * Everything on Explore below the hero, told as one scroll (2026-10-09).
 *
 * Laid out after a gallery-marketplace reference the owner chose: a split
 * opener, a wide spotlight, a run of collection names, a statement that inks
 * in as it is read, a featured panel, a crowd of pieces, a bento of what the
 * site does, the mints, a moving band and two closing cards.
 *
 * The page's rule still holds: nothing here reads the chain. Pictures are our
 * own files (config/exploreStory.ts, config/featured.ts) and figures come from
 * the index summary baked into the page. The one exception is the mint rail,
 * which shows the same collection registry the page already loaded before.
 *
 * Motion is decoration only. Every word and picture is visible at rest, the
 * scroll-linked inking is a progressive enhancement, and all of it stops for
 * anyone who asks for reduced motion.
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
  const market: Market = useMemo(
    () => new Map((summary?.collections ?? []).map((c) => [c.address, { floorWei: c.floorWei, listed: c.listed }])),
    [summary],
  );

  return (
    <>
      <Intro forSale={summary?.totals.forSale} />
      <Spotlight market={market} />
      <Marquee summary={summary} collections={collections} />
      <Statement />
      <Featured market={market} />
      <Among traders={summary?.totals.traders} forSale={summary?.totals.forSale} />
      <Bento />
      <Mints collections={collections} />
      <Band />
      <Closing />
    </>
  );
}

/* ---------------------------------------------------------------- opener */

function Intro({ forSale }: { forSale: number | undefined }) {
  return (
    <section className="ex page ex-intro">
      <div className="ex-intro-copy">
        <h2 className="ex-h">
          Buy, sell and bid on <span className="ex-mute">everything minted on</span> ValueChain.
        </h2>
        <p className="ex-lede">
          No custodian and no waiting. Your pieces and your SOSO stay in your wallet until the moment a trade settles.
        </p>
        <div className="ex-actions">
          <Link className="btn btn-primary" href="/market">
            Trade NFTs
          </Link>
          <Link className="btn" href="/collections">
            Browse collections
          </Link>
        </div>
      </div>

      {/*
        Each card is its collection's door. Hovered or focused, it lifts,
        straightens and comes to the front while the cards either side step
        aside (explore.css); on a touch screen a tap simply opens it.
      */}
      <div className="ex-cascade">
        {CASCADE.map((card, i) => (
          <Link
            key={card.image}
            className="ex-cascade-card"
            style={vars({ "--i": i })}
            href={`/collection/${card.collection}`}
            aria-label={card.name}
            prefetch={false}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.image} alt="" width={320} height={320} loading="lazy" decoding="async" />
            <span className="ex-cascade-name" aria-hidden="true">
              {card.name}
            </span>
          </Link>
        ))}
        <span className="ex-tag ex-tag-blue ex-cascade-tag-a" aria-hidden="true">
          @treasurebox
        </span>
        <span className="ex-tag ex-tag-dark ex-cascade-tag-b" aria-hidden="true">
          {forSale === undefined ? "@cybereator" : `${formatCount(BigInt(forSale))} for sale now`}
        </span>
      </div>
    </section>
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
      <div className="ex-head">
        <div>
          <h2 className="ex-h">
            Gateway to <span className="ex-mute">the collections</span> people are trading.
          </h2>
        </div>
      </div>

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

/* --------------------------------------------------------------- marquee */

function Marquee({
  summary,
  collections,
}: {
  summary: ExploreSummary | undefined;
  collections: readonly CollectionSummary[];
}) {
  /* Names from the summary first, which is there on first paint; the registry fills in. */
  const items = useMemo(() => {
    const out = new Map<string, { address: string; name: string; art: string }>();
    const add = (address: string, name: string | undefined) => {
      const key = address.toLowerCase();
      const art = coverFor(key)?.[0];
      if (name === undefined || art === undefined || out.has(key)) return;
      out.set(key, { address: key, name, art: stillUrl(art, 96) });
    };
    for (const c of summary?.collections ?? []) add(c.address, c.name);
    for (const c of collections) add(c.address, c.name);
    return [...out.values()];
  }, [summary, collections]);

  if (items.length < 3) return null;

  const group = (hidden: boolean) => (
    <div className="ex-marquee-group" aria-hidden={hidden || undefined}>
      {items.map((c) => (
        <Link
          key={c.address}
          className="ex-chip"
          href={`/collection/${c.address}`}
          tabIndex={hidden ? -1 : undefined}
          prefetch={false}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.art} alt="" width={28} height={28} loading="lazy" decoding="async" />
          {c.name}
        </Link>
      ))}
    </div>
  );

  return (
    <section className="ex page ex-trust">
      <p className="ex-trust-title">
        Home to <span className="ex-mute">every collection on ValueChain.</span>
      </p>
      <div className="ex-marquee" style={vars({ "--ex-dur": `${items.length * 5}s` })}>
        <div className="ex-marquee-track">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- statement */

type Part = string | { img: string };

const STATEMENT: Part[] = [
  ..."Whether you're a collector chasing a floor".split(" "),
  { img: "/boxes/sobox/rare.webp" },
  ..."or a holder ready to sell,".split(" "),
  { img: "/boxes/cybereator.webp" },
  ..."every trade settles on ValueChain in seconds".split(" "),
  { img: "/featured/valuechain-genesis-obsidian.webp" },
  ..."for a fraction of a cent.".split(" "),
];

function Statement() {
  return (
    <section className="ex page ex-statement">
      <span className="ex-tag ex-tag-blue ex-statement-tag-a" aria-hidden="true">
        @collector
      </span>
      <span className="ex-tag ex-tag-accent ex-statement-tag-b" aria-hidden="true">
        @holder
      </span>
      <p className="ex-statement-text">
        {STATEMENT.map((part, i) =>
          typeof part === "string" ? (
            <span key={i} className="ex-w">
              {part}{" "}
            </span>
          ) : (
            <span key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ex-inline" src={part.img} alt="" loading="lazy" decoding="async" />{" "}
            </span>
          ),
        )}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------- featured */

function Featured({ market }: { market: Market }) {
  return (
    <section className="ex page ex-feature">
      <div className="ex-feature-copy">
        <h2 className="ex-h">
          Fresh from <span className="ex-mute">every collection.</span>
        </h2>
        <p className="ex-lede">
          Twelve pieces we keep coming back to, from the boxes to the plushies. Each one opens its collection, floor and
          all.
        </p>
        <Link className="btn ex-link" href="/market">
          Browse the market
        </Link>
      </div>

      <div className="ex-panel">
        <div className="ex-panel-bar">
          <b>Featured</b>
          <span>{FEATURED.length} picks</span>
        </div>
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
                  <Art src={piece.image} alt={piece.name} sizes="(max-width: 520px) 30vw, 140px" />
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
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- crowd */

function Among({ traders, forSale }: { traders: number | undefined; forSale: number | undefined }) {
  const row = (srcs: string[], where: string) => (
    <div className={`ex-among-row ${where}`} aria-hidden="true">
      {srcs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          className="ex-among-thumb"
          style={vars({ "--i": i })}
          src={src}
          alt=""
          width={68}
          height={68}
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  );

  return (
    <section className="ex ex-among">
      {row(AMONG.above, "ex-among-above")}
      <div className="ex-among-copy page">
        <h2 className="ex-h">
          You&rsquo;ll find yourself <span className="ex-mute">among us.</span>
        </h2>
        <p className="ex-lede">
          {traders === undefined || forSale === undefined
            ? "Collectors and holders from all over ValueChain buy, sell and bid here every day."
            : `${formatCount(BigInt(traders))} collectors have bought or sold here, and ${formatCount(BigInt(forSale))} pieces are for sale right now.`}
        </p>
        <Link className="btn btn-primary" href="/market">
          Start collecting
        </Link>
      </div>
      {row(AMONG.below, "ex-among-below")}
    </section>
  );
}

/* ---------------------------------------------------------------- bento */

function Bento() {
  return (
    <section className="ex page">
      <div className="ex-head ex-head-center">
        <div>
          <h2 className="ex-h">
            Every trade <span className="ex-mute">tells a story.</span>
          </h2>
        </div>
      </div>

      <div className="ex-bento">
        <Link className="ex-cell ex-cell-a" href="/market">
          <span className="ex-stack" aria-hidden="true">
            {BAND_ART.slice(0, 3).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" style={vars({ "--i": i })} loading="lazy" decoding="async" />
            ))}
          </span>
          <h3>Bulk buy</h3>
          <p>Pick up to ten pieces on the market and buy them all with one signature.</p>
          <span className="ex-cell-link">Go to the market</span>
        </Link>

        <Link className="ex-cell ex-cell-b" href="/collections">
          <div className="ex-cell-copy">
            <h3>Offers that wait for you</h3>
            <p>
              Bid on one piece, a trait, or a whole collection. Your WSOSO stays in your wallet until somebody
              accepts.
            </p>
            <span className="ex-cell-link">Find something to bid on</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/featured/valuechain-genesis-luminate.webp" alt="" loading="lazy" decoding="async" />
        </Link>

        <Link className="ex-cell ex-cell-c" href="/portfolio">
          <span className="ex-strip" aria-hidden="true">
            {BAND_ART.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" loading="lazy" decoding="async" />
            ))}
          </span>
          <h3>List a whole level at once</h3>
          <p>Price every Common together in one go, or choose exactly which pieces go up.</p>
          <span className="ex-cell-link">Open your portfolio</span>
        </Link>

        <Link className="ex-cell ex-cell-dark" href="/portfolio">
          <span className="ex-wallet" aria-hidden="true">
            {AMONG.above.slice(0, 4).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" loading="lazy" decoding="async" />
            ))}
          </span>
          <h3>Your portfolio</h3>
          <p>Every piece you hold, what it fetches at the floor, and the offers already waiting on it.</p>
          <span className="ex-cell-link">See what you hold</span>
        </Link>
      </div>
    </section>
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
      <div className="ex-head">
        <div>
          <h2 className="ex-h">
            Mint <span className="ex-mute">before it&rsquo;s gone.</span>
          </h2>
        </div>
        <div className="ex-head-tools">
          <Link className="btn btn-sm ex-pill" href="/mint">
            All mints
          </Link>
          <button type="button" className="ex-round ex-round-line" aria-label="Scroll back" onClick={() => scroll(-1)}>
            <Chevron left />
          </button>
          <button type="button" className="ex-round ex-round-line" aria-label="Scroll on" onClick={() => scroll(1)}>
            <Chevron />
          </button>
        </div>
      </div>

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

/* ----------------------------------------------------------------- band */

const BAND_WORDS = ["Collect", "Trade", "Bid", "Mint", "Hold"];

function Band() {
  const group = (hidden: boolean) => (
    <div className="ex-band-group" aria-hidden={hidden || undefined}>
      {BAND_WORDS.map((word, i) => (
        <span key={word} className="ex-band-item">
          <span className="ex-band-word">{word}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ex-band-art" src={BAND_ART[i % BAND_ART.length]} alt="" loading="lazy" decoding="async" />
        </span>
      ))}
    </div>
  );

  return (
    <section className="ex-band-wrap" aria-label="Collect, trade, bid, mint and hold on ValueChain">
      <div className="ex-band">
        <div className="ex-band-track">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- closing */

function Closing() {
  return (
    <section className="ex page ex-closing">
      <Link className="ex-close" href="/trenches">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/heroes/trenches-cover.webp" alt="" loading="lazy" decoding="async" />
        <div className="ex-close-body">
          <h3>The Trenches</h3>
          <p>A free NFT for SoDEX traders. How much you have traded sets your tier.</p>
          <span className="btn btn-sm ex-close-btn">Check yours</span>
        </div>
      </Link>

      {CREATE_ENABLED ? (
        <Link className="ex-close" href="/create">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/heroes/larpers.webp" alt="" loading="lazy" decoding="async" style={{ objectPosition: "100% 50%" }} />
          <div className="ex-close-body">
            <h3>Publish your own collection</h3>
            <p>Deploy a real ERC-721 to ValueChain in one transaction. You set the supply and the price.</p>
            <span className="btn btn-sm ex-close-btn">Start creating</span>
          </div>
        </Link>
      ) : (
        <Link className="ex-close" href="/collections">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/heroes/larpers.webp" alt="" loading="lazy" decoding="async" style={{ objectPosition: "100% 50%" }} />
          <div className="ex-close-body">
            <h3>Every collection, one place</h3>
            <p>From SoDEX&rsquo;s boxes to community art, everything minted on ValueChain is here to browse.</p>
            <span className="btn btn-sm ex-close-btn">Browse collections</span>
          </div>
        </Link>
      )}
    </section>
  );
}
