"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useCollectionBasics } from "@/hooks/useCollectionBasics";
import { deployment } from "@/config/contracts";
import { useBestListings } from "@/hooks/useSeaportOrders";
import { toListing, type Listing } from "@/lib/seaport";
import { useGenericTokens } from "@/hooks/useGenericTokens";
import { useTokenIds } from "@/hooks/useTokenIds";
import { MintPanel } from "@/components/MintPanel";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { ShareLink } from "@/components/ShareLink";
import { formatCount, shortAddress } from "@/lib/format";
import "@/styles/home.css";
import "@/styles/collections.css";
import { Sortie } from "@/components/Sortie";
import { Select } from "@/components/Select";
import { Wordmark } from "@/components/Wordmark";
import { wordmarkFor } from "@/config/wordmarks";
import { Activity } from "@/components/Activity";

/**
 * Any ERC-721 on ValueChain, not only ours.
 *
 * Reads through the plain ERC-721 interface rather than our collection's ABI, so
 * a contract written by somebody else works here as long as it is a real 721.
 * Enumeration is optional in the standard, so supply and token ids are probed
 * rather than assumed - a collection that lacks `totalSupply` still renders, just
 * without a grid.
 */
/**
 * Pieces per page, and per press of "Load more".
 *
 * Sixty fills three or four rows of a desktop grid, which is enough to show
 * what a collection looks like without reading the whole of it.
 */
const PAGE = 60;

