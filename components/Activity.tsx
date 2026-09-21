"use client";

import Link from "next/link";
import { useBlockNumber } from "wagmi";
import { useActivity, type ActivityRow } from "@/hooks/useActivity";
import { useBurnedListedTokens } from "@/hooks/useSeaportOrders";
import { deployment } from "@/config/contracts";
import { Soso } from "@/components/Soso";
import { formatSoso, shortAddress, timeAgo } from "@/lib/format";
import "@/styles/activity.css";

/**
 * What has happened here, newest first.
 *
 * Ten rows and a way out. This panel used to grow to whatever the scan
 * returned — twenty-five on a token page, twenty on a collection — which is
 * neither a summary nor a table worth reading: by row forty nobody is scanning
 * it, and on the token page it pushed the offers below the fold. So the panel
 * is a glance and `/activity` is the record.
 *
 * Times, not block numbers. The column was the raw block, which is exact and
 * means nothing to anyone — "#14458676" tells a buyer no more than a serial
 * number would. Nothing extra is fetched to fix that: turning a block into a
 * timestamp properly costs a `getBlock` per row, so the distance from the chain
 * head is converted at ValueChain's ~2.065s spacing instead, and the block
 * itself stays in the tooltip and behind the link.
 */

const LABEL: Record<ActivityRow["kind"], string> = {
  sale: "Sold",
  listed: "Listed",
  cancelled: "Delisted",
  offer: "Offer",
};

/** ValueChain's block time, measured. Only used to date a row, never to price one. */
const SECONDS_PER_BLOCK = 2.065;

function Row({
  row,
  showToken,
  head,
  burned,
}: {
  row: ActivityRow;
  showToken: boolean;
  /** The chain head, so a block number can be read as a time. */
  head?: bigint;
  /** This row's token has since been burned. */
  burned: boolean;
}) {
  return (
    <li className={`act-row act-${row.kind}`}>
      <span className={`act-kind act-kind-${row.kind}`}>{LABEL[row.kind]}</span>

      {showToken ? (
        <Link className="act-token" href={`/token/${row.collection}/${row.tokenId}`}>
          #{row.tokenId.toString()}
        </Link>
      ) : null}

      <span className="act-price">
        {row.price === undefined ? (
          <span className="dim">&mdash;</span>
        ) : (
          <>
            <Soso size={15}>{formatSoso(row.price)}</Soso>
            {/* Only worth saying for an edition; every ERC-721 sale is one. */}
            {row.amount > 1n ? (
              <span className="act-amount">&times;{row.amount.toString()}</span>
            ) : null}
          </>
        )}

        {/*
          A listing whose token no longer exists.

          Without it the row reads as live — which is what happened when
          SoDEXTreasureBox's boxes were opened: the listings correctly vanished
          from the market, and the history still said "Listed 100 SOSO" with
          nothing to say the box had since been opened.

          Inside the price cell, not beside it. `.act-row` is a declared
          five-column grid, so an extra child would push every later cell out
          of line — and only on some rows, which is worse than the problem. The
          price column is `auto`, so it widens for this and the elastic `who`
          column gives up the space.

          Only on a listing. A sale that happened, happened, whatever became of
          the piece afterwards; a burn does not reach back and change it.
        */}
        {burned && row.kind === "listed" ? (
          <span className="act-gone" title="This piece has since been burned">
            {/*
              An opened box: a body with both lid flaps folded out and up.

              Chosen by the owner, and it is the literal thing that happened to
              every piece this mark has been drawn for so far — opening a SoDEX
              Treasure Box burns it. Worth knowing if it ever looks wrong: the
              mark itself is generic, so a token burned some other way would
              carry this too.
            */}
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 10h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20V10z" />
              <path d="M4 10 2 6l8-2.5L12 10z" />
              <path d="M20 10l2-4-8-2.5L12 10z" />
            </svg>
            burned
          </span>
        ) : null}
      </span>

      <span className="act-who">
        {row.from === undefined ? null : shortAddress(row.from)}
        {row.to === undefined ? null : (
          <>
            {" → "}
            {shortAddress(row.to)}
          </>
        )}
      </span>

      <a
        className="act-when"
        href={`${deployment.explorer}/block/${row.blockNumber.toString()}`}
        target="_blank"
        rel="noreferrer noopener"
        title={`Block #${row.blockNumber.toString()}`}
      >
        {head === undefined
          ? `#${row.blockNumber.toString()}`
          : timeAgo(
              Math.floor(Date.now() / 1000) - Number(head - row.blockNumber) * SECONDS_PER_BLOCK,
            )}
      </a>
    </li>
  );
}

