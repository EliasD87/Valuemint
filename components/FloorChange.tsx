"use client";

import { useMemo } from "react";
import { useBlockNumber } from "wagmi";
import { useActivity } from "@/hooks/useActivity";
import { floorVsSales } from "@/lib/floorVsSales";
import { BLOCKS_PER_DAY } from "@/config/chain";
import { formatSoso } from "@/lib/format";
import { InfoTip } from "@/components/InfoTip";
import "./FloorChange.css";

/**
 * Today's floor against the last 24 hours' average sale — see
 * lib/floorVsSales.ts for the rule and what it does not claim.
 *
 * `floorWei` comes from the page, which already shows it in the Floor cell
 * beside this: the two must be one number. The sales are the same history the
 * page's volume figures are read from, so this costs no request of its own.
 */
export function FloorChange({
  collection,
  floorWei,
}: {
  collection: `0x${string}` | undefined;
  /** The live floor, as the Floor cell shows it. Undefined: nothing listed. */
  floorWei: bigint | undefined;
}) {
  const { sales, isLoading, logsUnavailable } = useActivity(collection);
  const { data: head } = useBlockNumber({ watch: false });

  const result = useMemo(
    () =>
      floorVsSales(
        sales.flatMap((s) =>
          s.price === undefined ? [] : [{ priceWei: s.price, amount: s.amount, blockNumber: s.blockNumber }],
        ),
        floorWei,
        head,
        BLOCKS_PER_DAY,
      ),
    [sales, floorWei, head],
  );

  /** Nothing listed now, or the history not read: no figure to set against. */
  if (floorWei === undefined || isLoading || logsUnavailable || head === undefined) return null;

  /**
   * The figure alone in the cell, and everything behind it in the "i".
   *
   * The average and the sale count rode under the percentage as a note; the
   * owner asked for the number only, with its meaning a hover away. The
   * specifics stay in the explanation, because a percentage built on one sale
   * and one built on thirty are different amounts of evidence.
   */
  const meaning = (
    <>
      Today&rsquo;s floor price compared with the <b>average price of pieces sold in the last 24
      hours</b>. Positive: the cheapest piece now costs more than they sold for; negative: less.
    </>
  );

  if (result === undefined) {
    return (
      <div className="cs-cell">
        <dt className="cs-label">
          Floor vs 24h avg
          <InfoTip label="What this figure means">
            {meaning}
            <br />
            <br />
            Nothing has sold in the last 24 hours, so there is no average to compare with.
          </InfoTip>
        </dt>
        <dd className="cs-value">
          <span className="cs-dash">&mdash;</span>
        </dd>
      </div>
    );
  }

  const tone = result.percent > 0 ? "up" : result.percent < 0 ? "down" : "flat";
  const sign = result.percent > 0 ? "+" : "";
  const salesWord = result.sales === 1 ? "sale" : "sales";

  return (
    <div className="cs-cell">
      <dt className="cs-label">
        Floor vs 24h avg
        <InfoTip label="What this figure means">
          {meaning}
          <br />
          <br />
          Now: floor <b>{formatSoso(result.floorWei)} SOSO</b> against an average of{" "}
          <b>{formatSoso(result.averageWei)} SOSO</b> across {result.sales} {salesWord}.
        </InfoTip>
      </dt>
      <dd className="cs-value">
        <span className={`chg-pct chg-${tone}`}>
          {sign}
          {result.percent.toFixed(1)}%
        </span>
      </dd>
    </div>
  );
}
