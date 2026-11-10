"use client";

import { useFloorHistory } from "@/hooks/useFloorHistory";
import { floorChange } from "@/lib/floorChange";
import { formatSoso } from "@/lib/format";
import { InfoTip } from "@/components/InfoTip";
import { useT } from "@/lib/i18n";
import "./FloorChange.css";

/**
 * Today's floor against yesterday's — see lib/floorChange.ts for the rule.
 *
 * One floor against one floor, a day apart, and no averages: the owner's call
 * on 2026-10-04, replacing "floor vs the average price sold in 24 hours",
 * which compared an asking price with sale prices and, on tiered collections,
 * averaged the tiers' percentages into a figure nobody could check by eye.
 *
 * `floorWei` comes from the page, which shows it in the Floor cell beside
 * this, so "now" here is the number the reader is looking at. Yesterday's
 * comes from the index's floor record — the one series on the site with no
 * chain behind it — so when that cannot be read, the cell says so rather than
 * showing 0%.
 */
export function FloorChange({
  collection,
  floorWei,
}: {
  collection: `0x${string}` | undefined;
  /** The live floor, as the Floor cell shows it. Undefined: nothing listed. */
  floorWei: bigint | undefined;
}) {
  const t = useT();
  const { points, isLoading, unavailable } = useFloorHistory(collection, 2);

  if (isLoading) return null;

  const change = unavailable ? undefined : floorChange(points, floorWei);

  /* One sentence with its bold phrase in the middle, wherever the language puts it. */
  const [meansBefore, meansAfter = ""] = t(
    "Today’s floor price compared with the floor {ago}. Positive: the cheapest piece costs more than it did yesterday; negative: less.",
  ).split("{ago}");

  const label = (details: React.ReactNode) => (
    <dt className="cs-label">
      {t("Floor 24h")}
      <InfoTip label={t("What this figure means")}>
        {meansBefore}<b>{t("24 hours ago")}</b>{meansAfter}
        <br />
        <br />
        {details}
      </InfoTip>
    </dt>
  );

  if (change === undefined || change.kind !== "change") {
    const why =
      change === undefined
        ? t("The floor record could not be read just now.")
        : change.kind === "no-floor-now"
          ? t("Nothing is listed right now, so there is no floor today.")
          : change.kind === "no-floor-then"
            ? t("Nothing was listed 24 hours ago, so there was no floor to compare with.")
            : t("There is no record of the floor 24 hours ago yet.");
    return (
      <div className="cs-cell">
        {label(why)}
        <dd className="cs-value">
          <span className="cs-dash">&mdash;</span>
        </dd>
      </div>
    );
  }

  const { percent } = change;
  const tone = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  const [nowBefore, nowRest = ""] = t("Now: {now}. 24 hours ago: {then}.").split("{now}");
  const [nowMiddle, nowAfter = ""] = nowRest.split("{then}");
  const signed = `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;

  return (
    <div className="cs-cell">
      {label(
        <>
          {nowBefore}<b>{formatSoso(change.nowWei)} SOSO</b>{nowMiddle}<b>{formatSoso(change.thenWei)} SOSO</b>{nowAfter}
        </>,
      )}
      <dd className="cs-value">
        <span className={`chg-pct chg-${tone}`}>{signed}</span>
      </dd>
    </div>
  );
}
