"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useBalance } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useHoldings } from "@/hooks/useHoldings";
import { useFloors } from "@/hooks/useFloors";
import { useOrdersBy } from "@/hooks/useSeaportOrders";
import { PortfolioHeader, type HeaderOffers } from "@/components/PortfolioHeader";
import { PortfolioHoldings } from "@/components/PortfolioHoldings";
import { HoldingsScan } from "@/components/HoldingsScan";
import { OfferInbox, type InboxSummary } from "@/components/OfferInbox";
import { MyOffers } from "@/components/MyOffers";
import { MyTrades } from "@/components/MyTrades";
import { TokenCardSkeleton } from "@/components/TokenCard";
import { CREATE_ENABLED } from "@/config/features";
import { HOLDINGS_FOCUS_EVENT, anchoredCollection } from "@/lib/anchors";
import { floorForTier } from "@/lib/floors";
import { formatCount } from "@/lib/format";
import { valueAtFloor } from "@/lib/portfolioValue";
import "@/styles/activity.css";

type Tab = "collected" | "offers" | "activity";

/**
 * A wallet, read in full: /portfolio for your own and /address/… for anybody's.
 *
 * ---
 *
 * **One view, two pages.** The lookup page used to be its own layout and fell
 * behind every time the portfolio improved; it was rebuilt from the
 * portfolio's parts once, and drifted again. Now both pages are this, and
 * `own` is the whole difference: true only when the connected wallet IS the
 * address, it turns on the things only a holder can act on or should be asked
 * — offers to accept, bulk listing, withdrawing bids, unwrapping.
 *
 * **Tabs, because the page answers three questions** — what is held, what is
 * being bid, and what has happened — and a reader wants one at a time. Trades
 * and offers lived in a column beside the pieces for a while; at any real
 * holding the pieces ran three screens past the bottom of that column, which
 * was a panel's worth of empty page beside every row of cards. A tab gives
 * each the full width.
 *
 * **Money waiting is not hidden by them.** The offers inbox is in a tab, so
 * its count is in the header — the first figure after the balance a reader
 * looks for — and on the tab itself. The inbox stays mounted while another tab
 * is open, so that count is never stale.
 */
