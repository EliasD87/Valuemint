"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAllCollections } from "@/hooks/useAllCollections";
import { Art } from "@/components/Art";
import { WarmChain } from "@/components/WarmChain";
import { ListPrompt } from "@/components/ListPrompt";
import "@/styles/home.css";
import "@/styles/hero.css";
import { HERO_DECK } from "@/config/heroDeck";
import { Wordmark } from "@/components/Wordmark";
import { wordmarkFor } from "@/config/wordmarks";
import { CREATE_ENABLED } from "@/config/features";
import { heroCopy } from "@/config/heroCopy";
import { useExploreSummary } from "@/hooks/useExploreSummary";
import { ExploreStory } from "@/components/ExploreStory";
import type { ExploreSummary } from "@/lib/exploreTypes";

/** "all", "listed", or a collection address. */

/**
 * Round-robin across groups.
 *
 * Sampling walks one collection at a time, so a plain concatenation puts every
 * piece from the first collection before any from the second - and the featured
 * grid becomes a single collection's gallery. Taking one from each in turn is
 * what makes the front page look like a marketplace.
 */

function interleave<T>(groups: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; ; i++) {
    let added = false;
    for (const g of groups) {
      const item = g[i];
      if (item !== undefined) {
        out.push(item);
        added = true;
      }
    }
    if (!added) return out;
  }
}

export function Explore({ summary: baked }: { summary: ExploreSummary | undefined }) {
  const { address } = useAccount();
  /**
   * Collections only. No tokens.
   *
   * This was `useEverything(12)`, which walked twelve tokens of every
   * collection — supply, then `tokenByIndex`, then `ownerOf` and `tokenURI`,
   * then a metadata document each — about 216 contract calls and 108 documents,
   * to fill a grid of twenty. The grid is `config/featured.ts` now, so none of
   * that is needed; the rails below only ever wanted the collections.
   */
  const { collections, isLoading } = useAllCollections();

  /**
   * The market's figures, baked into the page on the server (app/page.tsx).
   *
   * They replace the listing feed this page used to read only to rank the
   * collection rail, which meant walking the order book and its fill checks on
   * the chain. The rail is a table of index figures now, and nothing on this
   * page reads the order book.
   */
  const summary = useExploreSummary(baked);






  /**
   * The hero deck is a bundled snapshot, not a query. See config/heroDeck.ts
   * for the measurement that prompted it - 11.7 seconds to first image, from a
   * page whose DOM was ready in 251ms.
   */
  const deck = HERO_DECK;





  return (
    <>
      {/* Nothing renders; it fills the shared caches a moment after paint so
          that clicking into a collection finds the order book already read.
          Measured: with that scan warm, a collection page reached its first
          image at 2,177 ms instead of 4,669 ms. */}
      <WarmChain />

      {/*
        Beside `WarmChain` for the same reason: it renders nothing until well
        after paint, and nothing on this page waits for it. It is the one place
        somebody is told they are holding pieces they could be selling —
        `/portfolio` only says so to people who already went looking.
      */}
      <ListPrompt />

      <Hero deck={deck} />

      {/*
        Everything below the hero, redesigned 2026-10-09 after a reference the
        owner chose. See components/ExploreStory.tsx; nothing in it reads the chain.
      */}
      <ExploreStory summary={summary} collections={collections} />
    </>
  );
}

/**
 * The deck's own shape, kept local so the hero does not depend on the token
 * type. `count` went when the deck stopped being a query - see
 * config/heroDeck.ts, which is now the only source for these.
 */
interface DeckCard {
  /** Absent until the collection is deployed; the card then does not link. */
  address?: `0x${string}`;
  name: string;
  image: string;
  caption?: string;
  /** Show SoDEX's wordmark in front of the caption. See config/heroDeck.ts. */
  brand?: "sodex";
}

/**
 * The hero: centred copy standing over a fanned deck of the collections.
 *
 * The deck is the page's argument. A marketplace's front page has to answer
 * "what is on here" before it asks for anything, and a row of real collections
 * fanned like a hand of cards does that in one glance — where a headline alone
 * only makes a claim.
 *
 * Every card is a collection that exists on chain, so the fan is never a
 * mock-up of a busier site than this one.
 */

/** Keyed to the flag, so the hero cannot promise a feature that is off. */
const HERO_COPY = heroCopy(CREATE_ENABLED);

