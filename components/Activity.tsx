"use client";

import Link from "next/link";
import { useActivity, type ActivityRow } from "@/hooks/useActivity";
import { deployment } from "@/config/contracts";
import { Soso } from "@/components/Soso";
import { formatSoso, shortAddress } from "@/lib/format";
import "@/styles/activity.css";

/**
 * What has happened here, newest first.
 *
 * Deliberately shows block numbers rather than dates. Turning a block into a
 * timestamp means a `getBlock` call per row, and on a 2-second chain a feed of
 * forty rows is forty extra requests to render something nobody reads
 * precisely. The block is exact, it links to the explorer, and it orders
 * correctly - which is what the column is for.
 */

const LABEL: Record<ActivityRow["kind"], string> = {
  sale: "Sold",
  listed: "Listed",
  cancelled: "Delisted",
  offer: "Offer",
};

function Row({ row, showToken }: { row: ActivityRow; showToken: boolean }) {
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
            {row.amount > 1n ? <span className="act-amount">&times;{row.amount.toString()}</span> : null}
          </>
        )}
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
        className="act-block"
        href={`${deployment.explorer}/block/${row.blockNumber.toString()}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        #{row.blockNumber.toString()}
      </a>
    </li>
  );
}

export function Activity({
  collection,
  tokenId,
  limit = 25,
  title = "Activity",
}: {
  collection: `0x${string}` | undefined;
  /** Omit for a whole collection's history. */
  tokenId?: bigint;
  limit?: number;
  title?: string;
}) {
  const { rows, isLoading } = useActivity(collection, tokenId);
  const shown = rows.slice(0, limit);

  return (
    <div className="token-panel card">
      <p className="token-panel-title">{title}</p>

      {isLoading && rows.length === 0 ? (
        <div className="act-list">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton act-skeleton" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="token-note">
          Nothing has traded here yet. Every sale, listing and offer made through this
          marketplace shows up here permanently.
        </p>
      ) : (
        <ul className="act-list">
          {shown.map((r) => (
            <Row
              key={`${r.blockNumber}-${r.logIndex}-${r.kind}-${r.tokenId}`}
              row={r}
              showToken={tokenId === undefined}
            />
          ))}
        </ul>
      )}

      {rows.length > limit ? (
        <p className="act-more dim">
          Showing the most recent {limit} of {rows.length}.
        </p>
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
