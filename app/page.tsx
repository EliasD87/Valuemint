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
import "@/styles/home.css";
import "@/styles/hero.css";

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
  const { tokens, collections, isLoading } = useEverything(12);

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
   * The cards in the hero deck: one per collection, newest-looking first.
   *
   * Built from what is actually on chain rather than a fixed list, so the deck
   * is the marketplace's own contents and cannot go stale. Five is what the fan
   * holds before the outer cards are more edge than card.
   */
  const deck = useMemo(
    () =>
      [...grouped.entries()]
        .map(([address, g]) => ({
          address,
          name: g.name,
          count: g.items.length,
          image: g.items.find((t) => t.image !== undefined)?.image,
        }))
        .filter((c) => c.image !== undefined)
        .slice(0, 5),
    [grouped],
  );

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
    const forSale = listedTokens.filter((t) => t.active && t.image !== undefined);
    const byCollection = new Map<string, ChainToken[]>();
    for (const t of forSale) {
      const k = t.collection.toLowerCase();
      byCollection.set(k, [...(byCollection.get(k) ?? []), t]);
    }
    const listed = interleave([...byCollection.values()]);

    // Anything already shown as a listing must not appear again below it.
    const shown = new Set(listed.map(key));
    const unlisted = [...grouped.values()].map((g) =>
      g.items.filter((t) => t.image !== undefined && !shown.has(key(t))),
    );

    return [...listed, ...interleave(unlisted)];
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
            <h2>Everything minted on ValueChain</h2>
          </div>
          <Link className="head-link" href="/collections">
            All collections &rarr;
          </Link>
        </div>

        <div className="coll-rail">
          {collections.length === 0 ? (
            <span className="dim">No collections yet — be the first.</span>
          ) : (
            collections.map((c) => {
              const art = artFor(c.address)[0];
              return (
                <Link key={c.address} href={`/collection/${c.address}`} className="coll-pill">
                  {art === undefined ? (
                    <span className="coll-fallback">{(c.symbol || c.name).slice(0, 2)}</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art} alt="" loading="lazy" decoding="async" />
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
          {isLoading && tokens.length === 0
            ? Array.from({ length: 10 }, (_, i) => <TokenCardSkeleton key={i} />)
            : visible
                .slice(0, 20)
                .map((token, i) => (
                  <TokenCard
                    key={`${token.collection}-${token.id}`}
                    token={token}
                    collection={token.collection}
                    listing={token.listing}
                    owner={token.owner}
                    viewerAddress={address}
                    // The first row or so is on screen before any scrolling.
                    priority={i < 4}
                  />
                ))}
        </div>

        {!isLoading && visible.length === 0 ? (
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
        {mintable.length === 0 ? (
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="mint-row-art" src={art} alt="" loading="lazy" decoding="async" />
                  )}
                  <div className="mint-row-who">
                    <b>{c.name}</b>
                    <span className="dim">{c.symbol}</span>
                  </div>
                  <div className="mint-row-fig">
                    <b className="mono">{formatSoso(c.mintPrice)} SOSO</b>
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
              supply, the price and your royalty. It costs a fraction of a cent in gas and no fee.
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

interface DeckCard {
  address: string;
  name: string;
  count: number;
  image?: string;
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
          <Link
            key={c.address}
            href={`/collection/${c.address}`}
            className={
              `hx-card` +
              (Math.abs(i - axis) === nearest ? " is-centre" : "") +
              // Marked rather than derived in CSS: the phone rule has to drop
              // the widest cards, and `:has(+ .is-centre)` cannot express that
              // when an even count leaves two cards tied for the middle.
              //
              // The threshold is 1.5 because slots are half-integers on an even
              // count: four cards sit at ±0.5 and ±1.5 and all four fit a
              // phone, while five reach ±2 and the outermost pair does not.
              (Math.abs(i - axis) > 1.5 ? " is-far" : "")
            }
            style={{ ["--slot" as string]: i - axis, ["--abs" as string]: Math.abs(i - axis) }}
          >
            <span className="hx-card-art">
              {/* Every card is above the fold, so none of them should be lazy —
                  it is four images, and they are the first thing anyone sees. */}
              <Art src={c.image!} alt="" sizes="(max-width: 700px) 55vw, 300px" priority />
            </span>
            <span className="hx-card-body">
              <b>{c.name}</b>
              <span>{formatCount(BigInt(c.count))} shown</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
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