function Hero({ deck }: { deck: DeckCard[] }) {
  /**
   * The fan's axis, which is a *position* and not a card.
   *
   * `floor(n/2)` puts it on a card, and with an even count that makes the fan
   * lopsided: four cards became slots -2,-1,0,1, hanging further left than
   * right. `(n-1)/2` gives -1.5,-0.5,0.5,1.5 — balanced for any count, at the
   * cost of no single card being "the centre" when the count is even.
   */
  const axis = (deck.length - 1) / 2;
  const nearest = Math.min(...deck.map((_, i) => Math.abs(i - axis)));

  /**
   * Hand the pointer's position to the stylesheet, and let CSS do the rest.
   *
   * Two property writes and nothing else — no rAF loop, no state, no render.
   * `--hx-mx` and `--hx-my` are registered in `hero.css`, so the browser
   * interpolates them and the 280ms ease there turns a series of destinations
   * into a glide. Putting this in React state instead would re-render the
   * whole hero, deck and all, on every frame of a mouse movement.
   *
   * `pointermove` is coalesced to at most one event per frame, so the
   * `getBoundingClientRect` below runs at most once a frame on an element
   * whose layout is already clean.
   */
  const tracePointer = (event: React.PointerEvent<HTMLElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;

    const fx = (event.clientX - box.left) / box.width;
    const fy = (event.clientY - box.top) / box.height;

    const style = event.currentTarget.style;
    /** Where the light is: a position, so percentages. */
    style.setProperty("--hx-mx", `${fx * 100}%`);
    style.setProperty("--hx-my", `${fy * 100}%`);
    /**
     * How far from the middle, SIGNED, as -1..1.
     *
     * A second pair rather than deriving it from the first, because the two
     * are different quantities: the light needs a point inside the box, and
     * the parallax needs a direction away from its centre. Deriving one from
     * the other in `calc` would mean every layer repeating the same
     * subtraction, and `--hx-mx` carries a unit that cannot be multiplied by
     * a depth.
     */
    style.setProperty("--hx-px", `${(fx - 0.5) * 2}`);
    style.setProperty("--hx-py", `${(fy - 0.5) * 2}`);
  };

  return (
    <section className="hx" onPointerMove={tracePointer}>
      <div className="hx-deep" aria-hidden="true" />

      {/*
        The ground's answer to the pointer — see the trace block in hero.css.
        Atmospheric, so it is out of the accessibility tree and takes no
        pointer events; the section above is what listens.
      */}
      {/*
        Collection art, drifting behind everything.

        Decoration: out of the accessibility tree, no pointer events, and
        `priority` is deliberately absent — the hero's real subject is the
        deck and the heading, and these must never compete with them for the
        first bytes.
      */}
      <div className="hx-cast" aria-hidden="true">
        <i className="hx-cut hx-cut-helm" />
        <i className="hx-cut hx-cut-bear" />
        <i className="hx-cut hx-cut-plush" />
        <i className="hx-cut hx-cut-cat" />
      </div>

      <div className="hx-trace" aria-hidden="true" />

      {/*
        Three drifting lights. Purely atmospheric, so it is hidden from the
        accessibility tree and takes no pointer events — and every one of them
        stops for anyone who asks for reduced motion.
      */}
      <div className="hx-aurora" aria-hidden="true">
        <i className="hx-orb hx-orb-a" />
        <i className="hx-orb hx-orb-b" />
        <i className="hx-orb hx-orb-c" />
      </div>

      <div className="page hx-inner">

        <h1 className="hx-title">
          {HERO_COPY.lead}
          <br />
          <em>{HERO_COPY.em}</em>
        </h1>

        <p className="hx-lede">{HERO_COPY.lede}</p>

        <div className="hx-actions">
          <Link className="btn btn-lg hx-btn-ghost" href="/collections">
            Explore collections
          </Link>
          {/*
            The other half of the headline, and the one carrying the emphasis.

            The hero says "Collect and trade", and until now the only way on
            from it was into the collections list — browsing, not trading. The
            market is where a price and a Buy button are, and it was four items
            down the nav from the sentence promising it.

            It takes the solid fill and the collections link takes the outline,
            rather than the other way round, because this is the action the
            page is for. An accent-orange variant was tried first and read as
            loud next to a hero whose every other colour is deliberately black
            and white.
          */}
          <Link className="btn btn-primary btn-lg" href="/market">
            Trade NFTs
          </Link>
          {CREATE_ENABLED ? (
            <Link className="btn btn-lg hx-btn-ghost" href="/create">
              Create a collection
            </Link>
          ) : null}
        </div>

      </div>

      {/*
        Floating markers, in place of the reference's scattered name tags. Facts
        rather than decoration: the same visual lift, but each one is something
        a buyer would otherwise have to go and look up.
      */}
      <span className="hx-float hx-float-a" aria-hidden="true">~2s blocks</span>
      <span className="hx-float hx-float-b" aria-hidden="true">0.008 gwei</span>

      <div className="hx-deck">
        {deck.map((c, i) => (
          <DeckTile
            key={`${c.name}-${i}`}
            card={c}
            slot={i - axis}
            centre={Math.abs(i - axis) === nearest}
            /*
              Marked rather than derived in CSS: the phone rule has to drop the
              widest cards, and `:has(+ .is-centre)` cannot express that when an
              even count leaves two cards tied for the middle.

              The threshold is 1.5 because slots are half-integers on an even
              count: four cards sit at ±0.5 and ±1.5 and all four fit a phone,
              while five reach ±2 and the outermost pair does not.
            */
            far={Math.abs(i - axis) > 1.5}
          />
        ))}
      </div>
    </section>
  );
}



