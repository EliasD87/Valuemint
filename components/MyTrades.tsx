"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useBlockNumber } from "wagmi";
import { useActivity, type ActivityRow } from "@/hooks/useActivity";
import { useAllCollections } from "@/hooks/useAllCollections";
import { deployment } from "@/config/contracts";
import { formatSosoFixed, shortAddress, timeAgo, timeAgoShort, tinyAddress } from "@/lib/format";
import { Soso } from "@/components/Soso";
import { ArrowRight } from "@/components/Arrows";
import "@/styles/activity.css";

/**
 * What this wallet has actually done, from its own side.
 *
 * The generic `Activity` panel is written from the chain's point of view: a
 * sale has a `from` and a `to` and no opinion about which of them is reading
 * it. That is right for a token page, where any visitor might be looking, and
 * wrong here — on your own portfolio the useful word is "Bought" or "Sold",
 * not "0x3680… → 0xF4cc…".
 *
 * Only the *voice* differs, and that is why this now borrows `activity.css`
 * for the panel, the list and the row. The two had drifted into different
 * tables — different badges, different columns, different rules for the
 * hairlines — and on the portfolio they sit a scroll apart from the collection
 * panels they are meant to match. The totals below are the only thing here
 * that `Activity` has no equivalent of.
 *
 * It costs nothing extra to render. `useActivity` runs one global scan shared
 * by every caller on the page, so this is the same rows the market already
 * fetched, filtered to one address.
 *
 * It used to carry Spent / Earned / Net above the list. Those are gone. Three
 * currency figures never fit the 21rem column this now lives in beside the
 * holdings — measured there, the values ran straight over each other and over
 * the cell dividers — and they were the wrong thing to lead with anyway: they
 * counted only what moved through this marketplace, so they were silent about
 * every piece bought elsewhere or still held, and "Net" was read as profit
 * while saying nothing about what anything is worth now. The header keeps the
 * honest part, which is how many trades settled.
 */

