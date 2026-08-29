"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useReadContracts } from "wagmi";
import { ValueChainCollectionAbi } from "@/config/contracts";
import { useRegistry } from "@/hooks/useRegistry";
import { useDiscoveredCollections } from "@/hooks/useDiscovery";
import { formatCount, formatSoso, shortAddress } from "@/lib/format";
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
 */
export default function Mint() {
  const { collections: fromFactory } = useRegistry(48);
  const { data: discovered } = useDiscoveredCollections();
  const { artFor } = useCollectionArt();

  const all = useMemo(() => {
    const byAddress = new Map<string, { address: `0x${string}`; name: string; symbol: string }>();
    for (const c of discovered ?? [])
      byAddress.set(c.address.toLowerCase(), { address: c.address, name: c.name, symbol: c.symbol });
    for (const c of fromFactory)
      byAddress.set(c.collection.toLowerCase(), {
        address: c.collection,
        name: c.name,
        symbol: c.symbol,
      });
    return [...byAddress.values()];
  }, [discovered, fromFactory]);

  const { data } = useReadContracts({
    contracts: all.flatMap((c) => [
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "publicMintEnabled" as const },
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "mintPrice" as const },
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "publicMintRemaining" as const },
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "totalSupply" as const },
      { address: c.address, abi: ValueChainCollectionAbi, functionName: "maxSupply" as const },
    ]),
    query: { enabled: all.length > 0, refetchInterval: 15_000 },
  });

  const rows = all.map((c, i) => {
    const at = <T,>(n: number): T | undefined => {
      const e = data?.[i * 5 + n];
      return e?.status === "success" ? (e.result as T) : undefined;
    };
    return {
      ...c,
      open: at<boolean>(0),
      price: at<bigint>(1),
      remaining: at<bigint>(2),
      supply: at<bigint>(3),
      max: at<bigint>(4),
    };
  });

  const minting = rows.filter((r) => r.open === true);
  const closed = rows.filter((r) => r.open !== true);

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Mint</p>
          <h2>Collections open right now</h2>
        </div>
        <Link className="btn btn-primary" href="/create">
          Open your own mint
        </Link>
      </div>

      {minting.length === 0 ? (
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
                { label: "Price", value: `${formatSoso(c.price)} SOSO` },
                { label: "Available", value: formatCount(c.remaining) },
                {
                  label: "Minted",
                  value:
                    formatCount(c.supply) +
                    (c.max !== undefined && c.max > 0n ? ` / ${formatCount(c.max)}` : ""),
                },
              ]}
            />
          ))}
        </div>
      )}

      {closed.length > 0 ? (
        <>
          <div className="head head-sub">
            <div>
              <p className="eyebrow eyebrow-dim">Not minting</p>
              <h2>Closed, but still tradeable</h2>
            </div>
          </div>
          <div className="coll-grid">
            {closed.map((c) => (
              <CollectionCard
                key={c.address}
                href={`/collection/${c.address}`}
                name={c.name}
                symbol={c.symbol}
                address={c.address}
                images={artFor(c.address)}
                stats={[
                  {
                    label: "Minted",
                    value:
                      formatCount(c.supply) +
                      (c.max !== undefined && c.max > 0n ? ` / ${formatCount(c.max)}` : ""),
                  },
                ]}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
