"use client";

import { useMemo } from "react";
import { useBlockNumber } from "wagmi";
import { useActivity } from "@/hooks/useActivity";
import { salesToPoints, extentOf, niceTicks, norm } from "@/lib/priceSeries";
import { formatSoso, formatCount } from "@/lib/format";
import "@/styles/activity.css";
import "./PriceChart.css";

/**
 * What this collection has actually sold for.
 *
 * ---
 *
 * **Hand-drawn SVG, and that is deliberate.** The CSP admits scripts from a
 * short list of CDNs and nothing else, and a charting library would be the
 * heaviest dependency in the app for one panel. A scatter with two axes is
 * about sixty lines of geometry, all of which lives in `lib/priceSeries.ts`
 * behind tests.
 *
 * **Every sale here settled through Seaport on this marketplace.** A piece
 * moved by a direct transfer leaves no event and is not on this chart, and the
 * footnote says so — a panel titled "price history" on a collection page will
 * otherwise be read as the collection's whole trading history.
 *
 * Each point is still gated by `readFulfilment`, which refuses settlement
 * currencies this marketplace does not recognise. That is the control that
 * stops a wash trade in a token the attacker minted showing up here as a
 * 1,000,000 sale and dragging the axis with it.
 *
 * **It costs nothing extra.** `useActivity` is already mounted by the page for
 * its history panel and React Query dedupes the key, so this is arithmetic over
 * events that were already in memory.
 */

/** The drawing's own coordinate space; CSS scales it to whatever box it gets. */
const W = 720;
const H = 260;
const PAD = { top: 14, right: 12, bottom: 26, left: 56 };

function agoLabel(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function PriceChart({ collection }: { collection: `0x${string}` | undefined }) {
  const { sales, isLoading, logsUnavailable } = useActivity(collection);
  const { data: head } = useBlockNumber({ watch: false });

  const points = useMemo(
    () =>
      salesToPoints(
        sales.flatMap((s) =>
          s.price === undefined ? [] : [{ priceWei: s.price, blockNumber: s.blockNumber, tokenId: s.tokenId }],
        ),
        head,
      ),
    [sales, head],
  );

  const extent = useMemo(() => extentOf(points), [points]);

  if (logsUnavailable) {
    return (
      <div className="act-panel">
        <p className="act-note">
          Trade history couldn&rsquo;t be read just now, so this is blank rather than empty. Try
          again in a moment.
        </p>
      </div>
    );
  }

  if (isLoading && points.length === 0) {
    return (
      <div className="act-panel">
        <div className="skeleton pc-skeleton" />
      </div>
    );
  }

  if (extent === undefined) {
    /*
      Read, and genuinely nothing there. Distinct from the refusal above, and
      the wording has to make that obvious — this is a claim about the
      collection and the other is a claim about our own reading.
    */
    return (
      <div className="act-panel">
        <p className="act-note">Nothing has sold here yet, so there is no price history to draw.</p>
      </div>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  /**
   * `ago` runs backwards — larger is older — so the oldest point maps to the
   * left edge. Inverting here rather than in the data keeps `ago` meaning one
   * thing everywhere else.
   */
  const x = (ago: number) =>
    PAD.left + plotW * (1 - norm(ago, extent.newest, extent.oldest));
  const y = (value: number) => PAD.top + plotH * (1 - norm(value, extent.minY, extent.maxY));

  /** SOSO, not wei — a tick labelled 9000000000000000000 is not a label. */
  const priceTicks = niceTicks(extent.minY / 1e18, extent.maxY / 1e18, 4);
  const timeTicks = niceTicks(extent.newest, extent.oldest, 3);

  const line = points.map((p) => `${x(p.ago).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");

  return (
    <div className="act-panel pc-panel">
      <div className="pc-head">
        <p className="pc-title">Sale prices</p>
        <span className="pc-note">
          {formatCount(BigInt(points.length))} {points.length === 1 ? "sale" : "sales"}
          {" · "}
          {formatSoso(extent.minWei)}&ndash;{formatSoso(extent.maxWei)} SOSO
        </span>
      </div>

      <svg
        className="pc-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${points.length} sales between ${formatSoso(extent.minWei)} and ${formatSoso(extent.maxWei)} SOSO`}
      >
        {/* Grid first, so every mark and label draws over it. */}
        {priceTicks.map((t) => (
          <g key={`p${t}`}>
            <line
              className="pc-grid"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t * 1e18)}
              y2={y(t * 1e18)}
            />
            <text className="pc-axis" x={PAD.left - 8} y={y(t * 1e18)} textAnchor="end" dy="0.32em">
              {t >= 1 ? t.toFixed(t < 10 ? 1 : 0) : t.toPrecision(2)}
            </text>
          </g>
        ))}

        {timeTicks.map((t) => (
          <text key={`t${t}`} className="pc-axis" x={x(t)} y={H - 8} textAnchor="middle">
            {agoLabel(t)}
          </text>
        ))}

        {/*
          The joining line only where there is something to join. Two points
          make a line; one makes a zero-length path that some renderers draw as
          a dot and others draw as nothing.
        */}
        {points.length > 1 ? <polyline className="pc-line" points={line} /> : null}

        {points.map((p, i) => (
          <circle
            key={`${p.tokenId}-${i}`}
            className="pc-dot"
            cx={x(p.ago)}
            cy={y(p.y)}
            r={3.5}
          >
            {/* Native tooltip: no JS, works on a touch hold, quotes the EXACT price. */}
            <title>
              #{p.tokenId.toString()} — {formatSoso(p.priceWei)} SOSO, {agoLabel(p.ago)} ago
            </title>
          </circle>
        ))}
      </svg>

      <p className="pc-foot">
        Sales settled through this marketplace. A piece moved by a direct transfer isn&rsquo;t on
        it, and times are estimated from block numbers.
      </p>
    </div>
  );
}
