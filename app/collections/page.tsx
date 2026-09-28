"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useReadContracts } from "wagmi";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { MAIN_COLLECTIONS, PINNED_COLLECTIONS } from "@/config/featured";
import { CREATE_ENABLED } from "@/config/features";
import { useRegistry } from "@/hooks/useRegistry";
import { useDiscoveredCollections } from "@/hooks/useDiscovery";
import { formatCount, formatSoso, shortAddress } from "@/lib/format";
import { CollectionCard, CollectionCardSkeleton } from "@/components/CollectionCard";
import { useCollectionArt } from "@/hooks/useCollectionArt";
import "@/styles/collections.css";
import { useFloors } from "@/hooks/useFloors";

export default function Collections() {
  const { collections: fromFactory } = useRegistry(48);
  const { data: discovered, isLoading, error } = useDiscoveredCollections();

  /**
   * "See more": everything not in `MAIN_COLLECTIONS`, revealed in place. The
   * explorer finds every ERC-721 on the chain, so this list only grows, and
   * most of what arrives is not what anyone came looking for.
   */
  const [showAll, setShowAll] = useState(false);
  const { artFor } = useCollectionArt();
  const { floorFor } = useFloors();

  /**
   * The explorer's list and the factory's registry overlap and each misses things
   * the other has: the explorer is slow to index new contracts, and the factory
   * only knows what was made here. Merged, keyed by address.
   */
  const all = useMemo(() => {
    const byAddress = new Map<
      string,
      { address: `0x${string}`; name: string; symbol: string; creator?: string; fromFactory: boolean }
    >();

    for (const c of discovered ?? []) {
      byAddress.set(c.address.toLowerCase(), {
        address: c.address,
        name: c.name,
        symbol: c.symbol,
        fromFactory: false,
      });
    }

    for (const c of fromFactory) {
      const key = c.collection.toLowerCase();
      byAddress.set(key, {
        address: c.collection,
        name: c.name,
        symbol: c.symbol,
        creator: c.creator,
        fromFactory: true,
      });
    }

    /**
     * Pinned first, everything else in the order it arrived.
     *
     * `byAddress` is insertion-ordered, so without this the page opens with
     * whatever the explorer happened to return first — which was the two test
     * contracts. See `PINNED_COLLECTIONS` for why this is a named list rather
     * than a ranking.
     */
    const rank = (address: string) => {
      const i = PINNED_COLLECTIONS.findIndex(
        (pinned) => pinned.toLowerCase() === address.toLowerCase(),
      );
      return i === -1 ? PINNED_COLLECTIONS.length : i;
    };

    return [...byAddress.values()].sort((a, b) => rank(a.address) - rank(b.address));
  }, [discovered, fromFactory]);

  const { data } = useReadContracts({
    contracts: all.flatMap((c) => [
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "totalSupply" as const },
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "maxSupply" as const },
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "mintPrice" as const },
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "publicMintEnabled" as const },
    ]),
    query: { enabled: all.length > 0, refetchInterval: 20_000 },
  });

  const isMain = (address: string) => MAIN_COLLECTIONS.some((m) => m.toLowerCase() === address.toLowerCase());
  const main = all.filter((c) => isMain(c.address));
  const more = all.filter((c) => !isMain(c.address));

  const statsFor = (i: number) => {
    const at = (n: number) => {
      const entry = data?.[i * 4 + n];
      return entry?.status === "success" ? entry.result : undefined;
    };
    return {
      totalSupply: at(0) as bigint | undefined,
      maxSupply: at(1) as bigint | undefined,
      mintPrice: at(2) as bigint | undefined,
      open: at(3) as boolean | undefined,
    };
  };

  /** One card, drawn the same in the main grid and under See more. */
  const card = (c: (typeof all)[number]) => {
    const s = statsFor(all.indexOf(c));

    return (
      <CollectionCard
        key={c.address}
        // Every collection opens its own page. The first one used to
        // link to "/" instead, from when the home page *was* that
        // collection - so on a marketplace listing five collections,
        // clicking one of them silently dumped you back on Explore.
        href={`/collection/${c.address}`}
        name={c.name}
        symbol={c.symbol}
        address={c.address}
        images={artFor(c.address)}
        badge={s.open === true ? <span className="chip chip-up">Minting</span> : null}
        stats={[
          {
            label: "Minted",
            value:
              formatCount(s.totalSupply) +
              (s.maxSupply !== undefined && s.maxSupply > 0n
                ? ` / ${formatCount(s.maxSupply)}`
                : ""),
          },
          /* Only where there is one. A collection minted elsewhere
             has no price this marketplace can read, and a column of
             dashes under "Mint price" said nothing on every card
             that had it. The row closes up around the gap. */
          ...(s.mintPrice === undefined
            ? []
            : [{ label: "Mint price", value: `${formatSoso(s.mintPrice)} SOSO` }]),
          {
            label: "Floor",
            /**
             * Undefined means nothing is listed, which is not the same as free -
             * hence the dash rather than a 0.
             */
            value:
              floorFor(c.address) === undefined
                ? "—"
                : `${formatSoso(floorFor(c.address)!)} SOSO`,
          },
          { label: "Origin", value: c.fromFactory ? "ValueMint" : "External" },
        ]}
      />
    );
  };

  return (
    <section className="page section">
      <div className="head">
        <div>
          {/* The label is the heading; see `.head h2.eyebrow` in global.css. */}
          <h2 className="eyebrow">Collections</h2>
        </div>
        {CREATE_ENABLED ? (
          <Link className="btn btn-primary" href="/create">
            Create yours
          </Link>
        ) : null}
      </div>

      <p className="coll-intro muted">
        Discovered from the chain itself, not a curated list. The marketplace trades any NFT
        on ValueChain — single pieces and editions alike — including collections that were
        never deployed through here.
      </p>

      {error !== null ? (
        <p className="coll-warn">
          {/*
            No longer "paste its address above". That box was removed from this
            page, and the sentence outlived it — a message telling somebody to
            use a control that is not there is worse than no message, because it
            reads as the page being broken in a second way.

            What is left is true and complete: the factory's own collections are
            unaffected, the missing ones are only those the explorer indexed,
            and nothing about the shortfall is permanent. The way out it points
            at is the header search, which takes an address and opens the
            collection at it — that still exists.
          */}
          The block explorer&rsquo;s token list is unavailable right now, so this shows only the
          collections deployed through ValueMint. Others are still tradeable &mdash; search an
          address to open one &mdash; and they reappear here as soon as the explorer answers
          again.
        </p>
      ) : null}

      {isLoading && all.length === 0 ? (
        <div className="coll-grid">
          {Array.from({ length: 3 }, (_, i) => (
            <CollectionCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="coll-grid">{main.map(card)}</div>

          {more.length === 0 ? null : (
            <>
              {showAll ? <div className="coll-grid coll-grid-more">{more.map(card)}</div> : null}
              <div className="coll-more">
                <button type="button" className="btn" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                  {showAll ? "Show fewer" : `See more (${more.length})`}
                </button>
              </div>
            </>
          )}
        </>
      )}

    </section>
  );
}
