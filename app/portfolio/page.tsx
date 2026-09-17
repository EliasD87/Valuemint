"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount, useBalance, useConnect } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useHoldings } from "@/hooks/useHoldings";
import { OfferInbox } from "@/components/OfferInbox";
import { MyTrades } from "@/components/MyTrades";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { formatSoso } from "@/lib/format";
import "@/styles/home.css";
import { Soso } from "@/components/Soso";

export default function Portfolio() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { tokens: mine, collections, unlistable, isLoading } = useHoldings(address);
  const { data: balance } = useBalance({ address, query: { enabled: address !== undefined } });

  /**
   * There is no "waiting for you" balance any more, and there is nothing to
   * claim.
   *
   * The previous marketplace escrowed a payout whose transfer failed, so this
   * page carried a pendingWithdrawals read and a Claim button. Seaport pays the
   * consideration directly inside the fill - if a payout cannot be delivered the
   * whole sale reverts, so money is never left holding. All three old
   * marketplace contracts were checked before removing this: each holds 0 SOSO.
   */

  /**
   * Accepting an offer changes everything this page reads at once: the piece
   * leaves, its listing dies with it, the offer is consumed and the balance
   * moves. Rather than name four query keys and get one wrong, invalidate the
   * lot — it happens once per sale, not on a timer.
   */
  const queryClient = useQueryClient();
  const afterSale = () => {
    void queryClient.invalidateQueries();
  };

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

      {/*
        Above the grid on purpose: it is the only thing on this page that is
        somebody else's money waiting on a decision. It renders nothing at all
        when no offer stands on anything held, so a quiet portfolio stays quiet.
      */}
      <OfferInbox holdings={mine} onChange={afterSale} />

      {unlistable.length > 0 ? (
        <p className="portfolio-note">
          {/* Reached only when a collection neither enumerates NOR resolves
              through the explorer index — rare now that the fallback exists,
              and a genuine dead end rather than a marketplace limitation. */}
          Pieces you hold in {unlistable.map((c) => c.name).join(", ")} could not be
          identified. {unlistable.length === 1 ? "It doesn't" : "They don't"} publish a
          per-owner index and the explorer has no record of them either. Open the token
          directly by address if you know its number.
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

      {/* Below the holdings, because what you own is the question people come
          to this page with and what you traded is the follow-up. Costs no
          extra requests: the activity scan is global and already running for
          the market, so this is the same rows filtered to one address. */}
      <MyTrades address={address} />

    </section>
  );
}
