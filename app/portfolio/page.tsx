"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useBalance, useConnect } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useHoldings } from "@/hooks/useHoldings";
import type { ChainToken } from "@/hooks/useEverything";
import { OfferInbox } from "@/components/OfferInbox";
import { MyTrades } from "@/components/MyTrades";
import { BulkList } from "@/components/BulkList";
import { TokenCard, TokenCardSkeleton } from "@/components/TokenCard";
import { useGridColumns } from "@/hooks/useGridColumns";
import { CREATE_ENABLED } from "@/config/features";
import { formatSoso } from "@/lib/format";
import "@/styles/home.css";
import "@/styles/portfolio.css";
import { Soso } from "@/components/Soso";

export default function Portfolio() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
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

      {/*
        Two columns from here down.

        What you traded used to sit at the very bottom, under every card in
        every collection — so a wallet holding fifty pieces had to scroll past
        all fifty to reach it, and nobody did. It is a panel of ten rows beside
        the pieces now, visible without scrolling at all, in the same place the
        collection page keeps its own history.
      */}
      <div className="pf-layout">
        <div className="pf-main">
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
            <Holdings key={group.address} group={group} viewer={address} />
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
          <MyTrades address={address} />
        </aside>
      </div>
    </section>
  );
}

/** One collection's worth of what this wallet holds. */
interface Group {
  name: string;
  address: `0x${string}`;
  items: ChainToken[];
}

/**
 * A collection's pieces, one row deep until asked for more.
 *
 * A wallet holding sixty pieces of one collection turned this page into sixty
 * cards of scrolling before the next collection was reachable at all, so the
 * thing most people open it for — what do I hold, across everything — was the
 * thing the layout made hardest. One row each means the whole portfolio fits in
 * a screen or two whatever is in it, and the rest is one press away.
 *
 * A row is however many cards the grid is drawing at this width, read from the
 * grid itself rather than guessed from a breakpoint — see `useGridColumns`. A
 * guess would clip a row short or spill onto a second one, and would be wrong
 * again the next time the stylesheet moved.
 */
function Holdings({ group, viewer }: { group: Group; viewer: `0x${string}` | undefined }) {
  const grid = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(grid);
  const [expanded, setExpanded] = useState(false);

  /**
   * Four until the grid has been measured.
   *
   * The measurement is a layout effect and lands before paint, so this is
   * normally never seen — but it is the answer if `ResizeObserver` or
   * `getComputedStyle` gives nothing, and content must never depend on a
   * mechanism that might not run. Four is one row on a desktop; being wrong
   * costs a row that is short or long, not an empty page.
   */
  const perRow = columns > 0 ? columns : 4;
  const shown = expanded ? group.items : group.items.slice(0, perRow);
  const hidden = group.items.length - shown.length;

  return (
    <div>
      <div className="head head-sub">
        <div>
          <p className="eyebrow eyebrow-dim">{group.items.length} held</p>
          <h3>{group.name}</h3>
        </div>
        <Link className="head-link" href={`/collection/${group.address}`}>
          View collection &rarr;
        </Link>
      </div>

      {/*
        Only the unlisted ones, and only where there is more than one.
        Re-listing something already up would put two live orders on one token
        at two prices, and a buyer takes the cheaper — so the pieces already for
        sale are deliberately not offered here.

        Deliberately the whole group and not the visible row: bulk listing is
        about everything held here, and collapsing the grid is a reading
        convenience that must not quietly change what a button acts on.
      */}
      <BulkList
        collection={group.address}
        collectionName={group.name}
        items={group.items
          .filter((t) => t.listing === undefined)
          .map((t) => ({ id: t.id, tier: t.tier }))}
      />

      <div className="grid-tokens" ref={grid}>
        {shown.map((t) => (
          <TokenCard
            key={`${t.collection}-${t.id}`}
            token={t}
            collection={t.collection}
            listing={t.listing}
            owner={t.owner}
            viewerAddress={viewer}
          />
        ))}
      </div>

      {hidden > 0 || expanded ? (
        <div className="pf-more-row">
          {/* The button names the total rather than the remainder: "Show all
              1000" is what somebody is deciding about, and a second label
              saying "997 more" beside it was the same fact twice. */}
          <button
            type="button"
            className="btn btn-sm pf-more"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Show fewer" : `Show all ${group.items.length}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
