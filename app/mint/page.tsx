"use client";

import Link from "next/link";
import { useAllCollections } from "@/hooks/useAllCollections";
import { mintIndexState } from "@/lib/mintIndex";
import { formatCount, formatSoso } from "@/lib/format";
import { CollectionCard, CollectionCardSkeleton } from "@/components/CollectionCard";
import { useCollectionArt } from "@/hooks/useCollectionArt";
import "@/styles/collections.css";
import "@/styles/home.css";

/**
 * Every collection currently open for minting, across the whole chain.
 *
 * This page used to be Genesis's own mint. That was wrong: the marketplace hosts
 * collections rather than being one, so the mint action belongs on each
 * collection's page and this is the index of what is open right now.
 *
 * It also used to merge and read the chain itself, in its own private copy of
 * what `useAllCollections` already does. Four things came of that, and only the
 * last one was reported:
 *
 *   - it never saw `known.ts`, so a collection the explorer has not indexed and
 *     the factory did not make was missing from the index of what is minting;
 *   - it did not filter `hidden.ts`, so the two test collections would have
 *     appeared here the moment either opened minting — the one listing on the
 *     site that did not honour that list;
 *   - it issued a SECOND multicall over the same contracts, keyed differently
 *     (five calls per collection against six), so it shared no cache with the
 *     home page's warm fetch or with /collections and paid for the whole read
 *     again on arrival. That is most of "sometimes it loads after a long time";
 *   - and it had no loading state at all. See below.
 */
export default function Mint() {
  const { collections, isLoading, statePending } = useAllCollections();

  const minting = collections.filter((c) => c.publicMintEnabled === true);

  /**
   * "Nothing is minting" and "we do not know yet" are different sentences, and
   * the page said the first one for both. The rule and the reasoning live in
   * `lib/mintIndex.ts`, with tests, because what was wrong here was a missing
   * distinction rather than a rendering mistake.
   *
   * The skeletons below were already imported before any of this. Nothing ever
   * rendered them.
   */
  const state = mintIndexState({
    listLoading: isLoading,
    statePending,
    known: collections.length,
    open: minting.length,
  });

  /**
   * The cover thumbnails, and only once the cards are readable.
   *
   * Everything on a card except its pictures comes from a single multicall that
   * lands in about half a second. The pictures come from a ladder — the
   * order-book log scan, then supply, then ids, then tokenURIs, then a metadata
   * document each — that cannot overlap itself because every rung needs the one
   * above, and several of those documents are served by a host that answers 501
   * after half a second. Measured cold on the live site: cards at 5,357ms with
   * chain work still going at 7,123ms.
   *
   * Starting that ladder only once `state === "list"` means the page shows what
   * is minting first and fills the pictures in behind it. Nothing is lost — the
   * covers arrive exactly as before, just after the facts instead of in front
   * of them.
   */
  const { artFor } = useCollectionArt(undefined, state === "list");

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Mint</p>
          <h2>Collections open right now</h2>
        </div>
      </div>

      {state === "settling" ? (
        <div className="coll-grid" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <CollectionCardSkeleton key={i} />
          ))}
        </div>
      ) : state === "empty" ? (
        <div className="market-empty">
          <h3>Nothing is minting at the moment.</h3>
          <p className="muted">
            A collection appears here as soon as its owner opens public minting. If you deployed
            one, open it from its own page.
          </p>
          <Link className="btn btn-primary mt-sm" href="/collections">
            Browse collections
          </Link>
        </div>
      ) : (
        <div className="coll-grid">
          {minting.map((c) => (
            <CollectionCard
              key={c.address}
              href={`/collection/${c.address}`}
              name={c.name}
              symbol={c.symbol}
              address={c.address}
              images={artFor(c.address)}
              badge={<span className="chip chip-up">Minting</span>}
              stats={[
                { label: "Price", value: `${formatSoso(c.mintPrice)} SOSO` },
                { label: "Available", value: formatCount(c.publicMintRemaining) },
                {
                  label: "Minted",
                  value:
                    formatCount(c.totalSupply) +
                    (c.maxSupply !== undefined && c.maxSupply > 0n
                      ? ` / ${formatCount(c.maxSupply)}`
                      : ""),
                },
              ]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