export function CollectionView({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = use(params);
  const { address: viewer } = useAccount();

  const valid = /^0x[0-9a-fA-F]{40}$/.test(raw);
  const collection = valid ? (raw as `0x${string}`) : undefined;

  /**
   * One multicall for the four things everything else waits on.
   *
   * The hook is shared with the home page's background warmer, so that opening
   * a collection from there finds this already read — see hooks/useCollectionBasics.ts.
   */
  const { isErc721, name, symbol, supply, supplyKnown, probing } =
    useCollectionBasics(collection);

  /**
   * How much of the collection is on screen, and what "more" means.
   *
   * A page rather than the whole thing, because there is no index behind this
   * site: every visitor's own browser walks the collection, so a thousand-piece
   * contract would otherwise fire a thousand reads at anyone who opened it.
   *
   * Sixty was a hard cap, and an invisible one — Cybereator has 1,001 pieces
   * and this page drew sixty of them while saying nothing about the other 941.
   * It is a starting point now, and the line under the grid says what is left.
   */
  const [limit, setLimit] = useState(PAGE);
  const {
    ids,
    isLoading: findingIds,
    isFetching: loadingMore,
  } = useTokenIds(collection, supply, limit);

  /**
   * Listings for this collection, from the shared Seaport scan.
   *
   * This used to be one `getListing` call per id on screen - sixty reads to
   * discover that most of a collection is not for sale. Seaport announces each
   * order once, so the whole market is already in memory and this is a lookup.
   */
  const { best: bestListings } = useBestListings(collection);

  /** Which of this collection's pieces are for sale, whatever their id. */
  const listedIds = useMemo(() => {
    const prefix = `${(collection ?? "0x0").toLowerCase()}-`;
    const out: bigint[] = [];
    for (const key of bestListings.keys()) {
      if (key.startsWith(prefix)) out.push(BigInt(key.slice(prefix.length)));
    }
    return out;
  }, [bestListings, collection]);

  /**
   * The page's window, plus every listed piece whether or not it falls in it.
   *
   * Without the second half this page could not show its own market. The
   * window is the first `limit` ids the collection will name, which for a
   * contract without Enumerable is whatever the explorer lists first — the
   * newest. Cybereator has 1,427 pieces and six of them for sale at #1005,
   * #1051 and thereabouts; the window held #1427 down to #1368, so the page
   * reported "0 listed", drew "Not listed" on every card, and offered a
   * "Price low" sort over a set with no prices in it. The boxes did the same
   * at 8,230 minted and eight on sale.
   *
   * Reaching them by paging is not an answer: it is twenty-three presses of
   * Load more on Cybereator, and the pieces somebody came to buy are the last
   * thing they would find. The order book already names them exactly, so they
   * are simply added — a handful of extra reads, for the only pieces on the
   * page that can be acted on.
   */
  const shownIds = useMemo(() => {
    const seen = new Set(ids.map((id) => id.toString()));
    return [...ids, ...listedIds.filter((id) => !seen.has(id.toString()))];
  }, [ids, listedIds]);

  const { tokens, isLoading } = useGenericTokens(collection, shownIds);

  /**
   * Sorting and trait filtering.
   *
   * The collection page had neither - no controls of any kind - which is
   * fine at nine tokens and useless at ninety. Both work off metadata that
   * is already loaded for the cards, so neither costs a request.
   *
   * Traits are read from the tokens themselves rather than a fixed list.
   * Collections here disagree about what they publish - some have Tier and
   * Design, an external one may have neither - and a hardcoded set would
   * show empty filters for half of them.
   */
  const [sort, setSort] = useState<"id-desc" | "id-asc" | "price-asc" | "price-desc">("id-desc");
  const [traitFilter, setTraitFilter] = useState<Record<string, string>>({});

  const listings = new Map<string, Listing>();
  for (const id of shownIds) {
    const order = bestListings.get(`${(collection ?? "0x0").toLowerCase()}-${id}`);
    if (order !== undefined) listings.set(id.toString(), toListing(order));
  }

  /** Every trait this collection actually publishes, with value counts. */
  const traitOptions = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const t of tokens) {
      for (const a of t.metadata?.attributes ?? []) {
        if (a.trait_type === undefined || a.value === undefined) continue;
        const value = String(a.value);
        const inner = out.get(a.trait_type) ?? new Map<string, number>();
        inner.set(value, (inner.get(value) ?? 0) + 1);
        out.set(a.trait_type, inner);
      }
    }
    /**
     * A trait with one value describes every token, so filtering on it is a
     * no-op. Dropping those keeps the row to the traits that separate things.
     */
    return [...out.entries()].filter(([, values]) => values.size > 1);
  }, [tokens]);

  /** Whether any trait filter is narrowing the grid right now. */
  const filtering = Object.values(traitFilter).some((v) => v !== "");

  const shown = useMemo(() => {
    const active = Object.entries(traitFilter).filter(([, v]) => v !== "");
    const rows = tokens.filter((t) =>
      active.every(([type, value]) =>
        (t.metadata?.attributes ?? []).some(
          (a) => a.trait_type === type && String(a.value) === value,
        ),
      ),
    );

    const priceOf = (id: bigint) => listings.get(id.toString())?.price;
    return [...rows].sort((a, b) => {
      if (sort === "id-asc") return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      if (sort === "id-desc") return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
      const pa = priceOf(a.id);
      const pb = priceOf(b.id);
      /**
       * Unlisted tokens sort last in both price directions, never first.
       * Treating "no price" as zero would put everything unlisted at the top
       * of "price low", which is the opposite of what the control promises.
       */
      if (pa === undefined && pb === undefined) return a.id > b.id ? -1 : 1;
      if (pa === undefined) return 1;
      if (pb === undefined) return -1;
      const n = pa < pb ? -1 : pa > pb ? 1 : 0;
      return sort === "price-asc" ? n : -n;
    });
  }, [tokens, listings, sort, traitFilter]);

  if (!valid) {
    return (
      <section className="page section market-empty">
        <h2>That isn&rsquo;t a contract address.</h2>
        <p className="muted">A ValueChain address is 0x followed by 40 characters.</p>
        <Link className="btn" href="/collections">
          Back to collections
        </Link>
      </section>
    );
  }

  if (!probing && isErc721 !== true) {
    return (
      <section className="page section market-empty">
        <h2>Nothing tradeable at that address.</h2>
        <p className="muted">
          It doesn&rsquo;t answer as an ERC-721, so this marketplace can&rsquo;t move its tokens.
          ERC-1155 collections exist on ValueChain but aren&rsquo;t supported here yet.
        </p>
        <div className="wrap-row mt-sm">
          <a
            className="btn"
            href={`${deployment.explorer}/address/${raw}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Inspect it on the explorer
          </a>
          <Link className="btn" href="/collections">
            Back to collections
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Collection</p>
          {/*
            The collection's own wordmark in the heading where it has one.

            Still inside the `<h2>`, so the document outline is unchanged and
            the heading keeps an accessible name — the mark carries the
            collection's name as its `aria-label`. Gated on `name` having
            arrived as well as the mark existing: swapping a drawing in for
            "Loading…" would show a finished heading over a page that is still
            reading, which is a worse lie than the placeholder.
          */}
          <h2>
            {name !== undefined && wordmarkFor(collection) !== undefined ? (
              <Wordmark mark={wordmarkFor(collection)!} name={name} />
            ) : (
              (name ?? "Loading…")
            )}
          </h2>
        </div>
        {/* Share and the explorer link belong together: both are ways of
            taking this collection somewhere else. */}
        <div className="wrap-row head-actions">
          <ShareLink title={name ?? undefined} />
          <a
            className="head-link"
            href={`${deployment.explorer}/token/${raw}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            On the explorer &rarr;
          </a>
        </div>
      </div>

      <div
        className="strip-inner"
              >
        <span className="strip-item">
          <b>{symbol ?? "—"}</b> symbol
        </span>
        <span className="strip-item">
          <b>{formatCount(supply as bigint | undefined)}</b> minted
        </span>
        <span className="strip-item">
          {/*
            The collection's own count, not this page's. `listings` above is
            keyed by what is on screen, and reading the figure off it meant a
            collection with six pieces for sale outside the loaded window
            announced "0 listed" while the market was selling them.
          */}
          <b>{formatCount(BigInt(bestListings.size))}</b> listed
        </span>
        <span className="strip-item mono dim">{shortAddress(raw, 6)}</span>
      </div>

      {/*
        Drawn as soon as the collection is known to have more than one piece,
        which is two round trips before the pieces themselves arrive.

        This was gated on `tokens.length > 1`, and `tokens` is the end of the
        ladder: ids, then tokenURIs, then a metadata document each. So the sort
        row appeared seconds after the header above it and shoved the whole grid
        down at the moment somebody had started reading it.

        `supply` comes back in the first multicall, alongside the name and
        symbol already on screen, and answers the same question — is there more
        than one thing here to sort. Until it lands the row is drawn anyway, on
        the assumption that a collection has more than one piece, because nearly
        every one does and being wrong costs a row disappearing on a page with a
        single token on it.
      */}
      {(supply ?? 2n) > 1n ? (
        <div className="coll-controls">
          <div className="wrap-row">
            <Sortie active={sort === "id-desc"} onClick={() => setSort("id-desc")}>
              Newest
            </Sortie>
            <Sortie active={sort === "id-asc"} onClick={() => setSort("id-asc")}>
              Oldest
            </Sortie>
            <Sortie active={sort === "price-asc"} onClick={() => setSort("price-asc")}>
              Price low
            </Sortie>
            <Sortie active={sort === "price-desc"} onClick={() => setSort("price-desc")}>
              Price high
            </Sortie>
          </div>

          {traitOptions.length > 0 ? (
            <div className="coll-traits">
              {traitOptions.map(([type, values]) => (
                <div key={type} className="coll-trait">
                  <span className="coll-trait-label" id={`trait-${type}`}>
                    {type}
                  </span>
                  {/* The count moves out of the label and into `note`, so it
                      stays dim and column-aligned instead of being glued to the
                      value as "VELOCITY (9)". */}
                  <Select
                    label={type}
                    value={traitFilter[type] ?? ""}
                    onChange={(v) => setTraitFilter((f) => ({ ...f, [type]: v }))}
                    options={[
                      { value: "", label: "Any" },
                      ...[...values.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([value, count]) => ({
                          value,
                          label: value,
                          note: String(count),
                        })),
                    ]}
                  />
                </div>
              ))}

              {Object.values(traitFilter).some((v) => v !== "") ? (
                <button type="button" className="filt" onClick={() => setTraitFilter({})}>
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="coll-layout">
        <div className="coll-layout-main">
      {supplyKnown && supply === undefined ? (
        <div className="market-empty">
          <h3>This collection doesn&rsquo;t publish a token list.</h3>
          <p className="muted">
            It&rsquo;s a valid ERC-721 and its tokens can still be traded, but it doesn&rsquo;t
            implement the optional Enumerable extension, so there&rsquo;s no way to walk its
            contents from the chain alone. Open a token directly if you know its id.
          </p>
        </div>
      ) : (!supplyKnown || isLoading || findingIds) && tokens.length === 0 ? (
        <div className="grid-tokens">
          {Array.from({ length: 8 }, (_, i) => (
            <TokenCardSkeleton key={i} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        /*
          Three different nothings, and they used to share one sentence.

          "Nothing matches those traits. Clear a filter to widen the search."
          was shown whenever the grid came out empty — including when no filter
          was set, which is every empty collection. The trait row is built from
          the tokens that loaded, so an empty collection has no filters at all:
          the page was telling people to clear a control that was not on screen.

          Seen on SoDEXTreasureBox the day its boxes were opened. Opening one
          burns it, all 21 went, and `totalSupply` fell to 0 — so the page
          offered a filter to clear on a collection with nothing in it.
        */
        filtering ? (
          <div className="market-empty">
            <h3>Nothing matches those traits.</h3>
            <p className="muted">Clear a filter to widen the search.</p>
          </div>
        ) : supply === 0n ? (
          <div className="market-empty">
            <h3>This collection is empty.</h3>
            {/*
              Both halves, because `totalSupply` cannot tell them apart: it
              counts what exists now, not what has ever existed. A collection
              nobody has minted from and one whose every piece has been burned
              both read 0, and claiming "none minted yet" to the second would
              be wrong in front of somebody who minted them.
            */}
            <p className="muted">
              Nothing has been minted yet — or everything that was has since been burned.
            </p>
          </div>
        ) : (
          <div className="market-empty">
            {/*
              Supply says there are pieces and we could not find their ids. For
              a collection without Enumerable that means the explorer's index
              is the only route to them and it did not answer, which is a
              failure to read rather than a collection with nothing in it.
            */}
            <h3>Couldn&rsquo;t list this collection&rsquo;s pieces.</h3>
            <p className="muted">
              It reports {formatCount(supply as bigint | undefined)} minted, but the token list
              could not be read just now. Try again shortly, or open a piece directly if you know
              its id.
            </p>
          </div>
        )
      ) : (
        <div className="grid-tokens">
          {shown.map((t, i) => (
            <TokenCard
              key={t.id.toString()}
              token={t}
              collection={collection!}
              collectionName={name}
              listing={listings.get(t.id.toString())}
              viewerAddress={viewer}
              /*
                The first row loads eagerly.
                
                `next/image` is lazy by default, and measured on this page that
                meant 0 of 60 images began fetching when their src was set —
                every one waited on an intersection callback, on the row already
                filling the screen. The home page marks its first four; this
                page never did.
              */
              priority={i < 4}
            />
          ))}
        </div>
      )}

      {/*
        What is on screen, and the way to get more of it.

        `ids.length >= limit` is the test for "there is more", and it is doing
        real work: if a press comes back with fewer ids than were asked for,
        the source has given everything it has and the button takes itself
        away. Comparing against `supply` alone would leave it sitting there
        doing nothing for a collection whose explorer index is short of its own
        `totalSupply` — which is exactly the case this page already has a
        paragraph about.

        The count is shown whenever the grid is not the whole collection, with
        or without a button under it, because the sixty-card cap used to be
        completely silent and that was the worse half of the problem.
      */}
      {supply !== undefined && ids.length > 0 && ids.length < Number(supply) ? (
        <div className="coll-more">
          <p className="coll-more-count">
            {/*
              Two different sentences, because a filter changes what the
              numbers mean. Unfiltered, the grid is the first N of the
              collection. Filtered, the grid is what matched *within* the first
              N — and saying "12 of 1,001" there would imply the other 989 had
              been looked at and rejected, when most of them have not been read
              at all. That is the single most misleading thing this line could
              do, so it says outright how far the search got.
            */}
            {filtering ? (
              <>
                Searched <b>{formatCount(BigInt(ids.length))}</b> of{" "}
                <b>{formatCount(supply as bigint)}</b> —{" "}
                <b>{formatCount(BigInt(shown.length))}</b>{" "}
                match so far
              </>
            ) : (
              <>
                Showing <b>{formatCount(BigInt(shown.length))}</b> of{" "}
                <b>{formatCount(supply as bigint)}</b>
              </>
            )}
          </p>
          {ids.length >= limit ? (
            <button
              type="button"
              className="btn"
              onClick={() => setLimit((n) => n + PAGE)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : `Load ${PAGE} more`}
            </button>
          ) : null}
        </div>
      ) : null}
        </div>

        {/*
          The sidebar, and it has to be ONE element.

          This was two children of `.coll-layout` — the mint panel and the
          activity panel — and a two-column grid auto-places a third child in
          row two, column one. So the history landed underneath the entire
          sixty-card grid, and the only way to read it was to scroll past every
          piece in the collection. Wrapped, they share the second column and the
          history sits beside the pieces where it can be found.

          On a phone the wrapper becomes `display: contents`, which dissolves it
          so both are grid children again and can be ordered separately — mint
          above the grid, history below it.
        */}
        {collection !== undefined ? (
          <aside className="coll-side">
            <MintPanel address={collection} />
            {/* Everything that has happened here, not just this page of it —
                the grid is capped at 60 tokens, the history is not. */}
            <Activity collection={collection} title="Collection activity" markBurned />
          </aside>
        ) : null}
      </div>
    </section>
  );
}
