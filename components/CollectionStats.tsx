"use client";

import type { ReactNode } from "react";
import { useCollectionStats } from "@/hooks/useCollectionStats";
import { Soso } from "@/components/Soso";
import { FloorSpark } from "@/components/FloorSpark";
import { formatSoso, formatCount } from "@/lib/format";
import "./CollectionStats.css";

/**
 * The figures across a collection page.
 *
 * Five cells, each of which has to survive not being knowable. That is most of
 * the work here: a stats bar is where a marketplace is most tempted to print a
 * confident zero over a question it never asked, and every one of these has a
 * state where the honest answer is a dash.
 *
 *   * **Floor** is undefined when nothing is listed — not zero. Zero is a price.
 *   * **Owners** comes from the explorer, which refuses this origin in
 *     development, so the cell is empty on localhost and full in production.
 *   * **Volume** is zero when nothing has traded and a dash when the history
 *     could not be read. Those are different facts and the bar says which.
 *
 * ---
 *
 * **Volume means "settled through Seaport here".** A piece moved by a direct
 * transfer leaves no event and is in none of these numbers. The footnote says
 * so, because a figure labelled "total volume" on a collection page will
 * otherwise be read as the collection's whole trading history.
 */

function Cell({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  /** A second line under the figure — a share, a count, a qualifier. */
  note?: ReactNode;
}) {
  return (
    <div className="cs-cell">
      <dt className="cs-label">{label}</dt>
      <dd className="cs-value">
        {children}
        {note === undefined ? null : <span className="cs-note">{note}</span>}
      </dd>
    </div>
  );
}

/** The one place a missing figure is drawn, so they cannot drift apart. */
function Dash() {
  return <span className="cs-dash">&mdash;</span>;
}

export function CollectionStats({
  collection,
  supply,
}: {
  collection: `0x${string}` | undefined;
  supply?: bigint;
}) {
  const s = useCollectionStats(collection);

  /**
   * What share of the collection is for sale.
   *
   * Only where supply is known and non-zero. A collection whose every piece has
   * been burned reports 0 minted, and dividing by it would print `Infinity%` or
   * `NaN%` on a page that is otherwise correct.
   */
  const listedShare =
    supply !== undefined && supply > 0n
      ? `${((s.listed / Number(supply)) * 100).toFixed(1)}%`
      : undefined;

  return (
    <section className="cs" aria-label="Collection figures">
      <dl className="cs-row">
        <Cell label="Floor">
          {s.floorWei === undefined ? (
            <Dash />
          ) : (
            <Soso size={15}>{formatSoso(s.floorWei)}</Soso>
          )}
        </Cell>

        {/*
          Where "Top offer" used to be, and it earns the slot better.

          A best bid is one number that changes rarely; this is the direction
          the floor has moved in a day, which is the figure somebody scanning a
          collection page is actually looking for. It renders nothing at all
          until the recorded series is a day long — see `FloorSpark`.
        */}
        <FloorSpark collection={collection} />

        <Cell label="Listed" note={listedShare}>
          <span className="cs-plain">{formatCount(BigInt(s.listed))}</span>
        </Cell>

        {/*
          Omitted rather than dashed when the explorer will not answer.

          A dash here reads as "nobody holds this", which is never true of a
          collection with pieces in it. The cell disappearing reads as "not
          shown", which is what actually happened. This is the cell that is
          always absent on localhost — see useCollectionStats.
        */}
        {s.owners === undefined ? null : (
          <Cell label="Owners">
            <span className="cs-plain">{formatCount(BigInt(s.owners))}</span>
          </Cell>
        )}

        {/*
          No sale count under these.

          The dash already carries the only distinction that mattered: a zero
          means the history was read and nothing traded, a dash means it could
          not be read at all. The count was saying a third thing nobody asked
          for, in a strip whose job is six figures read at a glance.
        */}
        <Cell label="24h volume">
          {s.unavailable ? <Dash /> : <Soso size={15}>{formatSoso(s.volumeDayWei)}</Soso>}
        </Cell>

        <Cell label="Total volume">
          {s.unavailable ? <Dash /> : <Soso size={15}>{formatSoso(s.volumeTotalWei)}</Soso>}
        </Cell>
      </dl>

      {/*
        Only when something went wrong.

        The standing note explaining that volume counts what settled here was
        removed — it sat under every collection page saying the same sentence
        forever. This line is not that: a refused scan is not a quiet market,
        and the bar must not let the two look alike.
      */}
      {s.unavailable ? (
        <p className="cs-foot cs-foot-warn">
          Trade history couldn&rsquo;t be read just now, so the volume figures are missing rather
          than zero.
        </p>
      ) : null}
    </section>
  );
}
