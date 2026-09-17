"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useActivity, type ActivityRow } from "@/hooks/useActivity";
import { Soso } from "@/components/Soso";
import { deployment } from "@/config/contracts";
import { formatSoso, shortAddress } from "@/lib/format";
import "@/styles/trades.css";

/**
 * What this wallet has actually done, from its own side.
 *
 * The generic `Activity` panel is written from the chain's point of view: a
 * sale has a `from` and a `to` and no opinion about which of them is reading
 * it. That is right for a token page, where any visitor might be looking, and
 * wrong here — on your own portfolio the useful word is "Bought" or "Sold",
 * not "0x3680… → 0xF4cc…".
 *
 * It costs nothing extra to render. `useActivity` runs one global scan shared
 * by every caller on the page, so this is the same rows the market already
 * fetched, filtered to one address.
 */

/** Same event, different word depending on which side you were. */
function describe(row: ActivityRow, me: string): { label: string; tone: "in" | "out" | "flat" } {
  const iAmFrom = row.from?.toLowerCase() === me;

  if (row.kind === "sale") {
    return iAmFrom ? { label: "Sold", tone: "in" } : { label: "Bought", tone: "out" };
  }
  if (row.kind === "listed") return { label: "Listed", tone: "flat" };
  if (row.kind === "offer") return { label: "Offered", tone: "flat" };
  return { label: "Cancelled", tone: "flat" };
}

export function MyTrades({
  address,
  limit = 20,
}: {
  address: `0x${string}` | undefined;
  limit?: number;
}) {
  const { rows, isLoading, logsUnavailable } = useActivity(undefined, undefined, {
    wallet: address,
  });

  const me = address?.toLowerCase() ?? "";

  /**
   * Only settled trades count toward the totals.
   *
   * A listing is an intention and an offer is a question; neither has moved
   * any money. Counting them would make the figures look like activity rather
   * than results.
   */
  const totals = useMemo(() => {
    let spent = 0n;
    let earned = 0n;
    let bought = 0;
    let sold = 0;

    for (const r of rows) {
      if (r.kind !== "sale" || r.price === undefined) continue;
      const value = r.price * r.amount;
      if (r.from?.toLowerCase() === me) {
        earned += value;
        sold += 1;
      } else if (r.to?.toLowerCase() === me) {
        spent += value;
        bought += 1;
      }
    }
    return { spent, earned, bought, sold };
  }, [rows, me]);

  if (address === undefined) return null;

  const shown = rows.slice(0, limit);
  const settled = totals.bought + totals.sold;

  return (
    <div className="trades">
      <div className="trades-head">
        <p className="eyebrow">Your trades</p>
        {settled > 0 ? (
          <span className="trades-count">
            {totals.bought} bought &middot; {totals.sold} sold
          </span>
        ) : null}
      </div>

      {settled > 0 ? (
        <dl className="trades-totals">
          <div>
            <dt>Spent</dt>
            <dd>
              <Soso size={15}>{formatSoso(totals.spent)}</Soso>
            </dd>
          </div>
          <div>
            <dt>Earned</dt>
            <dd>
              <Soso size={15}>{formatSoso(totals.earned)}</Soso>
            </dd>
          </div>
          <div>
            {/* Not profit. It says nothing about what the pieces are worth now,
                only about what moved through the wallet on this marketplace. */}
            <dt>Net</dt>
            <dd className={totals.earned >= totals.spent ? "is-up" : "is-down"}>
              {totals.earned >= totals.spent ? "+" : "−"}
              <Soso size={15}>
                {formatSoso(
                  totals.earned >= totals.spent
                    ? totals.earned - totals.spent
                    : totals.spent - totals.earned,
                )}
              </Soso>
            </dd>
          </div>
        </dl>
      ) : null}

      {isLoading && rows.length === 0 ? (
        <div className="trades-list">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton trades-skeleton" />
          ))}
        </div>
      ) : logsUnavailable ? (
        /* Absence of a read is not an absence of trades. */
        <p className="trades-note">
          Your history could not be read &mdash; the node would not serve event logs. It is not
          empty; try again in a moment.
        </p>
      ) : rows.length === 0 ? (
        <p className="trades-note">
          Nothing yet. Every piece you buy, sell, list or bid on through ValueMint shows up
          here, read straight from the chain.
        </p>
      ) : (
        <ul className="trades-list">
          {shown.map((r) => {
            const { label, tone } = describe(r, me);
            const other = r.from?.toLowerCase() === me ? r.to : r.from;

            return (
              <li key={`${r.blockNumber}-${r.logIndex}-${r.kind}-${r.tokenId}`} className="trades-row">
                <span className={`trades-kind trades-${tone}`}>{label}</span>

                <Link className="trades-token" href={`/token/${r.collection}/${r.tokenId}`}>
                  #{r.tokenId.toString()}
                </Link>

                <span className="trades-price">
                  {r.price === undefined ? (
                    <span className="dim">&mdash;</span>
                  ) : (
                    <>
                      <Soso size={15}>{formatSoso(r.price)}</Soso>
                      {r.amount > 1n ? (
                        <span className="trades-amount">&times;{r.amount.toString()}</span>
                      ) : null}
                    </>
                  )}
                </span>

                <span className="trades-who">
                  {/* Only a counterparty when there was one. A listing you made
                      and later cancelled has nobody on the other side. */}
                  {r.kind === "sale" && other !== undefined ? (
                    <>
                      {r.from?.toLowerCase() === me ? "to " : "from "}
                      {shortAddress(other)}
                    </>
                  ) : null}
                </span>

                <a
                  className="trades-block"
                  href={`${deployment.explorer}/block/${r.blockNumber.toString()}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  #{r.blockNumber.toString()}
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > limit ? (
        <p className="trades-note dim">
          Showing the most recent {limit} of {rows.length}.
        </p>
      ) : null}
    </div>
  );
}
