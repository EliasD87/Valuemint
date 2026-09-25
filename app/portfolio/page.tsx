"use client";

import { useMemo } from "react";
import { PortfolioHeader } from "@/components/PortfolioHeader";
import { valueAtFloor } from "@/lib/portfolioValue";
import Link from "next/link";
import { useAccount, useBalance } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useHoldings } from "@/hooks/useHoldings";
import { OfferInbox } from "@/components/OfferInbox";
import { PortfolioActivity } from "@/components/PortfolioActivity";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { TokenCardSkeleton } from "@/components/TokenCard";
import { useFloors } from "@/hooks/useFloors";
import { floorForTier } from "@/lib/floors";
import { CREATE_ENABLED } from "@/config/features";
import "@/styles/home.css";
import "@/styles/portfolio.css";
import { ConnectButton } from "@/components/ConnectButton";

export default function Portfolio() {
  const { address, isConnected } = useAccount();
  const {
    tokens: mine,
    collections,
    unlistable,
    pending,
    expected,
    isDiscovering,
    isLoading,
  } = useHoldings(address);
  const { data: balance } = useBalance({ address, query: { enabled: address !== undefined } });

  /**
   * Floors, for "what is this worth" on a piece that is not for sale.
   *
   * Costs no extra scan: `useFloors` is built on `useListingFeed`, and React
   * Query collapses the identical key against the order book this page already
   * reads for its own listings.
   */
  const { floorFor, tierRowsFor, isLoading: floorsLoading } = useFloors();

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

  /**
   * Every piece at its floor, by the same rule its card uses.
   *
   * Withheld until the floors and the first holdings have landed: a total
   * summed from half-loaded data is a number that is confidently wrong for a
   * second and then jumps, and a placeholder says "counting" honestly.
   */
  const nfts =
    floorsLoading || (isLoading && mine.length === 0)
      ? undefined
      : valueAtFloor(mine, (t) =>
          floorForTier(t.tier, tierRowsFor(t.collection), floorFor(t.collection)),
        );

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
        <ConnectButton>Connect wallet</ConnectButton>
      </section>
    );
  }

  return (
    <section className="page section">
      {/*
        Two columns from the very top.

        What you traded used to sit at the very bottom, under every card in
        every collection — so a wallet holding fifty pieces had to scroll past
        all fifty to reach it, and nobody did. It is a panel beside the pieces
        now, and it starts level with the portfolio header rather than under
        it: the header shares the top row with it instead of spanning the page.
      */}
      <div className="pf-layout">
        <div className="pf-main">
      {/* The page's heading lives inside the header, beside whose it is. */}
      {address === undefined ? null : (
        <PortfolioHeader
          address={address}
          pieces={mine.length}
          collections={byCollection.length}
          listed={listed.length}
          asking={asking}
          {...(balance?.value === undefined ? {} : { balance: balance.value })}
          {...(nfts === undefined ? {} : { nfts })}
        />
      )}

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
            {CREATE_ENABLED ? (
              <Link className="btn" href="/create">
                Create a collection
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="stack stack-lg">
          {byCollection.map((group) => (
            <HoldingsGroup
              key={group.address}
              group={group}
              viewer={address}
              floorFor={floorFor}
              tierRowsFor={tierRowsFor}
            />
          ))}
        </div>
      )}

      {/*
        Say that more is coming, rather than ending the grid and hoping.

        Collections without an Enumerable index are found by scanning Transfer
        logs, which takes seconds — so a wallet holding pieces in one of them
        sees a complete-looking portfolio, and then the activity table under it
        as if that were the end. It is not: the cards arrive afterwards. The
        balances are known long before the ids are, so the count is real and
        not a guess.
      */}
      {isDiscovering && mine.length > 0 ? (
        <div className="portfolio-more">
          <p className="portfolio-more-note">
            <span className="portfolio-more-dot" aria-hidden="true" />
            Still finding your pieces &mdash;{" "}
            <b>
              {mine.length} of {expected}
            </b>{" "}
            so far
            {pending.length > 0 ? <>, reading {pending.map((c) => c.name).join(", ")}</> : null}.
          </p>

          <div className="grid-tokens" aria-hidden="true">
            {Array.from(
              { length: Math.min(4, Math.max(1, expected - mine.length)) },
              (_, i) => (
                <TokenCardSkeleton key={i} />
              ),
            )}
          </div>
        </div>
      ) : null}

        </div>

        {/* Beside the holdings, not under them. What you own is the question
            people come to this page with and what you traded is the follow-up —
            a follow-up still has to be reachable. Costs no extra requests: the
            activity scan is global and already running for the market, so this
            is the same rows filtered to one address. */}
        <aside className="pf-side">
          {/* Trades and standing offers in one panel with a switch, rather than
              two stacked ones. See `PortfolioActivity`. */}
          <PortfolioActivity address={address} />
        </aside>
      </div>
    </section>
  );
}
