"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useChainStats } from "@/hooks/useChainStats";
import { useEverything } from "@/hooks/useEverything";
import { useCollectionArt } from "@/hooks/useCollectionArt";
import type { ChainToken } from "@/hooks/useEverything";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { formatCount, formatSoso } from "@/lib/format";
import "@/styles/home.css";

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
  const stats = useChainStats();
  const { tokens, collections, isLoading } = useEverything(12);
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

  const featured = useMemo(
    () => interleave([...grouped.values()].map((g) => g.items.filter((t) => t.image !== undefined))),
    [grouped],
  );

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
      <Hero featured={featured} stats={stats} />

      <section className="strip">
        <div className="strip-inner">
          <span className="strip-item">
            <b>2s</b> block time
          </span>
          <span className="strip-item">
            <b>0.008</b> gwei gas
          </span>
          <span className="strip-item">
            <b>{formatCount(BigInt(stats.collections))}</b> collections
          </span>
          <span className="strip-item">
            <b>{formatCount(stats.minted)}</b> pieces minted
          </span>
          <span className="strip-item">
            <b>{stats.openMints}</b> minting now
          </span>
          <span className="strip-item">
            <b>{Number(stats.protocolFeeBps) / 100}%</b> marketplace fee
          </span>
        </div>
      </section>

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
                .map((token) => (
                  <TokenCard
                    key={`${token.collection}-${token.id}`}
                    token={token}
                    collection={token.collection}
                    listing={token.listing}
                    owner={token.owner}
                    viewerAddress={address}
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

function Hero({
  featured,
  stats,
}: {
  featured: ChainToken[];
  stats: ReturnType<typeof useChainStats>;
}) {
  const [front, mid, back] = featured;

  return (
    <section className="hero on-dark">
      <div className="page hero-inner">
        <div className="hero-text">
          <p className="eyebrow">Built on ValueChain · SoSoValue L1</p>

          <h1 className="hero-title">
            Create, collect and trade NFTs on ValueChain.
          </h1>

          {/* No superlatives. "The first marketplace on a chain that had never
              held an NFT" is unverifiable, ages badly, and invites an argument
              nobody wins. Everything below is checkable: the contracts are
              non-custodial by construction, blocks land in ~2s, and gas is
              0.008 gwei. */}
          <p className="hero-lede">
            Deploy your own collection, mint it, and trade it — with no custodian holding anything.
            You own the contract outright, and every trade settles in seconds for a fraction of a
            cent.
          </p>

          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" href="/mint">
              Explore mints
            </Link>
            <Link className="btn btn-lg" href="/create">
              Create a collection
            </Link>
          </div>

          <dl className="hero-figures">
            <div className="hero-figure">
              <b>{formatCount(stats.minted)}</b>
              <span>Pieces</span>
            </div>
            <div className="hero-figure">
              <b>{formatCount(BigInt(stats.collections))}</b>
              <span>Collections</span>
            </div>
            {/* This slot used to show one collection's mint price as "SOSO to
                mint", which is only meaningful when the site hosts a single
                collection. How many are open to mint is true of all of them. */}
            <div className="hero-figure">
              <b>{stats.openMints}</b>
              <span>Minting now</span>
            </div>
          </dl>
        </div>

        <div className="stage">
          <div className="orbit" aria-hidden="true" />
          <div className="orbit-inner" aria-hidden="true" />
          {back !== undefined ? <Plate token={back} className="plate-back" showCaption /> : null}
          {mid !== undefined ? <Plate token={mid} className="plate-mid" showCaption /> : null}
          {front !== undefined ? (
            <Plate token={front} className="plate-front" showCaption />
          ) : (
            <div className="plate plate-front skeleton" style={{ aspectRatio: 1 }} />
          )}
        </div>
      </div>
    </section>
  );
}

function Plate({
  token,
  className,
  showCaption = false,
}: {
  token: ChainToken;
  className: string;
  showCaption?: boolean;
}) {
  return (
    <div className={`plate ${className}`}>
      <img src={token.image} alt={token.design ?? ""} />
      {showCaption ? (
        <div className="plate-caption">
          <span className="plate-name">
            {token.design} <span className="dim mono">#{token.id.toString()}</span>
          </span>
          {/* Always the collection, never the tier. Falling back to the tier
              only where one exists made the same slot mean "Common" on one
              plate and "Hypno Plush" on the next; on a page whose job is to
              show what is on the whole chain, where a piece is from is the
              useful and uniform answer. */}
          <span className="plate-price">{token.collectionName}</span>
        </div>
      ) : null}
    </div>
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
