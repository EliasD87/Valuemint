"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useEverything } from "@/hooks/useEverything";
import { useListingFeed } from "@/hooks/useListingFeed";
import { useCollectionArt } from "@/hooks/useCollectionArt";
import { Art } from "@/components/Art";
import type { ChainToken } from "@/hooks/useEverything";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { formatCount, formatSoso } from "@/lib/format";
import { stillUrl } from "@/lib/media";
import "@/styles/home.css";
import "@/styles/hero.css";
import { Soso } from "@/components/Soso";
import { HERO_DECK } from "@/config/heroDeck";

/** "all", "listed", or a collection address. */
type Filter = string;

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

export default function Home() {
  const { address } = useAccount();
  const { tokens, collections, isLoading, loadingMetadata } = useEverything(12);

  /**
   * The listings, read from events rather than sampled.
   *
   * `useEverything(12)` walks the first twelve tokens of each collection by
   * index, which is a cheap way to fill a grid and a hopeless way to find what
   * is for sale: Genesis's listed pieces are #51 to #54, so none of them was
   * ever in the sample. The grid opened with six rows of "Not listed" and the
   * For sale filter read zero while /market showed four — the ordering below
   * was already correct and simply had nothing to order.
   */
  const { tokens: listedTokens } = useListingFeed();
  const { artFor } = useCollectionArt();
  const [filter, setFilter] = useState<Filter>("all");

  /** Sampled pieces grouped by collection, so counts and order stay honest. */
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: typeof tokens }>();
    for (const t of tokens) {
      const key = t.collection.toLowerCase();
      const entry = map.get(key) ?? { name: t.collectionName, items: [] };
      entry.items.push(t);
      map.set(key, entry);
    }
    return map;
  }, [tokens]);

  /**
   * The rail shows five, ranked, not everything.
   *
   * It listed every collection on the chain, which was fine at four and is
   * already a scroll at eight - and it will only grow, because discovery now
   * picks up ERC-1155s and anything the explorer indexes. A home page rail is a
   * shortlist; /collections is the full list, and the link beside the heading
   * goes there.
   *
   * Ranked by what someone can act on: how many pieces are listed for sale,
   * then how many exist. Listings first because a collection you can buy from
   * is more use on a landing page than a larger one you cannot, and minted
   * count breaks the tie among the many with nothing listed. Name last so the
   * order is stable rather than shuffling between renders.
   */
  const topCollections = useMemo(() => {
    const listedPer = new Map<string, number>();
    for (const t of listedTokens) {
      const k = t.collection.toLowerCase();
      listedPer.set(k, (listedPer.get(k) ?? 0) + 1);
    }

    return [...collections]
      .sort((a, b) => {
        const la = listedPer.get(a.address.toLowerCase()) ?? 0;
        const lb = listedPer.get(b.address.toLowerCase()) ?? 0;
        if (la !== lb) return lb - la;

        const sa = a.totalSupply ?? 0n;
        const sb = b.totalSupply ?? 0n;
        if (sa !== sb) return sb > sa ? 1 : -1;

        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }, [collections, listedTokens]);

  /**
   * The hero deck is a bundled snapshot, not a query. See config/heroDeck.ts
   * for the measurement that prompted it - 11.7 seconds to first image, from a
   * page whose DOM was ready in 251ms.
   */
  const deck = HERO_DECK;

  /**
   * The filter chips.
   *
   * These used to be Genesis's rarity tiers - Legendary, Epic, Rare, Common -
   * hardcoded into a marketplace that hosts anyone's collection. Collections
   * with no tiers, which is most of them, could not be filtered to at all, and
   * clicking a tier hid every piece that was not from that one collection.
   * Collections are the axis every piece actually has.
   */
  const chips = useMemo(
    () =>
      [...grouped.entries()]
        .map(([address, g]) => ({ address, name: g.name, count: g.items.length }))
        .sort((a, b) => b.count - a.count),
    [grouped],
  );

  /**
   * Buyable first, then the rest.
   *
   * This is a marketplace front page, and a grid that opens with rows of "Not
   * listed" buries the only pieces a visitor can act on. Anything with a
   * listing therefore comes first.
   *
   * Each band is interleaved on its own rather than sorting the whole list,
   * which keeps the reason `interleave` exists: one collection's items must not
   * fill the grid before another's appear. So the listed pieces are mixed
   * across collections, and the unlisted ones are mixed across collections
   * beneath them.
   */
  const featured = useMemo(() => {
    const key = (t: ChainToken) => `${t.collection.toLowerCase()}-${t.id}`;

    /**
     * Live listings first, whatever their token id.
     *
     * Grouped by collection and interleaved, so one collection with ten
     * listings cannot fill the grid before another's first one appears - the
     * same reason `interleave` exists for the sampled tokens below.
     */
    /**
     * Art decides the order, never whether a token appears at all.
     *
     * These bands used to be filtered by `image !== undefined`, and the images
     * come from IPFS gateways seconds after the token ids come from the chain.
     * So for the first several seconds every token was dropped: the grid was
     * empty, `isLoading` was already false because the chain reads had landed,
     * and the page rendered "Nothing matches that filter" above a chip row
     * reading 12, 12, 12, 7, 5. Measured cold: DOM ready at 260ms, first card
     * at 8.2s.
     *
     * `TokenCard` has always drawn a skeleton for a missing image, so there was
     * never a reason to hide the card too. Sorting art-first instead means the
     * grid is populated immediately, resolved pieces rise to the top as their
     * metadata lands, and a token whose document genuinely has no image sinks
     * to the bottom rather than emptying the page.
     */
    const artFirst = (rows: ChainToken[]) => [
      ...rows.filter((t) => t.image !== undefined),
      ...rows.filter((t) => t.image === undefined),
    ];

    const forSale = listedTokens.filter((t) => t.active);
    const byCollection = new Map<string, ChainToken[]>();
    for (const t of forSale) {
      const k = t.collection.toLowerCase();
      byCollection.set(k, [...(byCollection.get(k) ?? []), t]);
    }
    const listed = artFirst(interleave([...byCollection.values()]));

    // Anything already shown as a listing must not appear again below it.
    const shown = new Set(listed.map(key));
    const unlisted = [...grouped.values()].map((g) =>
      g.items.filter((t) => !shown.has(key(t))),
    );

    return [...listed, ...artFirst(interleave(unlisted))];
  }, [grouped, listedTokens]);

  /** Collections a visitor can mint from right now, cheapest first. */
  const mintable = useMemo(
    () =>
      collections
        .filter((c) => c.publicMintEnabled === true && (c.publicMintRemaining ?? 0n) > 0n)
        .sort((a, b) => Number((a.mintPrice ?? 0n) - (b.mintPrice ?? 0n))),
    [collections],
  );

  const visible = useMemo(() => {
    if (filter === "all") return featured;
    if (filter === "listed") return featured.filter((t) => t.listing !== undefined);
    return featured.filter((t) => t.collection.toLowerCase() === filter);
  }, [featured, filter]);

  return (
    <>
      <Hero deck={deck} />

      <section className="page section">
        <div className="head">
          <div>
            <p className="eyebrow">Collections</p>
            {/* Was "Everything minted on ValueChain", which stopped being true
                the moment the rail became a shortlist. The link beside this
                heading is where "everything" lives. */}
            <h2>Where the trading is</h2>
          </div>
          <Link className="head-link" href="/collections">
            All collections &rarr;
          </Link>
        </div>

        <div className="coll-rail">
          {topCollections.length === 0 ? (
            <span className="dim">No collections yet — be the first.</span>
          ) : (
            topCollections.map((c) => {
              const art = artFor(c.address)[0];
              return (
                <Link key={c.address} href={`/collection/${c.address}`} className="coll-pill">
                  {art === undefined ? (
                    <span className="coll-fallback">{(c.symbol || c.name).slice(0, 2)}</span>
                  ) : (
                    /*
                      Through the proxy, at the size a pill actually is.
                      
                      This was the raw gateway URL, which for Cybereator is a
                      6,577,743-byte animated GIF downloaded into a 40px circle
                      — the single most expensive thing on the home page, and
                      the exact cost /api/still was built to stop. 128px is 2x
                      the slot and answers in a few kilobytes.
                    */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={stillUrl(art, 128)} alt="" loading="lazy" decoding="async" />
                  )}
                  <b>{c.name}</b>
                  <span>{c.symbol}</span>
                </Link>
              );
            })
          )}
        </div>
      </section>

      <section className="page section">
        <div className="head">
          <div>
            <p className="eyebrow">Featured</p>
            <h2>Fresh from every collection</h2>
          </div>
          <Link className="head-link" href="/market">
            Browse the market &rarr;
          </Link>
        </div>

        {chips.length > 1 ? (
          <div className="filters" role="group" aria-label="Filter pieces by collection">
            <Filt active={filter === "all"} onClick={() => setFilter("all")}>
              All <em>{featured.length}</em>
            </Filt>
            {chips.map((c) => (
              <Filt key={c.address} active={filter === c.address} onClick={() => setFilter(c.address)}>
                {c.name} <em>{c.count}</em>
              </Filt>
            ))}
            <Filt active={filter === "listed"} onClick={() => setFilter("listed")}>
              For sale <em>{featured.filter((t) => t.listing !== undefined).length}</em>
            </Filt>
          </div>
        ) : null}

        <div className="grid-tokens">
          {tokens.length === 0
            ? Array.from({ length: 10 }, (_, i) => <TokenCardSkeleton key={i} />)
            : visible
                .slice(0, 20)
                .map((token, i) => (
                  <TokenCard
                    key={`${token.collection}-${token.id}`}
                    token={token}
                    collection={token.collection}
                    collectionName={token.collectionName}
                    listing={token.listing}
                    owner={token.owner}
                    viewerAddress={address}
                    // The first row or so is on screen before any scrolling.
                    priority={i < 4}
                  />
                ))}
        </div>

        {/**
          * Only once there is something to have filtered.
          *
          * This hung off `!isLoading`, and that flag is false in the window
          * between collections resolving and the token reads returning - so a
          * cold load rendered "Nothing matches that filter" for several seconds
          * over a chip row that already showed real counts. Loading flags cannot
          * express this; having data can. With no tokens at all we cannot tell
          * an empty marketplace from an unfinished fetch, and the grid above is
          * already drawing skeletons for exactly that case.
          */}
        {tokens.length > 0 && visible.length === 0 ? (
          <p className="empty">Nothing matches that filter.</p>
        ) : null}
      </section>

      <section className="page section">
        <div className="head">
          <div>
            <p className="eyebrow">Open to mint</p>
            <h2>Available right now</h2>
          </div>
          <Link className="head-link" href="/mint">
            All mints &rarr;
          </Link>
        </div>

        {/* This slot used to hold a "top holders" board. On a single-collection
            site that is a real question; across a marketplace it is not even
            comparable - five of a hundred is not five of ten thousand - and it
            was computed from a fixed-size sample, so the figures were wrong.
            With few holders it also rendered as one row saying one address owns
            everything, on the front page. What is mintable, at what price, is
            actionable and true. */}
        {/**
          * Only once the mint config has actually been read.
          *
          * `collections.length > 0` was not enough: the addresses arrive from the
          * registry before `publicMintEnabled` and `publicMintRemaining` are read
          * for them, so every collection looks unmintable in between and the page
          * announced that nothing was minting while four collections were. Asking
          * whether any collection has a known answer is the honest test.
          */}
        {collections.some((c) => c.publicMintEnabled !== undefined) && mintable.length === 0 ? (
          <p className="empty">
            No collection is minting at the moment. Everything already minted is still tradeable on
            the <Link href="/market">market</Link>.
          </p>
        ) : (
          <div className="mint-rail">
            {mintable.map((c) => {
              const art = artFor(c.address)[0];
              return (
                <Link key={c.address} href={`/collection/${c.address}`} className="mint-row card card-hover">
                  {art === undefined ? (
                    <span className="mint-row-art coll-fallback">{(c.symbol || c.name).slice(0, 2)}</span>
                  ) : (
                    /* Same 6.58 MB original, same 56px slot. See the pill above. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="mint-row-art"
                      src={stillUrl(art, 128)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div className="mint-row-who">
                    <b>{c.name}</b>
                    <span className="dim">{c.symbol}</span>
                  </div>
                  <div className="mint-row-fig">
                    <b className="mono">
                      <Soso size={16}>{formatSoso(c.mintPrice)}</Soso>
                    </b>
                    <span className="dim">each</span>
                  </div>
                  <div className="mint-row-fig">
                    <b className="mono">{formatCount(c.publicMintRemaining)}</b>
                    <span className="dim">left</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="page section">
        <div className="cta">
          <div>
            <h2>Publish your own collection.</h2>
            <p>
              Deploy a real ERC-721 to ValueChain in one transaction. You own it outright — set the
              supply and the price. It costs a fraction of a cent in gas and no fee.
            </p>
          </div>
          <Link className="btn btn-primary btn-lg on-dark" href="/create">
            Start creating
          </Link>
        </div>
      </section>
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

  return (
    <section className="hx">
      <div className="hx-deep" aria-hidden="true" />

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
          Create, collect and trade
          <br />
          <em>everything minted here</em>
        </h1>

        <p className="hx-lede">
          Deploy your own collection, mint it, and trade it — with no custodian holding
          anything. You own the contract outright, and every trade settles in seconds for a
          fraction of a cent.
        </p>

        <div className="hx-actions">
          <Link className="btn btn-primary btn-lg" href="/mint">
            Explore mints
          </Link>
          <Link className="btn btn-lg hx-btn-ghost" href="/create">
            Create a collection
          </Link>
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
          <b>{card.name}</b>
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

function Filt({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="filt" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