/** ValueChain's block time, measured. Only used to date a row, never to price one. */
const SECONDS_PER_BLOCK = 2.065;

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
  /** Ten here too, for the same reason. The rest live at `/activity?wallet=me`. */
  limit = 10,
  /** True on `/activity` itself: every row, and no link back to itself. */
  full = false,
  title = "Your trades",
  bare = false,
}: {
  address: `0x${string}` | undefined;
  limit?: number;
  full?: boolean;
  title?: string;
  /** Render only the list, for a panel that owns the frame and the title. */
  bare?: boolean;
}) {
  const { rows, isLoading, logsUnavailable } = useActivity(undefined, undefined, {
    wallet: address,
  });

  const { data: head } = useBlockNumber({ query: { staleTime: 12_000 } });

  /* The same cached registry every page mounts; only used to name a row's
     collection, and a short address stands in until it answers. */
  const { collections } = useAllCollections();
  const nameFor = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of collections) names.set(c.address.toLowerCase(), c.name);
    return (a: string) => names.get(a.toLowerCase()) ?? shortAddress(a as `0x${string}`, 4);
  }, [collections]);

  const me = address?.toLowerCase() ?? "";

  /**
   * Only settled trades are counted.
   *
   * A listing is an intention and an offer is a question; neither has moved a
   * piece. Counting them would make the figure look like activity rather than
   * results.
   */
  const totals = useMemo(() => {
    let bought = 0;
    let sold = 0;

    for (const r of rows) {
      if (r.kind !== "sale" || r.price === undefined) continue;
      if (r.from?.toLowerCase() === me) sold += 1;
      else if (r.to?.toLowerCase() === me) bought += 1;
    }
    return { bought, sold };
  }, [rows, me]);

  if (address === undefined) return null;

  const shown = full ? rows : rows.slice(0, limit);
  const settled = totals.bought + totals.sold;

  const summary =
    settled > 0 ? (
      <>
        {totals.bought} bought &middot; {totals.sold} sold
      </>
    ) : null;

  const body = (
    <>
      {isLoading && rows.length === 0 ? (
        <div className="act-list">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton act-skeleton" />
          ))}
        </div>
      ) : logsUnavailable ? (
        /* Absence of a read is not an absence of trades. */
        <p className="act-note">
          Your history could not be read &mdash; the node would not serve event logs. It is
          not empty; try again in a moment.
        </p>
      ) : rows.length === 0 ? (
        <p className="act-note">
          Nothing yet. Every piece you buy, sell, list or bid on through ValueMint shows up
          here, read straight from the chain.
        </p>
      ) : (
        /*
         * A real table, two lines to a row.
         *
         * Each row used to be a grid of its own that wrapped wherever it ran
         * out of room — the time under the kind on one row, the counterparty
         * floating right on the next — so no two rows put anything in the same
         * place. A table sizes every column to its widest cell across ALL rows,
         * so the columns hold; and the 21rem this lives in is too narrow for
         * six of them, so each column carries two related facts, one above the
         * other, and every row has the same shape:
         *
         *   Item                    Price   From / To
         *   ● Sold  #12           2500.00   You
         *     ValueChain Genesis   1d ago   0x15…34A7
         *
         * The event shares the item's column rather than having its own: a
         * fourth column left the item 40px, which cut every collection name
         * to three letters.
         */
        <div className="tr-scroll">
          <table className="tr-table tr-trades">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="tr-num">
                  Price
                </th>
                <th scope="col">From / To</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const { label, tone } = describe(r, me);
                const at =
                  head === undefined
                    ? undefined
                    : Math.floor(Date.now() / 1000) -
                      Number(head - r.blockNumber) * SECONDS_PER_BLOCK;
                const ago = at === undefined ? undefined : timeAgoShort(at);

                return (
                  <tr key={`${r.blockNumber}-${r.logIndex}-${r.kind}-${r.tokenId}`}>
                    <td className="tr-item">
                      <span className="tr-l1">
                        {/* A settled trade takes its side (in/out); everything
                            else takes its own kind, so Listed, Offered and
                            Cancelled each get their own dot. */}
                        <span className={`act-kind act-kind-${r.kind === "sale" ? tone : r.kind}`}>
                          {label}
                        </span>
                        <Link
                          className="tr-piece"
                          href={`/token/${r.collection}/${r.tokenId}`}
                          title={nameFor(r.collection)}
                        >
                          #{r.tokenId.toString()}
                        </Link>
                      </span>
                      <span className="tr-l2 tr-coll" title={nameFor(r.collection)}>
                        {nameFor(r.collection)}
                      </span>
                    </td>

                    {/* Price over when. The time sat beside the collection and
                        cut "ValueChain Genesis" to "ValueCha…"; under the
                        price it has a line to itself. */}
                    <td className="tr-num">
                      <span className="tr-l1 tr-l1-end">
                        {r.price === undefined ? (
                          <span className="dim">&mdash;</span>
                        ) : (
                          <span className="tr-price">
                            <Soso size={13}>{formatSosoFixed(r.price)}</Soso>
                          </span>
                        )}
                        {r.amount > 1n ? (
                          <span className="act-amount">&times;{r.amount.toString()}</span>
                        ) : null}
                      </span>
                      <a
                        className="tr-l2 tr-when"
                        href={`${deployment.explorer}/block/${r.blockNumber.toString()}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={`${at === undefined ? "" : `${timeAgo(at)} · `}block #${r.blockNumber.toString()}`}
                      >
                        {ago === undefined
                          ? `#${r.blockNumber.toString()}`
                          : ago === "now"
                            ? "just now"
                            : `${ago} ago`}
                      </a>
                    </td>

                    <td className="tr-parties">
                      <span className="tr-l1">
                        <Party address={r.from} me={me} />
                      </span>
                      <span className="tr-l2">
                        <Party address={r.to} me={me} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!full && rows.length > shown.length ? (
        <Link className="btn btn-sm btn-block act-all" href="/activity?wallet=me">
          See all {rows.length} events
          <ArrowRight />
        </Link>
      ) : null}
    </>
  );

  /**
   * Inside somebody else's panel: no frame and no title of its own.
   *
   * The portfolio shows this and the standing offers in ONE panel with a switch
   * between them, and a panel inside a panel is the card-in-a-card the tables
   * on this site were being rebuilt to get rid of. The summary still shows,
   * because it is the one figure this view has that the other does not.
   */
  if (bare) {
    return (
      <>
        {summary === null ? null : <p className="act-summary">{summary}</p>}
        {body}
      </>
    );
  }

  return (
    <div className="act-panel act-panel-standalone">
      <div className="act-head">
        <p className="act-title">{title}</p>
        {summary === null ? null : <span className="act-count">{summary}</span>}
      </div>
      {body}
    </div>
  );
}

/**
 * One side of an event: "You", the other wallet, or nobody.
 *
 * "You" rather than your own address, because on your own history every row
 * has you on one side and a column of your own address repeated is noise
 * that hides the other party. Nobody is a dash: a listing has a maker and no
 * taker until it sells.
 */
function Party({ address, me }: { address: `0x${string}` | undefined; me: string }) {
  if (address === undefined) return <span className="dim">&mdash;</span>;
  if (address.toLowerCase() === me) return <span className="tr-you">You</span>;
  return (
    <Link className="tr-addr" href={`/address/${address}`} title={address}>
      {tinyAddress(address)}
    </Link>
  );
}
