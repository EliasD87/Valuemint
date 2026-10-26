"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { TopCollections } from "@/components/TopCollections";
import { WarmLink } from "@/components/WarmLink";
import { Soso } from "@/components/Soso";
import { Wordmark } from "@/components/Wordmark";
import { useBestListings } from "@/hooks/useSeaportOrders";
import { useTokenDocuments } from "@/hooks/useTokenDocuments";
import type { CollectionSummary } from "@/hooks/useAllCollections";
import type { LoadedToken } from "@/hooks/useTokens";
import { SPOTLIGHT } from "@/config/exploreStory";
import { PINNED_COLLECTIONS } from "@/config/featured";
import { avatarFor } from "@/config/covers";
import { wordmarkFor } from "@/config/wordmarks";
import { formatCount, formatSoso, resolveMediaUrl, timeAgo, timeAgoShort } from "@/lib/format";
import { unitPrice } from "@/lib/seaport";
import { tierOf, traitOf, type TokenMetadata } from "@/lib/tokenMetadata";
import type { ExploreCollection, ExploreSummary } from "@/lib/exploreTypes";
import type { FrontSnapshot } from "@/lib/frontTypes";
import "@/styles/front.css";

/**
 * The front page as a place to shop (2026-10-25).
 *
 * It was a showcase: a headline the height of the screen over a fanned deck of
 * covers, and the market itself began below the fold. A marketplace's front
 * page is where people come to see what is for sale, so this one leads with
 * pieces and prices, laid out like an app rather than a poster:
 *
 *   main   a spotlight banner, then what is for sale now — real listings,
 *          filterable by collection
 *   rail   the market in four figures, what is minting, and what just sold
 *   foot   the collections ranked, across both
 *
 * The first screen draws from the server, not the chain. `snapshot` is read
 * from the index when the page is built (lib/frontSnapshot.ts): listings with
 * their artwork already resolved, names, and mint progress. The live sources
 * the page used to wait on — the browser's own order book, which `WarmChain`
 * reads on arrival anyway, and the collection registry — replace it section
 * by section as they land, and a card the snapshot already drew keeps its
 * document rather than fetching it again.
 */

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Cards on show. Two rows of four on a desktop; the stylesheet trims a row of three to six. */
const SHOWN = 8;

/** How long each collection holds the banner. */
const SPOT_MS = 6500;

const PIN_RANK = new Map(PINNED_COLLECTIONS.map((a, i) => [a.toLowerCase(), i]));
const pinRank = (address: string) => PIN_RANK.get(address.toLowerCase()) ?? PIN_RANK.size;

type Market = ReadonlyMap<string, ExploreCollection>;

/** A collection as every section here needs it, from whichever source has answered. */
interface Known {
  name: string;
  symbol?: string;
  /** Always true for what the server lists — it lists nothing it does not vouch for. */
  vouched: boolean;
}
type KnownMap = ReadonlyMap<string, Known>;

