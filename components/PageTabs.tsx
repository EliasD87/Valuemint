"use client";

import "./PageTabs.css";

/**
 * A row of tabs that switches the main body of a page.
 *
 * Generalised out of the collection panel's own two tabs when those moved up
 * from the sidebar to the page. There is no second implementation on purpose:
 * a page and a panel that draw tabs differently teach a visitor that the two
 * behave differently, and they do not.
 *
 * ---
 *
 * **The caller renders one tab's contents, not all of them hidden.**
 *
 * This component draws the row and nothing else. Every tab on a collection page
 * costs something real to arrive at — the holders tab calls the explorer, the
 * activity tab reads the order book — and mounting all of them so switching is
 * free makes *arriving* expensive, which is the wrong way round on a page
 * somebody lands on from a card.
 */

export interface TabDef<K extends string> {
  key: K;
  label: string;
  /** Shown beside the label where the count is known. Omit while it is not. */
  count?: number;
}

export function PageTabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<TabDef<K>>;
  active: K;
  onChange: (key: K) => void;
  /** Names the tab list for a screen reader — "Collection sections". */
  label: string;
}) {
  return (
    <div className="pt" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`pt-tab${active === tab.key ? " is-on" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {/*
            The count is not part of the label.

            It is a separate element so it can stay quiet and tabular while the
            label stays a word — and so a tab whose count is still loading does
            not change width when it lands, which would shift every tab to its
            right mid-read.
          */}
          {tab.count === undefined ? null : (
            <span className="pt-count">{tab.count.toLocaleString()}</span>
          )}
        </button>
      ))}
    </div>
  );
}
