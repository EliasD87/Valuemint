"use client";

import { useMemo } from "react";
import { useBlockNumber } from "wagmi";
import { useActivity } from "@/hooks/useActivity";
import { useFloors } from "@/hooks/useFloors";
import { useGenericTokens } from "@/hooks/useGenericTokens";
import { floorVsSales, floorVsSalesByTier, type SaleSample } from "@/lib/floorVsSales";
import { BLOCKS_PER_DAY } from "@/config/chain";
import { isExcludedSale } from "@/config/excludedSales";
import { formatSoso } from "@/lib/format";
import { InfoTip } from "@/components/InfoTip";
import "./FloorChange.css";

/**
 * Today's floor against what sold in the last 24 hours — see
 * lib/floorVsSales.ts for the rule and what it does not claim.
 *
 * Two shapes of collection, one cell:
 *
 *   - **Tiered** (Genesis, Treasure Box): every tier on its own — its cheapest
 *     listing now against what that tier sold for — and the figure is the
 *     average of those tiers' percentages. Tiers with no sale in the day, or
 *     nothing listed, are left out. `floorVsSalesByTier`.
 *   - **Untiered** (Cybereator): the page's floor against every sale. `floorWei`
 *     comes from the page, which shows it in the Floor cell beside this: the
 *     two must be one number.
 *
 * The number alone in the cell; how it was made — tier by tier — behind the
 * "i", because a percentage resting on one sale and one resting on thirty are
 * different amounts of evidence.
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

  /**
   * Every tier with a live listing, cheapest first, from the same listing feed
   * the cards price themselves by. None: the collection has no tiers.
   */
  const { tierRowsFor, isLoading: floorsLoading } = useFloors();
  const rows = collection === undefined ? [] : tierRowsFor(collection);
  const tiered = rows.length > 0;

  /**
   * The day's sales, and the pieces they were — whose tiers are read below.
   * Less any the owner has ruled out of price comparisons (config/excludedSales).
   */
  const recent = useMemo(() => {
    if (head === undefined) return [];
    const from = head > BigInt(BLOCKS_PER_DAY) ? head - BigInt(BLOCKS_PER_DAY) : 0n;
    return sales.filter(
      (s) =>
        s.price !== undefined &&
        s.blockNumber >= from &&
        !isExcludedSale(s.collection, s.tokenId, s.blockNumber),
    );
  }, [sales, head]);

  const soldIds = useMemo(
    () => [...new Set(recent.map((s) => s.tokenId.toString()))].map((id) => BigInt(id)),
    [recent],
  );

  /** Only fetched for a tiered collection; the same cached documents the cards use. */
  const { tokens: sold, isLoading: tiersLoading } = useGenericTokens(
    tiered ? collection : undefined,
    tiered ? soldIds : [],
  );

  const samples = useMemo((): SaleSample[] => {
    const tierOfId = new Map(sold.map((t) => [t.id.toString(), t.tier]));
    return recent.flatMap((s) => {
      if (s.price === undefined) return [];
      const tier = tierOfId.get(s.tokenId.toString());
      return [
        {
          priceWei: s.price,
          amount: s.amount,
          blockNumber: s.blockNumber,
          ...(tier === undefined ? {} : { tier }),
        },
      ];
    });
  }, [recent, sold]);

  /** Nothing listed now, or the history not read: no figure to set against. */
  if (floorWei === undefined || isLoading || logsUnavailable || head === undefined) return null;
  /**
   * Nothing until the tiers are known. While the listing feed loads, a tiered
   * collection has no tier rows yet and looks untiered, and would flash the
   * all-sales figure first; then its sold pieces' tiers have to arrive too.
   */
  if (floorsLoading) return null;
  if (tiered && soldIds.length > 0 && tiersLoading) return null;

  const byTier = tiered ? floorVsSalesByTier(samples, rows, head, BLOCKS_PER_DAY) : undefined;
  const flat = tiered ? undefined : floorVsSales(samples, floorWei, head, BLOCKS_PER_DAY);
  const percent = tiered ? byTier?.percent : flat?.percent;

  const meaning = tiered ? (
    <>
      For <b>each tier</b>: its cheapest listing today compared with the average price that tier
      sold for in the last 24 hours. The figure is the <b>average of those tiers</b>. A tier with no
      sale in the last day is left out. Positive: floors sit above what they sold for; negative:
      below.
    </>
  ) : (
    <>
      Today&rsquo;s floor price compared with the <b>average price of pieces sold in the last 24
      hours</b>. Positive: the cheapest piece now costs more than they sold for; negative: less.
    </>
  );

  const label = (details: React.ReactNode) => (
    <dt className="cs-label">
      Floor vs 24h avg
      <InfoTip label="What this figure means">
        {meaning}
        <br />
        <br />
        {details}
      </InfoTip>
    </dt>
  );

  if (percent === undefined) {
    return (
      <div className="cs-cell">
        {label(
          tiered
            ? "No tier has both a listing now and a sale in the last 24 hours, so there is nothing to compare."
            : "Nothing has sold in the last 24 hours, so there is no average to compare with.",
        )}
        <dd className="cs-value">
          <span className="cs-dash">&mdash;</span>
        </dd>
      </div>
    );
  }

  const tone = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  const signed = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
  const plural = (n: number) => (n === 1 ? "sale" : "sales");

  return (
    <div className="cs-cell">
      {label(
        byTier !== undefined ? (
          <span className="ft-tiers">
            {byTier.tiers.map((t) => (
              <span key={t.tier} className="ft-tier">
                <b>{t.tier}</b>: floor {formatSoso(t.floorWei)} vs avg {formatSoso(t.averageWei)} (
                {t.sales} {plural(t.sales)}) <b>{signed(t.percent)}</b>
              </span>
            ))}
          </span>
        ) : flat !== undefined ? (
          <>
            Now: floor <b>{formatSoso(flat.floorWei)} SOSO</b> against an average of{" "}
            <b>{formatSoso(flat.averageWei)} SOSO</b> across {flat.sales} {plural(flat.sales)}.
          </>
        ) : null,
      )}
      <dd className="cs-value">
        <span className={`chg-pct chg-${tone}`}>{signed(percent)}</span>
      </dd>
    </div>
  );
}