/**
 * One card in the fan.
 *
 * Its own component for a dull but real reason: a card links only when its
 * collection exists, and expressing that as a dynamic tag with a spread
 * (`const Card = address ? Link : "div"`) made React lose track of the `key` and
 * warn on every render. Two explicit branches are clearer and quieter.
 *
 * The SoDEX boxes are announced and not yet deployed, so there is no collection
 * page for them - `/collection/undefined` renders "that isn't a valid address",
 * which is a worse first impression than a card that simply does not move.
 */
function DeckTile({
  card,
  slot,
  centre,
  far,
}: {
  card: DeckCard;
  slot: number;
  centre: boolean;
  far: boolean;
}) {
  /**
   * Which edge of this card is actually on show.
   *
   * The fan stacks toward the middle - `z-index: calc(10 - var(--abs))` - so
   * the centre card covers the inner edge of both its neighbours. For a card
   * left of centre that hidden edge is its right, and the visible strip is its
   * left, which is where text already starts. For a card right of centre it is
   * the other way round, and a name starting at the left edge started
   * underneath the card in front of it: on the two right-hand boxes only the
   * tail of "...easure Box" ever showed.
   *
   * So the two on the right align to their own right edge. Nothing about the
   * geometry is mirrored - only the text is.
   */
  const className =
    `hx-card${centre ? " is-centre" : ""}${far ? " is-far" : ""}` +
    (slot > 0 ? " is-right" : "");
  const style = { ["--slot" as string]: slot, ["--abs" as string]: Math.abs(slot) };

  const inner = (
    <>
      <span className="hx-card-art">
        {/*
          A plain <img>, not <Art>. These are our own WebPs served from this
          origin, so the optimiser would add a round trip to save nothing - the
          same reasoning as the SOSO mark.

          `fetchPriority="high"` and no lazy attribute: every card is above the
          fold and they are the first thing anyone sees.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.image} alt="" width={600} height={600} fetchPriority="high" decoding="async" />
        {/*
          The name sits ON the artwork, not under it.

          `.hx-deck` is deliberately `card-h * 0.82` tall so the fan is cut by
          the section edge and reads as standing in front of it - which meant
          the strip below the art, where the name used to live, was clipped away
          on every card. The names had never been visible.

          Over the art they always are, and the effect is kept. It also works
          without a theme: all five pieces of artwork now carry a dark ground,
          so a scrim and white type read the same in light and dark.
        */}
        <span className="hx-card-body">
          {/*
            The collection's own wordmark where it has one.

            `on="art"` rather than the theme-following default: every piece in
            this deck carries a dark ground — that is why the scrim and white
            type above work without a theme — so the light drawing is always
            the right one here, and following the page theme would put a black
            wordmark on a dark picture half the time.
          */}
          {wordmarkFor(card.address) === undefined ? (
            <b>{card.name}</b>
          ) : (
            <b>
              <Wordmark mark={wordmarkFor(card.address)!} name={card.name} on="art" />
            </b>
          )}
          <span className="hx-card-cap">
            {/*
              SoDEX's own wordmark standing in for the word, in the theme it
              ships two drawings for - the mark keeps its orange in both while
              the type flips, so this is a swap and not a tint. It sits on the
              artwork rather than on the page, and every piece of artwork here
              has a dark ground, so the white one is always the right one.
            */}
            {card.brand === "sodex" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="hx-card-mark"
                src="/brand/sodex-dark.svg"
                alt="SoDEX"
                width={89}
                height={24}
              />
            ) : null}
            {/* "View collection" is the default and a promise a card cannot
                keep before its collection exists, so a card may override it. */}
            {card.caption ?? "View collection"}
          </span>
        </span>
      </span>
    </>
  );

  if (card.address === undefined) {
    return (
      <div className={className} style={style}>
        {inner}
      </div>
    );
  }

  return (
    <Link href={`/collection/${card.address}`} className={className} style={style}>
      {inner}
    </Link>
  );
}