export function Front({
  summary,
  collections,
  snapshot,
}: {
  summary: ExploreSummary | undefined;
  collections: readonly CollectionSummary[];
  snapshot: FrontSnapshot | undefined;
}) {
  /**
   * Which collections anything vouches for: the server's list at once, the
   * browser's registry on top of it when it lands.
   *
   * The index records every contract that ever traded through Seaport, and the
   * order book is permissionless: anyone can deploy a contract, name it after a
   * real one and wash-trade it up a ranking. So no section here shows a
   * collection that is in neither list.
   */
  const known: KnownMap = useMemo(() => {
    const out = new Map<string, Known>();
    const summaryName = new Map((summary?.collections ?? []).map((c) => [c.address.toLowerCase(), c]));
    for (const c of snapshot?.collections ?? []) {
      const s = summaryName.get(c.address);
      const name = c.name ?? s?.name;
      if (name !== undefined) out.set(c.address, { name, symbol: c.symbol ?? s?.symbol, vouched: true });
    }
    for (const c of collections) {
      out.set(c.address.toLowerCase(), { name: c.name, symbol: c.symbol, vouched: c.vouched });
    }
    return out;
  }, [snapshot, collections, summary]);

  const trusted = useMemo((): ExploreSummary | undefined => {
    if (summary === undefined || known.size === 0) return summary;
    return {
      ...summary,
      collections: summary.collections.filter((c) => known.has(c.address.toLowerCase())),
      latest: summary.latest.filter((s) => known.has(s.collection.toLowerCase())),
    };
  }, [summary, known]);

  const names = useMemo(
    () => new Map([...known].map(([address, k]) => [address, { name: k.name, symbol: k.symbol }])),
    [known],
  );

  const market: Market = useMemo(
    () => new Map((trusted?.collections ?? []).map((c) => [c.address.toLowerCase(), c])),
    [trusted],
  );

  return (
    <div className="fp page">
      {/* The banner names a collection; the page still needs to say what it is. */}
      <h1 className="fp-sr">ValueMint, the NFT marketplace on ValueChain</h1>

      <div className="fp-main">
        <Spotlight market={market} />
        <ForSale known={known} market={market} snapshot={snapshot} />
      </div>

      <aside className="fp-rail" aria-label="Market at a glance">
        <Pulse summary={trusted} />
        <Mints collections={collections} snapshot={snapshot} />
        <Sales summary={trusted} names={names} />
      </aside>

      {/* Across both columns: under the rail as well as the grid, so neither
          column is left running on alone, and after the rail in reading order
          so a phone gets mints and sales before the ranking. */}
      <section className="fp-block fp-top" aria-labelledby="fp-top-h">
        <Head id="fp-top-h" title="Top collections" href="/collections" link="All collections" />
        <TopCollections summary={trusted} names={names} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------- head */

function Head({
  id,
  title,
  href,
  link,
  children,
}: {
  id: string;
  title: string;
  href?: string;
  link?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="fp-head">
      <h2 id={id} className="fp-h">
        {title}
      </h2>
      <div className="fp-head-tools">
        {children}
        {href === undefined ? null : (
          <Link className="fp-more" href={href}>
            {link}
            <Arrow />
          </Link>
        )}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------- spotlight */

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
 * One featured collection at a time, crossfading.
 *
 * A fade rather than the old sliding track: every slide is laid out in the
 * same place and only the one on show is opaque, so there is no copy of the
 * first slide to jump back to, and no position that depends on an animation
 * having run. Each slide's resting state is its declared state.
 *
 * Six and a half seconds a slide, up from 1.5 — long enough to read a name and
 * a price, which is what the banner is now for. It holds still under a
 * pointer, while anything in it has keyboard focus, for reduced motion, and
 * while the tab is hidden.
 */
function Spotlight({ market }: { market: Market }) {
  const count = SPOTLIGHT.length;
  const [at, setAt] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduce = useReducedMotion();
  const playing = !hovered && !focused && !reduce;

  /* Restarted whenever the slide changes, so a click resets the clock rather than racing it. */
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      if (document.visibilityState === "visible") setAt((i) => (i + 1) % count);
    }, SPOT_MS);
    return () => window.clearTimeout(id);
  }, [playing, at, count]);

  return (
    <section
      className="fp-spot"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured collections"
      data-playing={playing ? "" : undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {SPOTLIGHT.map((slide, i) => {
        const m = market.get(slide.address);
        const mark = wordmarkFor(slide.address);
        const shown = i === at;
        return (
          <div
            key={slide.address}
            className={shown ? "fp-slide is-on" : "fp-slide"}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}: ${slide.name}`}
            aria-hidden={!shown}
            inert={!shown}
          >
            <div className="fp-slide-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.image}
                alt=""
                decoding="async"
                fetchPriority={i === 0 ? "high" : "low"}
                loading={i === 0 ? "eager" : "lazy"}
                style={slide.focus === undefined ? undefined : { objectPosition: slide.focus }}
              />
            </div>
            {slide.foreground === undefined ? null : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="fp-slide-fg"
                src={slide.foreground}
                alt={slide.foregroundAlt ?? ""}
                decoding="async"
                loading={i === 0 ? "eager" : "lazy"}
              />
            )}

            <div className="fp-slide-body">
              <span className="fp-eyebrow">Featured collection</span>
              <h2 className="fp-slide-name">
                {mark === undefined ? slide.name : <Wordmark mark={mark} name={slide.name} on="art" />}
              </h2>
              <dl className="fp-slide-stats">
                <div>
                  <dt>Floor</dt>
                  <dd>{m?.floorWei === undefined ? "—" : <Soso size={14}>{formatSoso(BigInt(m.floorWei), 2)}</Soso>}</dd>
                </div>
                <div>
                  <dt>For sale</dt>
                  <dd>{m === undefined ? "—" : formatCount(m.listed)}</dd>
                </div>
                <div>
                  <dt>24h volume</dt>
                  <dd>{m === undefined ? "—" : <Soso size={14}>{formatSoso(BigInt(m.volume.day), 0)}</Soso>}</dd>
                </div>
              </dl>
              <div className="fp-slide-actions">
                <WarmLink className="btn fp-btn-light" href={`/collection/${slide.address}`}>
                  Shop the collection
                </WarmLink>
              </div>
            </div>
          </div>
        );
      })}

      {/* Which slide, and while it plays, how long until the next. */}
      <div className="fp-tabs" role="tablist" aria-label="Choose a collection">
        {SPOTLIGHT.map((slide, i) => {
          const avatar = avatarFor(slide.address);
          return (
            <button
              key={slide.address}
              type="button"
              role="tab"
              className={i === at ? "fp-tab is-on" : "fp-tab"}
              aria-selected={i === at}
              aria-label={slide.name}
              onClick={() => setAt(i)}
            >
              {avatar === undefined ? null : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" width={28} height={28} loading="lazy" decoding="async" />
              )}
              <span className="fp-tab-name">{slide.name}</span>
              {/* Keyed to the slide, so the bar restarts from empty each time it is shown. */}
              <i key={i === at ? `on-${at}` : "off"} className="fp-tab-bar" style={vars({ "--dur": `${SPOT_MS}ms` })} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- for sale */

type Sort = "new" | "low";

/** One listing as a card needs it, whether the snapshot or the live book supplied it. */
interface Piece {
  hash: string;
  collection: `0x${string}`;
  tokenId: bigint;
  maker: `0x${string}`;
  /** For the lot. */
  priceWei: bigint;
  amount: bigint;
  blockNumber: bigint;
  uri?: string;
  metadata?: TokenMetadata;
}

const keyOf = (collection: string, tokenId: bigint | string) => `${collection.toLowerCase()}-${tokenId}`;

/** What the buyer pays for one piece. A listing carries its lot's price. */
const each = (p: Piece) => unitPrice(p.priceWei, p.amount);

/**
 * Round-robin across groups.
 *
 * The Trenches alone has hundreds of pieces listed at well under a SOSO, so
 * "newest" or "cheapest" across the whole book is one collection's gallery.
 * Taking one from each collection in turn is what makes the grid look like a
 * marketplace.
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

function ForSale({
  known,
  market,
  snapshot,
}: {
  known: KnownMap;
  market: Market;
  snapshot: FrontSnapshot | undefined;
}) {
  const { address: viewer } = useAccount();
  const [pick, setPick] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("new");

  /** The shared book — the one `WarmChain` has already asked for. */
  const { best, isLoading, logsUnavailable } = useBestListings();

  /*
   * The server never fetches the book, so there it is "not loading" and empty
   * at once — which reads as answered. Until mount the snapshot is the only
   * truth, or the baked page says "nothing is listed" and hydration disagrees.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * The snapshot's listings, and the documents it already resolved.
   *
   * Kept as a lookup even once the live book takes over: most of the live
   * book's first screen is the same pieces, and their pictures are already
   * here.
   */
  const { drawn, docs } = useMemo(() => {
    const out: Piece[] = [];
    const byKey = new Map<string, { uri?: string; metadata?: TokenMetadata }>();
    for (const p of snapshot?.pieces ?? []) {
      const piece: Piece = {
        hash: p.hash,
        collection: p.collection as `0x${string}`,
        tokenId: BigInt(p.tokenId),
        maker: p.maker as `0x${string}`,
        priceWei: BigInt(p.priceWei),
        amount: BigInt(p.amount),
        blockNumber: BigInt(p.blockNumber),
        ...(p.uri === undefined ? {} : { uri: p.uri }),
        ...(p.metadata === undefined ? {} : { metadata: p.metadata }),
      };
      out.push(piece);
      byKey.set(keyOf(p.collection, p.tokenId), { uri: p.uri, metadata: p.metadata });
    }
    return { drawn: out, docs: byKey };
  }, [snapshot]);

  /**
   * The live book once it has answered; the snapshot until then.
   *
   * "Answered" includes answering that nothing is for sale — but not a node
   * refusing to serve logs, which empties the book without meaning the market
   * is empty. Then the snapshot stands.
   */
  const live = mounted && !isLoading && !(logsUnavailable && best.size === 0);
  const pieces = useMemo((): Piece[] => {
    if (!live) return drawn;
    const out: Piece[] = [];
    for (const o of best.values()) {
      if (o.tokenId === undefined) continue;
      const doc = docs.get(keyOf(o.collection, o.tokenId));
      out.push({
        hash: o.hash,
        collection: o.collection,
        tokenId: o.tokenId,
        maker: o.maker,
        priceWei: o.priceWei,
        amount: o.amount,
        blockNumber: o.blockNumber,
        ...(doc?.uri === undefined ? {} : { uri: doc.uri }),
        ...(doc?.metadata === undefined ? {} : { metadata: doc.metadata }),
      });
    }
    return out;
  }, [live, drawn, best, docs]);

  /** Listings in collections something vouches for, grouped by collection. */
  const groups = useMemo(() => {
    const out = new Map<string, Piece[]>();
    for (const p of pieces) {
      const key = p.collection.toLowerCase();
      if (!known.has(key)) continue;
      const list = out.get(key);
      if (list === undefined) out.set(key, [p]);
      else list.push(p);
    }
    for (const list of out.values()) {
      list.sort((a, b) =>
        sort === "new"
          ? Number(b.blockNumber - a.blockNumber)
          : each(a) < each(b)
            ? -1
            : each(a) > each(b)
              ? 1
              : 0,
      );
    }
    return out;
  }, [pieces, known, sort]);

  /** The chips: collections with something to buy, pinned ones first, then the busiest. */
  const chips = useMemo(
    () =>
      [...groups.keys()].sort((a, b) => {
        const d = pinRank(a) - pinRank(b);
        if (d !== 0) return d;
        const va = BigInt(market.get(a)?.volume.all ?? "0");
        const vb = BigInt(market.get(b)?.volume.all ?? "0");
        return vb > va ? 1 : vb < va ? -1 : 0;
      }),
    [groups, market],
  );

  /* A chip whose last listing sold goes; the grid falls back to everything. */
  const active = pick !== "all" && groups.has(pick) ? pick : "all";

  const shown = useMemo(() => {
    const lists = active === "all" ? chips.map((k) => groups.get(k) ?? []) : [groups.get(active) ?? []];
    return interleave(lists).slice(0, SHOWN);
  }, [active, chips, groups]);

  /* Only what the snapshot did not already resolve: its URI in one batched read, then its document. */
  const missing = useMemo(() => shown.filter((p) => p.uri === undefined && p.metadata === undefined), [shown]);
  const { data: uriReads } = useReadContracts({
    contracts: missing.map((p) => ({
      address: p.collection,
      abi: erc721Abi,
      functionName: "tokenURI" as const,
      args: [p.tokenId],
    })),
    query: { enabled: missing.length > 0 },
  });
  const readUri = new Map<string, string>();
  missing.forEach((p, i) => {
    const r = uriReads?.[i];
    if (r?.status === "success") readUri.set(p.hash, r.result as string);
  });
  const uris = shown.map((p) => p.uri ?? readUri.get(p.hash));
  const { documents } = useTokenDocuments(shown.map((p, i) => (p.metadata === undefined ? uris[i] : undefined)));

  /* The total is only ever as true as the source: the snapshot holds a handful per collection. */
  const total = live ? [...groups.values()].reduce((n, g) => n + g.length, 0) : undefined;
  const listedIn = (key: string) => (live ? groups.get(key)?.length : market.get(key)?.listed);
  const moreHref = active === "all" ? "/market" : `/collection/${active}`;

  return (
    <section className="fp-block fp-sale" aria-labelledby="fp-sale-h">
      <Head id="fp-sale-h" title="For sale now" href={moreHref} link={active === "all" ? "View the market" : "View collection"}>
        <div className="fp-seg" role="group" aria-label="Order">
          <button type="button" aria-pressed={sort === "new"} onClick={() => setSort("new")}>
            Newest
          </button>
          <button type="button" aria-pressed={sort === "low"} onClick={() => setSort("low")}>
            Cheapest
          </button>
        </div>
      </Head>

      <div className="fp-chips" role="group" aria-label="Collection">
        <button type="button" className="fp-chip" aria-pressed={active === "all"} onClick={() => setPick("all")}>
          <span className="fp-chip-all" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          All
          {total !== undefined && total > 0 ? <span className="fp-chip-n">{formatCount(total)}</span> : null}
        </button>
        {chips.map((key) => {
          const avatar = avatarFor(key);
          const n = listedIn(key);
          return (
            <button
              key={key}
              type="button"
              className="fp-chip"
              aria-pressed={active === key}
              onClick={() => setPick(key)}
            >
              {avatar === undefined ? (
                <span className="fp-chip-blank" aria-hidden="true" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" width={24} height={24} loading="lazy" decoding="async" />
              )}
              {known.get(key)?.name ?? "Collection"}
              {n === undefined ? null : <span className="fp-chip-n">{formatCount(n)}</span>}
            </button>
          );
        })}
      </div>

      {shown.length === 0 && (!live || known.size === 0) ? (
        <div className="fp-grid">
          {Array.from({ length: SHOWN }, (_, i) => (
            <TokenCardSkeleton key={i} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="fp-empty">
          <b>Nothing is listed right now.</b>
          <span>Listings are non-custodial, so a piece only appears once its owner puts it up.</span>
          <Link className="btn btn-primary" href="/portfolio">
            List something you own
          </Link>
        </div>
      ) : (
        <div className="fp-grid">
          {shown.map((p, i) => {
            const m = p.metadata ?? documents?.[i];
            const token: LoadedToken = {
              id: p.tokenId,
              uri: uris[i],
              metadata: m,
              design: traitOf(m, "Design") ?? m?.name,
              tier: tierOf(m),
              edition: traitOf(m, "Edition"),
              image: resolveMediaUrl(m?.image),
            };
            const c = known.get(p.collection.toLowerCase());
            return (
              <TokenCard
                key={p.hash}
                token={token}
                collection={p.collection}
                collectionName={c?.name}
                listing={{ price: p.priceWei }}
                owner={p.maker}
                viewerAddress={viewer}
                vouched={c?.vouched}
                priority={i < 4}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ pulse */

/**
 * The market in four figures.
 *
 * Summed from the per-collection rows rather than read from `totals`, for the
 * 24-hour pair: `totals` is all time, and "today" is the question somebody
 * arriving asks first. Only vouched-for collections are summed, so a
 * wash-traded impostor cannot inflate these.
 */
function Pulse({ summary }: { summary: ExploreSummary | undefined }) {
  const figures = useMemo(() => {
    if (summary === undefined) return undefined;
    let dayWei = 0n;
    let daySales = 0;
    let listed = 0;
    for (const c of summary.collections) {
      dayWei += BigInt(c.volume.day);
      daySales += c.sales.day;
      listed += c.listed;
    }
    return { dayWei, daySales, listed, allWei: BigInt(summary.totals.volumeWei), traders: summary.totals.traders };
  }, [summary]);

  const cells: Array<{ label: string; value: React.ReactNode }> = [
    { label: "24h volume", value: figures === undefined ? undefined : <Soso size={15}>{formatSoso(figures.dayWei, 0)}</Soso> },
    { label: "24h sales", value: figures === undefined ? undefined : formatCount(figures.daySales) },
    { label: "For sale", value: figures === undefined ? undefined : formatCount(figures.listed) },
    { label: "Traders", value: figures === undefined ? undefined : formatCount(figures.traders) },
  ];

  return (
    <section className="fp-card fp-pulse" aria-labelledby="fp-pulse-h">
      <div className="fp-card-head">
        <h2 id="fp-pulse-h" className="fp-h fp-h-sm">
          Market
        </h2>
        <span className="fp-live">
          <i aria-hidden="true" />
          Live
        </span>
      </div>
      <dl className="fp-stats">
        {cells.map((c) => (
          <div key={c.label} className="fp-stat">
            <dt>{c.label}</dt>
            <dd>{c.value === undefined ? <span className="skeleton fp-stat-wait" /> : c.value}</dd>
          </div>
        ))}
      </dl>
      {figures === undefined ? null : (
        <p className="fp-pulse-foot">
          <Soso size={12}>{formatSoso(figures.allWei, 0)}</Soso> traded all time
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ mints */

interface MintRow {
  address: `0x${string}`;
  name: string;
  priceWei: bigint;
  minted?: bigint;
  cap?: bigint;
  remaining?: bigint;
}

/** Minted as a share of the cap, 0 to 1; 0 when the cap is unknown. */
function mintedShare(minted: bigint | undefined, cap: bigint | undefined): number {
  if (minted === undefined || cap === undefined || cap === 0n) return 0;
  return Number((minted * 10_000n) / cap) / 10_000;
}

const MINT_ROWS = 5;

function Mints({
  collections,
  snapshot,
}: {
  collections: readonly CollectionSummary[];
  snapshot: FrontSnapshot | undefined;
}) {
  /** Only once the registry has actually read mint settings: before that, every collection looks closed. */
  const registryKnows = collections.some((c) => c.publicMintEnabled !== undefined);

  /**
   * The registry's answer once it has one; the snapshot's until then.
   *
   * Closest to selling out first, then cheapest: the one worth acting on today
   * leads.
   */
  const rows = useMemo((): MintRow[] | undefined => {
    let list: MintRow[];
    if (registryKnows) {
      list = collections
        .filter((c) => c.publicMintEnabled === true && (c.publicMintRemaining ?? 0n) > 0n)
        .map((c) => ({
          address: c.address,
          name: c.name,
          priceWei: c.mintPrice ?? 0n,
          minted: c.totalSupply,
          cap: c.maxSupply,
          remaining: c.publicMintRemaining,
        }));
    } else if (snapshot !== undefined) {
      list = snapshot.collections.flatMap((c) =>
        c.mint === undefined
          ? []
          : [
              {
                address: c.address as `0x${string}`,
                name: c.name ?? "Collection",
                priceWei: BigInt(c.mint.priceWei),
                minted: BigInt(c.mint.minted),
                cap: BigInt(c.mint.cap),
                remaining: BigInt(c.mint.remaining),
              },
            ],
      );
    } else {
      return undefined;
    }
    return list
      .sort((a, b) => {
        const d = mintedShare(b.minted, b.cap) - mintedShare(a.minted, a.cap);
        return d !== 0 ? d : a.priceWei < b.priceWei ? -1 : a.priceWei > b.priceWei ? 1 : 0;
      })
      .slice(0, MINT_ROWS);
  }, [registryKnows, collections, snapshot]);

  return (
    <section className="fp-card" aria-labelledby="fp-mint-h">
      <div className="fp-card-head">
        <h2 id="fp-mint-h" className="fp-h fp-h-sm">
          Minting now
        </h2>
        <Link className="fp-more" href="/mint">
          All mints
          <Arrow />
        </Link>
      </div>

      {rows !== undefined && rows.length === 0 ? (
        <p className="fp-quiet">Nothing is minting at the moment.</p>
      ) : (
        <ul className="fp-list">
          {rows === undefined
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="fp-row">
                  <span className="skeleton fp-row-wait" />
                </li>
              ))
            : rows.map((c) => {
                const avatar = avatarFor(c.address);
                const share = mintedShare(c.minted, c.cap);
                const capped = c.cap !== undefined && c.cap > 0n && c.minted !== undefined;
                return (
                  <li key={c.address} className="fp-row">
                    <WarmLink className="fp-row-link" href={`/collection/${c.address}`}>
                      <span className="fp-thumb">
                        {avatar === undefined ? null : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatar} alt="" width={44} height={44} loading="lazy" decoding="async" />
                        )}
                      </span>
                      <span className="fp-row-text">
                        <b>{c.name}</b>
                        <span className="fp-row-sub">
                          <Soso size={11}>{formatSoso(c.priceWei)}</Soso>
                          <span aria-hidden="true">·</span>
                          {capped
                            ? `${formatCount(c.minted)} / ${formatCount(c.cap)}`
                            : `${formatCount(c.remaining)} left`}
                        </span>
                        {capped ? (
                          <span className="fp-bar" aria-hidden="true">
                            <i style={{ width: `${Math.min(100, share * 100)}%` }} />
                          </span>
                        ) : null}
                      </span>
                      <span className="fp-row-cta">Mint</span>
                    </WarmLink>
                  </li>
                );
              })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ sales */

const SALE_ROWS = 6;

/**
 * What just sold, from the summary baked into the page.
 *
 * No artwork per sale: that is a document per row, and the collection's own
 * avatar says which collection it was in one picture this page already has.
 */
function Sales({
  summary,
  names,
}: {
  summary: ExploreSummary | undefined;
  names: ReadonlyMap<string, { name: string; symbol?: string }>;
}) {
  const rows = (summary?.latest ?? []).slice(0, SALE_ROWS);

  /* Ages are relative to now, which the server does not know; drawn after mount so the two agree. */
  const [now, setNow] = useState<number | undefined>(undefined);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="fp-card" aria-labelledby="fp-sales-h">
      <div className="fp-card-head">
        <h2 id="fp-sales-h" className="fp-h fp-h-sm">
          Just sold
        </h2>
        <Link className="fp-more" href="/activity">
          Activity
          <Arrow />
        </Link>
      </div>

      {summary !== undefined && rows.length === 0 ? (
        <p className="fp-quiet">No sales yet.</p>
      ) : (
        <ul className="fp-list">
          {summary === undefined
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="fp-row">
                  <span className="skeleton fp-row-wait" />
                </li>
              ))
            : rows.map((s) => {
                const key = s.collection.toLowerCase();
                const avatar = avatarFor(key);
                const at = Math.floor(new Date(s.at).getTime() / 1000);
                return (
                  <li key={`${s.collection}-${s.tokenId}-${s.at}`} className="fp-row">
                    <WarmLink className="fp-row-link" href={`/token/${s.collection}/${s.tokenId}`}>
                      <span className="fp-thumb fp-thumb-sm">
                        {avatar === undefined ? null : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatar} alt="" width={36} height={36} loading="lazy" decoding="async" />
                        )}
                      </span>
                      {/* The number under the name, not after it: a long collection
                          name truncated the one part that says which piece. */}
                      <span className="fp-row-text">
                        <b>{names.get(key)?.name ?? "Collection"}</b>
                        <span className="fp-row-sub">
                          #{s.tokenId}
                          {now === undefined ? null : (
                            <>
                              <span aria-hidden="true">·</span>
                              <span title={timeAgo(at)}>
                                {timeAgoShort(at, now) === "now" ? "just now" : `${timeAgoShort(at, now)} ago`}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="fp-row-price">
                        <Soso size={12}>{formatSoso(BigInt(s.priceWei), 2)}</Soso>
                      </span>
                    </WarmLink>
                  </li>
                );
              })}
        </ul>
      )}
    </section>
  );
}
