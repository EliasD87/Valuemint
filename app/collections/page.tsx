"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReadContracts } from "wagmi";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { useRegistry } from "@/hooks/useRegistry";
import { useCollectionProbe, useDiscoveredCollections } from "@/hooks/useDiscovery";
import { formatCount, formatSoso, shortAddress } from "@/lib/format";
import { CollectionCard, CollectionCardSkeleton } from "@/components/CollectionCard";
import { useCollectionArt } from "@/hooks/useCollectionArt";
import "@/styles/collections.css";
import { useFloors } from "@/hooks/useFloors";

export default function Collections() {
  const router = useRouter();
  const { collections: fromFactory } = useRegistry(48);
  const { data: discovered, isLoading, error } = useDiscoveredCollections();
  const [paste, setPaste] = useState("");
  const probe = useCollectionProbe(paste);
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

    return [...byAddress.values()];
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

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Collections</p>
          <h2>Every NFT collection on ValueChain</h2>
        </div>
        <Link className="btn btn-primary" href="/create">
          Create yours
        </Link>
      </div>

      <p className="coll-intro muted">
        Discovered from the chain itself, not a curated list. The marketplace trades any NFT
        on ValueChain — single pieces and editions alike — including collections that were
        never deployed through here.
      </p>

      {/* --- trade anything, indexed or not ------------------------------ */}
      <div className="coll-import card">
        <div className="field">
          <label htmlFor="paste">Have a collection the list is missing?</label>
          <div className="coll-import-row">
            <input
              id="paste"
              className="input"
              placeholder="0x… contract address"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              spellCheck={false}
            />
            <button
              className="btn btn-primary"
              disabled={!probe.isErc721 || probe.address === undefined}
              onClick={() => router.push(`/collection/${probe.address}`)}
            >
              Open
            </button>
          </div>
          <span className="field-hint">
            {paste.trim() === ""
              ? "The explorer indexes new contracts slowly. Paste an address to go straight there."
              : !probe.looksLikeAddress
                ? "That isn't a contract address — it should be 0x followed by 40 characters."
                : probe.checking
                  ? "Checking the contract…"
                  : probe.isErc721
                    ? `${probe.name ?? "Collection"} (${probe.symbol ?? "?"}) — tradeable ERC-721.`
                    : "That address doesn't answer as an ERC-721. Editions are found through the list above rather than pasted here."}
          </span>
        </div>
      </div>

      {error !== null ? (
        <p className="coll-warn">
          The block explorer&rsquo;s token list is unavailable right now, so only collections from
          the factory are shown. You can still open any collection by pasting its address above.
        </p>
      ) : null}

      {isLoading && all.length === 0 ? (
        <div className="coll-grid">
          {Array.from({ length: 3 }, (_, i) => (
            <CollectionCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="coll-grid">
          {all.map((c, i) => {
            const s = statsFor(i);

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
                  {
                    label: "Mint price",
                    value: s.mintPrice === undefined ? "—" : `${formatSoso(s.mintPrice)} SOSO`,
                  },
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
          })}
        </div>
      )}

      <div className="coll-cta card">
        <div>
          <h3>Yours could be here.</h3>
          <p className="muted">
            Deploying a collection costs gas and nothing else. You own the contract outright — the
            factory keeps a record and no control over it.
          </p>
        </div>
        <Link className="btn btn-primary btn-lg" href="/create">
          Create a collection
        </Link>
      </div>
    </section>
  );
}
