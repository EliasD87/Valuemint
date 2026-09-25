"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { useAccount, useBalance } from "wagmi";
import { useHoldings } from "@/hooks/useHoldings";
import { useFloors } from "@/hooks/useFloors";
import { floorForTier } from "@/lib/floors";
import { valueAtFloor } from "@/lib/portfolioValue";
import { PortfolioHeader } from "@/components/PortfolioHeader";
import { PortfolioActivity } from "@/components/PortfolioActivity";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { TokenCardSkeleton } from "@/components/TokenCard";
import { ShareLink } from "@/components/ShareLink";
import { HoldingsScan } from "@/components/HoldingsScan";
import { deployment } from "@/config/contracts";
import { shortAddress } from "@/lib/format";
import "@/styles/home.css";
import "@/styles/portfolio.css";

/**
 * Everything one address holds on ValueChain — the search result.
 *
 * The same view `/portfolio` gives you of your own wallet, for anybody's,
 * which is the point: a marketplace where you can only see your own holdings
 * makes it impossible to check who you are trading with, or to follow a
 * collector whose taste you rate.
 *
 * ---
 *
 * **It is /portfolio's layout now, read-only.** It used to be an address, two
 * bare counts and one flat grid of every card the wallet held — a hundred
 * pieces of one collection before the next was reachable, and no sign of
 * what the wallet had done. It now shares the portfolio's parts: the header
 * (balance first, then pieces, listed, at-floor), one row per collection with
 * "Show all", and trades and offers beside them.
 *
 * `own` is what keeps it read-only. It is true only when the connected wallet
 * IS this address, and it turns off the things only a holder can act on or
 * should be asked: bulk listing, withdrawing offers, "where is my SOSO". Every
 * figure is read for the address in the URL, never for the viewer.
 */
export default function AddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: raw } = use(params);
  const valid = /^0x[0-9a-fA-F]{40}$/.test(raw);
  const target = valid ? (raw as `0x${string}`) : undefined;

  const { address: viewer } = useAccount();
  const { tokens, collections, unlistable, pending, expected, isDiscovering, isLoading } =
    useHoldings(target);
  const { data: balance } = useBalance({
    address: target,
    query: { enabled: target !== undefined },
  });
  const { floorFor, tierRowsFor, isLoading: floorsLoading } = useFloors();

  const own =
    viewer !== undefined && target !== undefined && viewer.toLowerCase() === target.toLowerCase();

  /** Grouped by collection, so a wallet reads as collections rather than a wall. */
  const byCollection = useMemo(() => {
    const map = new Map<
      string,
      { name: string; address: `0x${string}`; items: typeof tokens }
    >();
    for (const t of tokens) {
      const key = t.collection.toLowerCase();
      const entry = map.get(key) ?? { name: t.collectionName, address: t.collection, items: [] };
      entry.items.push(t);
      map.set(key, entry);
    }
    return [...map.values()];
  }, [tokens]);

  if (target === undefined) {
    return (
      <section className="page section market-empty">
        <h2>That isn&rsquo;t a wallet address.</h2>
        <p className="muted">A ValueChain address is 0x followed by 40 hex characters.</p>
        <Link className="btn mt-sm" href="/collections">
          Browse collections
        </Link>
      </section>
    );
  }

  const listed = tokens.filter((t) => t.listing !== undefined);
  const asking = listed.reduce((sum, t) => sum + (t.listing?.price ?? 0n), 0n);

  /** Withheld until floors and the first holdings land — see /portfolio. */
  const nfts =
    floorsLoading || (isLoading && tokens.length === 0)
      ? undefined
      : valueAtFloor(tokens, (t) =>
          floorForTier(t.tier, tierRowsFor(t.collection), floorFor(t.collection)),
        );

  return (
    <section className="page section">
      <div className="pf-layout">
        <div className="pf-main">
          <PortfolioHeader
            address={target}
            pieces={tokens.length}
            collections={byCollection.length}
            listed={listed.length}
            asking={asking}
            own={own}
            heading={`Wallet ${shortAddress(target, 6)}`}
            {...(balance?.value === undefined ? {} : { balance: balance.value })}
            {...(nfts === undefined ? {} : { nfts })}
            extra={
              <>
                {own ? (
                  <Link className="chip chip-up ph-you" href="/portfolio">
                    This is you &middot; open your portfolio
                  </Link>
                ) : null}
                <ShareLink title={`${shortAddress(target, 6)} on ValueMint`} />
                {/* Named, not just the icon beside the address: the explorer is
                    where someone goes for the wallet's raw transactions, and
                    arriving here from a click they may have wanted that. */}
                <a
                  className="btn btn-sm ph-scan"
                  href={`${deployment.explorer}/address/${target}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  View on Mainscan &#8599;
                </a>
              </>
            }
          />

          <HoldingsScan
            loading={isLoading}
            discovering={isDiscovering}
            collections={collections.length}
            expected={expected}
            found={tokens.length}
            detailed={tokens.filter((t) => t.metadata !== undefined).length}
            pending={pending.map((c) => c.name)}
          />

          {unlistable.length > 0 ? (
            <p className="portfolio-note">
              Pieces this wallet holds in {unlistable.map((c) => c.name).join(", ")} could not be
              identified. {unlistable.length === 1 ? "It doesn't" : "They don't"} publish a
              per-owner index and the explorer has no record of them either.
            </p>
          ) : null}

          {isLoading && tokens.length === 0 ? (
            <div className="grid-tokens">
              {Array.from({ length: 6 }, (_, i) => (
                <TokenCardSkeleton key={i} />
              ))}
            </div>
          ) : tokens.length === 0 ? (
            <div className="market-empty">
              <h3>This wallet holds nothing here.</h3>
              <p className="muted">
                Checked all {collections.length} collection{collections.length === 1 ? "" : "s"}{" "}
                on ValueChain and found nothing under this address. Its trades, if it has any,
                are beside this.
              </p>
            </div>
          ) : (
            <div className="stack stack-lg">
              {byCollection.map((group) => (
                <HoldingsGroup
                  key={group.address}
                  group={group}
                  viewer={viewer}
                  floorFor={floorFor}
                  tierRowsFor={tierRowsFor}
                  own={own}
                />
              ))}
            </div>
          )}

          {/* More is coming: the balances are known before the ids are. The
              count and the collections still being read are in the scan line
              at the top; this is the space they will fill. */}
          {isDiscovering && tokens.length > 0 ? (
            <div className="portfolio-more">
              <div className="grid-tokens" aria-hidden="true">
                {Array.from({ length: Math.min(4, Math.max(1, expected - tokens.length)) }, (_, i) => (
                  <TokenCardSkeleton key={i} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="pf-side">
          <PortfolioActivity address={target} own={own} />
        </aside>
      </div>
    </section>
  );
}