export function Activity({
  collection,
  tokenId,
  /**
   * Ten, and a link to the rest.
   *
   * Changing this is nearly always the wrong fix — if a page wants more
   * history it wants `/activity`, which is the page that has all of it.
   */
  limit = 10,
  title = "Activity",
  /** True on `/activity` itself: every row, and no link back to itself. */
  full = false,
  /** Not inside a stack that already spaces it — give it room of its own. */
  standalone = false,
  /**
   * Mark listings whose token has since been burned.
   *
   * Only worth asking where the page already reads the order book for its own
   * prices — the collection page and the token page — because there it is free.
   * Off elsewhere so that drawing a word never starts a log scan. See
   * `useBurnedListedTokens`.
   */
  markBurned = false,
}: {
  collection: `0x${string}` | undefined;
  /** Omit for a whole collection's history. */
  tokenId?: bigint;
  limit?: number;
  title?: string;
  full?: boolean;
  standalone?: boolean;
  markBurned?: boolean;
}) {
  const { rows, isLoading, logsUnavailable, logsPartial } = useActivity(collection, tokenId);

  /**
   * Which of these tokens have since been burned.
   *
   * Costs nothing: the order book already reads `ownerOf` for every standing
   * order to decide whether it can be filled, and this is the orders where
   * that read reverted. It only knows about tokens whose listing is still in
   * the scan window, which is the common case for a row recent enough to be
   * on this panel.
   */
  const { burned } = useBurnedListedTokens(markBurned);

  /**
   * One read, shared by every row and by every other panel on the page.
   *
   * Twelve seconds of staleness against a two-second chain moves a row's age by
   * at most six blocks, which cannot change what it says — "3 minutes ago"
   * stays "3 minutes ago". Polling harder would cost a request to change
   * nothing.
   */
  const { data: head } = useBlockNumber({ query: { staleTime: 12_000 } });

  const shown = full ? rows : rows.slice(0, limit);

  /** `?collection=` alone is the whole collection; adding a token narrows it. */
  const allHref = `/activity${collection === undefined ? "" : `?collection=${collection}`}${
    collection !== undefined && tokenId !== undefined ? `&token=${tokenId.toString()}` : ""
  }`;

  return (
    <div className={`act-panel${standalone ? " act-panel-standalone" : ""}`}>
      <div className="act-head">
        <p className="act-title">{title}</p>
        {rows.length > shown.length ? (
          <span className="act-count">
            {shown.length} of {rows.length}
          </span>
        ) : rows.length > 0 ? (
          <span className="act-count">
            {rows.length} {rows.length === 1 ? "event" : "events"}
          </span>
        ) : null}
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="act-list">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton act-skeleton" />
          ))}
        </div>
      ) : logsUnavailable ? (
        /* Not "nothing traded" - we could not read what traded. Saying the
           first when only the second is known is how a buyer concludes a piece
           has no history and prices it accordingly. */
        <p className="act-note">
          The node would not serve event logs just now, so this history could not be read.
          It is not empty &mdash; try again in a moment.
        </p>
      ) : shown.length === 0 ? (
        <p className="act-note">
          Nothing has traded here yet. Every sale, listing and offer made through this
          marketplace shows up here permanently.
        </p>
      ) : (
        /* One token page needs one column fewer, and an empty cell is not the
           same as no cell — the columns have to be declared without it. */
        <ul className={`act-list${tokenId === undefined ? "" : " act-list-one"}`}>
          {shown.map((r) => (
            <Row
              key={`${r.blockNumber}-${r.logIndex}-${r.kind}-${r.tokenId}`}
              row={r}
              showToken={tokenId === undefined}
              head={head}
              burned={burned.has(`${r.collection.toLowerCase()}-${r.tokenId}`)}
            />
          ))}
        </ul>
      )}

      {logsPartial && shown.length > 0 ? (
        <p className="act-more dim">
          Some event types could not be read, so this history is incomplete.
        </p>
      ) : null}

      {!full && rows.length > shown.length ? (
        <Link className="act-all" href={allHref}>
          See all {rows.length} events &rarr;
        </Link>
      ) : null}
    </div>
  );
}

/**
 * "Last sold for X" - the single most useful number from all of this.
 *
 * Rendered as nothing at all when a token has never sold. An empty slot is
 * honest; a zero or a dash invites the reader to treat absence as a value.
 */
export function LastSale({
  collection,
  tokenId,
}: {
  collection: `0x${string}` | undefined;
  tokenId: bigint | undefined;
}) {
  const { lastSale } = useActivity(collection, tokenId, { salesOnly: true });
  if (lastSale?.price === undefined) return null;

  return (
    <span className="last-sale">
      <span className="dim">Last sold</span>
      <Soso size={15}>{formatSoso(lastSale.price)}</Soso>
    </span>
  );
}
