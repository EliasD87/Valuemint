"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useOrdersBy } from "@/hooks/useSeaportOrders";
import { MyTrades } from "@/components/MyTrades";
import { MyOffers } from "@/components/MyOffers";
import "@/styles/activity.css";

type View = "trades" | "offers";

const VIEWS: ReadonlyArray<{ key: View; label: string }> = [
  { key: "trades", label: "Trades" },
  { key: "offers", label: "Offers" },
];

/**
 * The portfolio's side column: what you have done, and what you still have
 * standing, in ONE panel with a switch.
 *
 * ---
 *
 * They were two panels stacked in a 21rem column — "Your offers" above "Your
 * trades" — two frames, two titles, and a column twice as tall as either needed
 * to be. Reported as wanting them "made into one, but with switch buttons",
 * and it is the right call for a reason beyond height: they answer the same
 * question from two directions (what has this wallet done on the market?) and
 * a reader wants one or the other at a time, never both side by side.
 *
 * **The switch is the heading.** A title above a switch would be two labels
 * saying the same thing, and this panel exists partly to get rid of doubled
 * chrome. The tablist carries the name.
 *
 * **Offers wears its count.** The offers view was added because a bid on a
 * piece somebody else then bought becomes unreachable from everywhere else on
 * the site. Hiding that behind a tab would undo it — so the tab says how many
 * are standing, and a reader who has one sees the number without opening it.
 *
 * Trades is the default. It is the view that always has something to say, and
 * the count on the other tab is what makes Offers findable.
 */
export function PortfolioActivity({ address }: { address: `0x${string}` | undefined }) {
  const { offers } = useOrdersBy(address);
  const [view, setView] = useState<View>("trades");
  const id = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  if (address === undefined) return null;

  /**
   * Arrow keys move between tabs, which is what a tablist promises a keyboard
   * user; Tab then leaves the list rather than walking every tab. Selection
   * follows focus — with two views and no cost to showing either, there is
   * nothing to gain from making somebody press Enter as well.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = VIEWS.findIndex((v) => v.key === view);
    let next = at;
    if (event.key === "ArrowRight") next = (at + 1) % VIEWS.length;
    else if (event.key === "ArrowLeft") next = (at - 1 + VIEWS.length) % VIEWS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = VIEWS.length - 1;
    else return;
    event.preventDefault();
    setView(VIEWS[next]!.key);
    tabs.current[next]?.focus();
  };

  return (
    <div className="act-panel act-panel-standalone">
      <div className="act-head">
        <div
          className="act-switch"
          role="tablist"
          aria-label="Your activity"
          onKeyDown={onKeyDown}
        >
          {VIEWS.map((v, i) => {
            const selected = view === v.key;
            return (
              <button
                key={v.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${v.key}`}
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setView(v.key)}
              >
                {v.label}
                {v.key === "offers" && offers.length > 0 ? (
                  <em aria-label={`${offers.length} standing`}>{offers.length}</em>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="act-body"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${view}`}
      >
        {view === "trades" ? (
          <MyTrades address={address} bare />
        ) : (
          <MyOffers address={address} bare />
        )}
      </div>
    </div>
  );
}
