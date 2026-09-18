"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { ERC721_INTERFACE_ID, enumerableAbi, erc165Abi } from "@/config/erc721";
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
export function CollectionView({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = use(params);
  const { address: viewer } = useAccount();

  const valid = /^0x[0-9a-fA-F]{40}$/.test(raw);
  const collection = valid ? (raw as `0x${string}`) : undefined;
  const base = { address: collection, abi: erc721Abi } as const;

  /**
   * Everything the page needs before it can ask for anything else, in ONE call.
   *
   * These were three hooks — a `supportsInterface` probe, a name/symbol pair,
   * and `totalSupply` — and wagmi gave each its own round trip. Nothing about
   * them is sequential; each simply waited its turn. Measured on the live site,
   * the collection page spent 312 ms to 3,504 ms in nine serial RPC round trips
   * of roughly 320 ms each, and the first metadata request did not go out until
   * 3,629 ms. Artwork cannot appear before the reads that name it, so that
   * waterfall WAS the loading time.
   *
   * One `useReadContracts` is one multicall is one round trip. Three waves
   * become one, and the reads that genuinely do depend on this one start about
   * 700 ms earlier.
   *
   * `retry: false` because a collection that is not an ERC-721, or has no
   * `totalSupply`, must fail fast — those reverts are answers, not errors.
   */
  const {
    data: basics,
    isLoading: probing,
    isFetched: supplyKnown,
  } = useReadContracts({
    contracts: [
      {
        address: collection,
        abi: erc165Abi,
        functionName: "supportsInterface" as const,
        args: [ERC721_INTERFACE_ID],
      },
      { ...base, functionName: "name" as const },
      { ...base, functionName: "symbol" as const },
      { address: collection, abi: enumerableAbi, functionName: "totalSupply" as const },
    ],
    query: { enabled: collection !== undefined, retry: false },
  });

  const isErc721 = basics?.[0]?.status === "success" ? (basics[0].result as boolean) : undefined;
  const name = basics?.[1]?.status === "success" ? (basics[1].result as string) : undefined;
  const symbol = basics?.[2]?.status === "success" ? (basics[2].result as string) : undefined;

  /**
   * `totalSupply` belongs to the Enumerable extension, which is optional.
   *
   * Whether the read has LANDED matters as much as its value. `supply ===
   * undefined` means both "the call has not come back" and "this contract has
   * no totalSupply", and the page told the visitor the second before it could
   * possibly know: the first paint of every collection read "This collection
   * doesn't publish a token list", then replaced itself with the grid a second
   * later. `supplyKnown` is the multicall's `isFetched`, which is exactly the
   * same signal it was when this was its own hook.
   */
  const supply = basics?.[3]?.status === "success" ? (basics[3].result as bigint) : undefined;

  // Cap the first page; a large collection should not fire thousands of reads.
  const { ids, isLoading: findingIds } = useTokenIds(collection, supply, 60);

  const { tokens, isLoading } = useGenericTokens(collection, ids);

  /**
   * Listings for this collection, from the shared Seaport scan.
   *
   * This used to be one `getListing` call per id on screen - sixty reads to
   * discover that most of a collection is not for sale. Seaport announces each
   * order once, so the whole market is already in memory and this is a lookup.
   */
  const { best: bestListings } = useBestListings(collection);

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
  for (const id of ids) {
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
          <h2>{name ?? "Loading…"}</h2>
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
          <b>{listings.size}</b> listed
        </span>
        <span className="strip-item mono dim">{shortAddress(raw, 6)}</span>
      </div>

      {/* Only worth drawing once there is something to sort or filter. */}
      {tokens.length > 1 ? (
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
                <label key={type} className="coll-trait">
                  <span className="coll-trait-label">{type}</span>
                  <select
                    value={traitFilter[type] ?? ""}
                    onChange={(e) =>
                      setTraitFilter((f) => ({ ...f, [type]: e.target.value }))
                    }
                  >
                    <option value="">Any</option>
                    {[...values.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([value, count]) => (
                        <option key={value} value={value}>
                          {value} ({count})
                        </option>
                      ))}
                  </select>
                </label>
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
        // A filter that matches nothing has to say so, or the page reads as broken.
        <div className="market-empty">
          <h3>Nothing matches those traits.</h3>
          <p className="muted">Clear a filter to widen the search.</p>
        </div>
      ) : (
        <div className="grid-tokens">
          {shown.map((t) => (
            <TokenCard
              key={t.id.toString()}
              token={t}
              collection={collection!}
              collectionName={name}
              listing={listings.get(t.id.toString())}
              viewerAddress={viewer}
            />
          ))}
        </div>
      )}
        </div>

        {collection !== undefined ? <MintPanel address={collection} /> : null}

        {/* Everything that has happened in this collection, not just this page of
            it - the grid is capped at 60 tokens, the history is not. */}
        {collection !== undefined ? (
          <Activity collection={collection} title="Collection activity" standalone />
        ) : null}
      </div>
    </section>
  );
}
