"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount, useBalance, useConnect, useReadContract, useWriteContract } from "wagmi";
import { ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { useHoldings } from "@/hooks/useHoldings";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { formatSoso } from "@/lib/format";
import "@/styles/home.css";
import { Soso } from "@/components/Soso";

export default function Portfolio() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { tokens: mine, collections, unlistable, isLoading } = useHoldings(address);
  const { data: balance } = useBalance({ address, query: { enabled: address !== undefined } });

  /** Native SOSO owed from a payout that could not be delivered directly. */
  const { data: pending, refetch: refetchPending } = useReadContract({
    address: deployment.marketplace,
    abi: ValueChainMarketplaceAbi,
    functionName: "pendingWithdrawals",
    args: address === undefined ? undefined : [address],
    query: { enabled: address !== undefined, refetchInterval: 20_000 },
  });

  const { writeContract, isPending: claiming } = useWriteContract();

  const listed = mine.filter((t) => t.listing !== undefined);
  const asking = listed.reduce((sum, t) => sum + (t.listing?.price ?? 0n), 0n);

  /** Group holdings by collection, so a portfolio reads as collections not a wall. */
  const byCollection = useMemo(() => {
    const map = new Map<string, { name: string; address: `0x${string}`; items: typeof mine }>();
    for (const t of mine) {
      const key = t.collection.toLowerCase();
      const entry = map.get(key) ?? { name: t.collectionName, address: t.collection, items: [] };
      entry.items.push(t);
      map.set(key, entry);
    }
    return [...map.values()];
  }, [mine]);

  if (!isConnected) {
    return (
      <section className="page section market-empty">
        <p className="eyebrow">Portfolio</p>
        <h2>Connect your wallet to see what you hold.</h2>
        <p className="muted">
          Holdings are read straight from every collection on the chain — nothing is stored on our
          side.
        </p>
        <button
          className="btn btn-primary btn-lg"
          disabled={isPending}
          onClick={() => {
            const injected = connectors.find((c) => c.id === "injected");
            if (injected !== undefined) connect({ connector: injected });
          }}
        >
          {isPending ? "Check your wallet…" : "Connect wallet"}
        </button>
      </section>
    );
  }

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h2>What you hold</h2>
        </div>
      </div>

      <div className="stats-row">
        <span className="strip-item">
          <b>{mine.length}</b> pieces
        </span>
        <span className="strip-item">
          <b>{byCollection.length}</b> collections
        </span>
        <span className="strip-item">
          <b>{listed.length}</b> listed
        </span>
        <span className="strip-item">
          <Soso size={16}>
            <b>{formatSoso(asking)}</b>
          </Soso>{" "}
          asking
        </span>
        <span className="strip-item">
          <Soso size={16}>
            <b>{formatSoso(balance?.value)}</b>
          </Soso>{" "}
          balance
        </span>
      </div>

      {pending !== undefined && (pending as bigint) > 0n ? (
        <div className="portfolio-pending">
          <div>
            <strong>{formatSoso(pending as bigint)} SOSO is waiting for you.</strong>
            <p className="muted">
              A sale paid out to you but the transfer could not be delivered directly, so the
              marketplace is holding it. Nobody else can claim it.
            </p>
          </div>
          <button
            className="btn btn-primary"
            disabled={claiming}
            onClick={() => {
              writeContract({
                address: deployment.marketplace,
                abi: ValueChainMarketplaceAbi,
                functionName: "withdraw",
              });
              void refetchPending();
            }}
          >
            {claiming ? "Claiming…" : "Claim it"}
          </button>
        </div>
      ) : null}

      {unlistable.length > 0 ? (
        <p className="portfolio-note">
          You hold pieces in {unlistable.map((c) => c.name).join(", ")}, but{" "}
          {unlistable.length === 1 ? "it doesn't" : "they don't"} publish a per-owner index, so they
          can&rsquo;t be listed here. Open the collection directly to find them.
        </p>
      ) : null}

      {isLoading && mine.length === 0 ? (
        <div className="grid-tokens">
          {Array.from({ length: 6 }, (_, i) => (
            <TokenCardSkeleton key={i} />
          ))}
        </div>
      ) : mine.length === 0 ? (
        <div className="market-empty">
          <h3>You don&rsquo;t hold anything yet.</h3>
          <p className="muted">
            Checked all {collections.length} collection{collections.length === 1 ? "" : "s"} on
            ValueChain and found nothing under your address.
          </p>
          <div className="wrap-row mt-md">
            <Link className="btn btn-primary" href="/mint">
              Mint something
            </Link>
            <Link className="btn" href="/create">
              Create a collection
            </Link>
          </div>
        </div>
      ) : (
        <div className="stack stack-lg">
          {byCollection.map((group) => (
            <div key={group.address}>
              <div className="head head-sub">
                <div>
                  <p className="eyebrow eyebrow-dim">{group.items.length} held</p>
                  <h3>{group.name}</h3>
                </div>
                <Link className="head-link" href={`/collection/${group.address}`}>
                  View collection &rarr;
                </Link>
              </div>

              <div className="grid-tokens">
                {group.items.map((t) => (
                  <TokenCard
                    key={`${t.collection}-${t.id}`}
                    token={t}
                    collection={t.collection}
                    listing={t.listing}
                    owner={t.owner}
                    viewerAddress={address}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