export function PortfolioView({
  address,
  viewer,
  own,
  heading,
  extra,
}: {
  address: `0x${string}`;
  /** Whoever is connected, if anybody — not necessarily `address`. */
  viewer: `0x${string}` | undefined;
  own: boolean;
  heading: string;
  /** Beside the address in the header. */
  extra?: ReactNode;
}) {
  const { tokens, collections, unlistable, pending, expected, isDiscovering, isLoading } =
    useHoldings(address);
  const { data: balance } = useBalance({ address });
  const { offers: made } = useOrdersBy(address);

  /**
   * Floors, for "what is this worth" on a piece that is not for sale.
   *
   * Costs no extra scan: `useFloors` is built on `useListingFeed`, and React
   * Query collapses the identical key against the order book this page already
   * reads for its own listings.
   */
  const { floorFor, tierRowsFor, isLoading: floorsLoading } = useFloors();

  /**
   * Accepting an offer changes everything this page reads at once: the piece
   * leaves, its listing dies with it, the offer is consumed and the balance
   * moves. Rather than name four query keys and get one wrong, invalidate the
   * lot — it happens once per sale, not on a timer.
   */
  const queryClient = useQueryClient();
  const afterSale = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const [tab, setTab] = useState<Tab>("collected");
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [inbox, setInbox] = useState<InboxSummary>({ checking: true, count: 0 });

  const tabsRef = useRef<HTMLDivElement>(null);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();

  /**
   * "List 12" in the listing prompt lands here with a collection's anchor in
   * the hash. Read once on arrival, and again whenever the prompt is pressed
   * while this page is already open — see HOLDINGS_FOCUS_EVENT for why the
   * hash alone is not heard then.
   */
  useEffect(() => {
    const focus = (collection: string | undefined) => {
      if (collection === undefined) return;
      setTab("collected");
      setSelected(collection.toLowerCase());
      window.requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ block: "start" }));
    };
    focus(anchoredCollection(window.location.hash));
    const onHash = () => focus(anchoredCollection(window.location.hash));
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      if (typeof detail === "string") focus(detail);
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener(HOLDINGS_FOCUS_EVENT, onFocus);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(HOLDINGS_FOCUS_EVENT, onFocus);
    };
  }, []);

  const collectionCount = useMemo(
    () => new Set(tokens.map((t) => t.collection.toLowerCase())).size,
    [tokens],
  );
  const listed = tokens.filter((t) => t.listing !== undefined);
  const asking = listed.reduce((sum, t) => sum + (t.listing?.price ?? 0n), 0n);
  const holdingsLoading = isDiscovering || (isLoading && tokens.length === 0);

  /**
   * Every piece at its floor, by the same rule its card uses.
   *
   * Withheld until the floors and the first holdings have landed: a total
   * summed from half-loaded data is a number that is confidently wrong for a
   * second and then jumps, and a placeholder says "counting" honestly.
   */
  const nfts =
    floorsLoading || (isLoading && tokens.length === 0)
      ? undefined
      : valueAtFloor(tokens, (t) =>
          floorForTier(t.tier, tierRowsFor(t.collection), floorFor(t.collection)),
        );

  const openOffers = () => {
    setTab("offers");
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const headerOffers: HeaderOffers = own
    ? {
        label: "Offers received",
        ...(inbox.checking ? {} : { count: inbox.count }),
        ...(inbox.best === undefined ? {} : { best: inbox.best }),
        onOpen: openOffers,
      }
    : { label: "Offers made", count: made.length, onOpen: openOffers };

  /** What the Offers tab wears: the money waiting on you, or a stranger's bids out. */
  const offersBadge = own ? (inbox.checking ? 0 : inbox.count) : made.length;

  const TABS: ReadonlyArray<{ key: Tab; label: string; count?: number; live?: boolean }> = [
    { key: "collected", label: "Collected", count: tokens.length },
    { key: "offers", label: "Offers", count: offersBadge, live: own && offersBadge > 0 },
    { key: "activity", label: "Activity" },
  ];

  /** Arrow keys move along the tabs, as a tablist promises; selection follows focus. */
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.key === tab);
    let next = at;
    if (event.key === "ArrowRight") next = (at + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (at - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next]!.key);
    tabButtons.current[next]?.focus();
  };

  return (
    <section className="page section pf">
      <PortfolioHeader
        address={address}
        pieces={tokens.length}
        collections={collectionCount}
        listed={listed.length}
        asking={asking}
        own={own}
        heading={heading}
        offers={headerOffers}
        {...(extra === undefined ? {} : { extra })}
        {...(balance?.value === undefined ? {} : { balance: balance.value })}
        {...(nfts === undefined ? {} : { nfts })}
      />

      <div
        ref={tabsRef}
        className="pf-tabs"
        role="tablist"
        aria-label={own ? "Your portfolio" : "This wallet"}
        onKeyDown={onTabKey}
      >
        {TABS.map((t, i) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabButtons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${t.key}`}
              aria-selected={on}
              aria-controls={`${id}-panel-${t.key}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.count === undefined || t.count === 0 ? null : (
                <em className={t.live === true ? "is-live" : undefined}>{formatCount(BigInt(t.count))}</em>
              )}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------ collected */}
      <div
        role="tabpanel"
        id={`${id}-panel-collected`}
        aria-labelledby={`${id}-tab-collected`}
        hidden={tab !== "collected"}
        className="pf-panel"
      >
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
            {/* Reached only when a collection neither enumerates NOR resolves
                through the explorer index — rare now that the fallback exists,
                and a genuine dead end rather than a marketplace limitation. */}
            Pieces {own ? "you hold" : "this wallet holds"} in {unlistable.map((c) => c.name).join(", ")}{" "}
            could not be identified. {unlistable.length === 1 ? "It doesn't" : "They don't"} publish a
            per-owner index and the explorer has no record of them either. Open the token directly by
            address if you know its number.
          </p>
        ) : null}

        {isLoading && tokens.length === 0 ? (
          <div className="grid-tokens">
            {Array.from({ length: 8 }, (_, i) => (
              <TokenCardSkeleton key={i} />
            ))}
          </div>
        ) : tokens.length === 0 ? (
          <div className="market-empty">
            {own ? (
              <>
                <h3>You don&rsquo;t hold anything yet.</h3>
                <p className="muted">
                  Checked all {collections.length} collection{collections.length === 1 ? "" : "s"} on
                  ValueChain and found nothing under your address.
                </p>
                <div className="wrap-row mt-md">
                  <Link className="btn btn-primary" href="/mint">
                    Mint something
                  </Link>
                  <Link className="btn" href="/market">
                    Browse the market
                  </Link>
                  {CREATE_ENABLED ? (
                    <Link className="btn" href="/create">
                      Create a collection
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <h3>This wallet holds nothing here.</h3>
                <p className="muted">
                  Checked all {collections.length} collection{collections.length === 1 ? "" : "s"} on
                  ValueChain and found nothing under this address. Its trades, if it has any, are
                  under Activity.
                </p>
              </>
            )}
          </div>
        ) : (
          <PortfolioHoldings
            tokens={tokens}
            viewer={viewer}
            own={own}
            floorFor={floorFor}
            tierRowsFor={tierRowsFor}
            selected={selected}
            onSelect={setSelected}
            discovering={isDiscovering}
            expected={expected}
          />
        )}
      </div>

      {/* --------------------------------------------------------- offers */}
      <div
        role="tabpanel"
        id={`${id}-panel-offers`}
        aria-labelledby={`${id}-tab-offers`}
        hidden={tab !== "offers"}
        className="pf-panel pf-offers"
      >
        {/* Above the bids you have made: it is somebody else's money waiting
            on a decision. Mounted even while this tab is closed, so the count
            in the header and on the tab is always current. */}
        {own ? (
          <OfferInbox
            holdings={tokens}
            onChange={afterSale}
            holdingsLoading={holdingsLoading}
            artLoading={isLoading}
            onSummary={setInbox}
          />
        ) : null}

        <div className="act-panel">
          <div className="act-head">
            <p className="act-title">{own ? "Offers you've made" : "Offers this wallet has made"}</p>
          </div>
          <MyOffers address={address} bare own={own} />
        </div>
      </div>

      {/* ------------------------------------------------------- activity */}
      <div
        role="tabpanel"
        id={`${id}-panel-activity`}
        aria-labelledby={`${id}-tab-activity`}
        hidden={tab !== "activity"}
        className="pf-panel pf-activity"
      >
        {/* Costs no extra requests: the activity scan is global and already
            running for the market, so this is the same rows filtered to one
            address. Twenty here, the rest on /activity. */}
        <MyTrades address={address} own={own} limit={20} title={own ? "Your trades" : "Trades"} />
      </div>
    </section>
  );
}
