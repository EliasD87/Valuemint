"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { ActivityRow } from "@/hooks/useActivity";
import { bucketVolume, topCollections, type Bucket, type Grain } from "@/lib/volumeBuckets";
import { formatSoso, shortAddress } from "@/lib/format";
import "@/styles/pulse.css";

/**
 * How much traded, when, and in what — as columns.
 *
 * ---
 *
 * **It replaced a scatter of every event, and on purpose.** The scatter put
 * each listing, sale, offer and delisting on price against time, on a log axis
 * eight decades tall. It was faithful and it was hard to read: 218 listing
 * rings drowned 67 sales, bulk listings stacked seventeen deep on one pixel,
 * and the question most people bring to a stats page — is this market
 * busy, and who is busy in it — was answerable only by squinting at density.
 * This answers it directly: one column per stretch of time, as tall as the
 * SOSO that settled in it, split by the collections that settled it.
 *
 * **Sales only.** A listing is an intention and an offer is a question; the
 * columns are money that actually moved, and they add up to the page's own
 * "SOSO settled" figure. See `lib/volumeBuckets.ts`.
 *
 * **Three collections get a colour; the rest are "Other".** Four series is the
 * most a stacked column carries before the colours stop being tellable apart,
 * and the three are the biggest by ALL-TIME volume, so switching between
 * "24 hours" and "7 days" never repaints a collection. The palette, its order
 * and the reason Other sits at the base are in `styles/tokens.css`.
 *
 * **Every value is reachable without a pointer.** Hover or arrow-key a column
 * for its breakdown; "Table" shows the same numbers as rows. One of the four
 * colours is under 3:1 on the light ground, and a table is the honest answer
 * to that rather than a darker colour nobody validated.
 */

/** Chart padding: room for the price ticks on the left and the times below. */
const PAD = { top: 22, right: 6, bottom: 28, left: 46 };

/** The widest a column may be. Past this it is a block, not a bar. */
const MAX_BAR = 24;

/** Surface gap between stacked segments, in px. */
const GAP = 2;

/** Rounding on a column's data end; the baseline end stays square. */
const RADIUS = 4;

/** The least a column with any sales is drawn, in px. */
const MIN_STUB = 2;

const SERIES_CLASS = ["pv-s0", "pv-s1", "pv-s2", "pv-s3"];

/** Wei to a float SOSO for placement only. Every printed figure is `formatSoso`. */
function toSoso(wei: bigint): number {
  return Number(wei / 1_000_000_000_000n) / 1e6;
}

/** 1, 2, 2.5 or 5 times a power of ten, at least `rough`. */
function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * magnitude >= rough) return m * magnitude;
  return 10 * magnitude;
}

/** An axis tick: "0", "750", "1.5k", "12k". */
function tickLabel(value: number): string {
  if (value >= 1000) return `${+(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return String(+value.toFixed(value < 10 ? 2 : 0));
}

/* Buckets start on the hour, so minutes are always ":00" and only cost width:
   "6 PM", or "18" where the reader's locale counts that way. */
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric" });

/* Assembled rather than asked for in one call: `{ weekday, day }` together
   comes back as "22 Tue" in Chrome's en-US, which nobody writes. */
const day = (ms: number) =>
  `${new Date(ms).toLocaleDateString([], { weekday: "short" })} ${new Date(ms).getDate()}`;

/** What a bucket covers, the way a person would say it. */
function spanLabel(bucket: Bucket, grain: Grain): string {
  if (grain === "day") {
    return `${day(bucket.start)} ${new Date(bucket.start).toLocaleDateString([], { month: "short" })}`;
  }
  return `${day(bucket.start)} · ${time(bucket.start)} – ${time(bucket.end)}`;
}

/**
 * The label under a column, or nothing.
 *
 * Hourly: the hour, except at midnight, where the day is the more useful word.
 * Quarter-days: only the day, at each midnight — four labels a day is a row of
 * repeated times. Daily: the day.
 */
function axisLabel(bucket: Bucket, grain: Grain): string | undefined {
  const d = new Date(bucket.start);
  if (grain === "hour") return d.getHours() === 0 ? day(bucket.start) : time(bucket.start);
  if (grain === "sixHours") return d.getHours() === 0 ? day(bucket.start) : undefined;
  return day(bucket.start);
}

const GRAIN_WORD: Record<Grain, string> = {
  hour: "per hour",
  sixHours: "per 6 hours",
  day: "per day",
};

/**
 * An element's width, measured at 1:1 so a 24px column is 24px everywhere.
 *
 * A callback ref rather than a `useRef`: the chart first renders a placeholder
 * while the chain head loads, so the element being measured does not exist on
 * the first pass. An effect keyed on a `useRef` object runs once, finds
 * nothing, and never looks again — the chart would sit at width 0 for good.
 * Holding the node in state re-subscribes whenever the element changes.
 */
function useMeasured(): [(node: HTMLElement | null) => void, number, HTMLElement | null] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (node === null) return;
    const measure = () => setWidth((w) => (w === node.clientWidth ? w : node.clientWidth));
    /* Once now, not only in the observer: an observer callback rides the frame
       loop, and a document nobody is painting has none. */
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width, node];
}

export function PulseVolume({
  rows,
  all,
  head,
  hours,
  nameFor,
}: {
  /** The chosen window's rows. */
  rows: ReadonlyArray<ActivityRow>;
  /** Every visible row, which the colours are chosen from so they never move. */
  all: ReadonlyArray<ActivityRow>;
  head: bigint | undefined;
  hours: number | undefined;
  nameFor: (address: string) => string | undefined;
}) {
  const [measureRef, width, measured] = useMeasured();
  const [active, setActive] = useState<number | undefined>(undefined);
  const [asTable, setAsTable] = useState(false);

  const series = useMemo(() => topCollections(all), [all]);

  /* `now` is read once per data change rather than per render, so a hover does
     not shift every column by the milliseconds since the last one. */
  const chart = useMemo(() => {
    if (head === undefined) return undefined;
    return bucketVolume({ rows, head, nowMs: Date.now(), hours, series });
  }, [rows, head, hours, series]);

  /* A new window is a new set of columns; an index into the old one is noise.
     Keyed on the window, not on `chart`: the chart is rebuilt on every block,
     and resetting there closed the tooltip under a mouse that had not moved. */
  useEffect(() => setActive(undefined), [hours]);

  const labelOf = (address: string) => nameFor(address) ?? shortAddress(address as `0x${string}`, 4);

  /** Legend entries: the named three in slot order, then Other. */
  const legend = useMemo(() => {
    if (chart === undefined) return [];
    const totals = Array.from({ length: series.length + 1 }, () => 0n);
    for (const b of chart.buckets) b.parts.forEach((p, i) => (totals[i]! += p));
    return [
      ...series.map((address, i) => ({ slot: i + 1, name: labelOf(address), total: totals[i + 1]! })),
      { slot: 0, name: "Other", total: totals[0]! },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, nameFor]);

  if (chart === undefined) {
    return <div className="pv pv-wait skeleton" aria-hidden="true" />;
  }

  const { grain, buckets } = chart;
  /* The chosen column, if the rebuilt chart still has one at that index. */
  const focus = active !== undefined && active < buckets.length ? active : undefined;
  const height = Math.round(Math.min(320, Math.max(220, width * 0.28)));
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotH;

  const peak = buckets.reduce((m, b) => (b.total > m ? b.total : m), 0n);
  const peakSoso = toSoso(peak);
  const step = niceStep(peakSoso / 4);
  const top = peakSoso === 0 ? 1 : Math.ceil(peakSoso / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  const Y = (soso: number) => baseline - (soso / top) * plotH;

  const slot = plotW / buckets.length;
  /* The 2px between neighbouring columns is taken out of the slot, so columns
     never touch however narrow the chart gets. */
  const barW = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const xOf = (i: number) => PAD.left + i * slot + (slot - barW) / 2;

  /*
   * Time labels, spaced by distance rather than by index.
   *
   * It was `i % every === 0`, which is fine while every column may carry a
   * label and silently wrong when only some can. Quarter-days label only their
   * midnights, every fourth column; on a phone `every` came out as 8, and a
   * window starting at noon puts its midnights at 2, 6, 10… — none divisible
   * by 8, so the axis had no labels at all. Walking the eligible ones and
   * keeping each that clears the last by enough room cannot miss them all.
   */
  const timeLabels: { key: number; x: number; text: string }[] = [];
  let lastLabelX = -Infinity;
  buckets.forEach((bucket, i) => {
    const text = axisLabel(bucket, grain);
    if (text === undefined) return;
    /* A quarter-day label names the whole day, so it is centred on the day's
       four columns rather than under the first. Under midnight it sat beside
       the afternoon's columns and they read as belonging to the next day. */
    const x = grain === "sixHours" ? PAD.left + (i + 2) * slot : xOf(i) + barW / 2;
    /* 60px holds "Wed 23" or "11 PM" with air; the right edge keeps a
       centred label from being cut by the frame. */
    if (x - lastLabelX < 60 || x + 22 > width) return;
    timeLabels.push({ key: bucket.start, x, text });
    lastLabelX = x;
  });
  const peakIndex = buckets.findIndex((b) => b.total === peak && peak > 0n);

  const pick = (clientX: number) => {
    const rect = measured?.getBoundingClientRect();
    if (rect === undefined) return;
    const i = Math.floor((clientX - rect.left - PAD.left) / slot);
    setActive(i >= 0 && i < buckets.length ? i : undefined);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = buckets.length - 1;
    const at = focus ?? last;
    let next: number | undefined;
    if (event.key === "ArrowLeft") next = Math.max(0, at - 1);
    else if (event.key === "ArrowRight") next = Math.min(last, at + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "Escape") {
      setActive(undefined);
      return;
    } else return;
    event.preventDefault();
    setActive(next);
  };

  const shown = focus === undefined ? undefined : buckets[focus];
  const totalSales = buckets.reduce((n, b) => n + b.sales, 0);

  return (
    <section className="pv" aria-label="Volume traded">
      <div className="pv-head">
        <p className="pv-title">
          SOSO traded <span className="pv-grain">{GRAIN_WORD[grain]}</span>
        </p>

        {/* The legend is the identity channel; colour is never asked to do it
            alone. Each entry carries its window total, so it doubles as the
            answer to "how much did each of these do". */}
        <ul className="pv-legend">
          {legend.map((entry) => (
            <li key={entry.slot} className={entry.total === 0n ? "is-idle" : undefined}>
              <i className={`pv-dot ${SERIES_CLASS[entry.slot]}`} aria-hidden="true" />
              <span className="pv-name">{entry.name}</span>
              <span className="pv-amount">{formatSoso(entry.total, 2)}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="pv-toggle"
          aria-pressed={asTable}
          onClick={() => setAsTable((t) => !t)}
        >
          {asTable ? "Chart" : "Table"}
        </button>
      </div>

      {/* The measured element: unpadded, so its width IS the drawing's width,
          and mounted whichever view is showing, so the measurement survives a
          trip to the table and back. */}
      <div className="pv-body" ref={measureRef}>
      {asTable ? (
        <VolumeTable buckets={buckets} grain={grain} series={series} labelOf={labelOf} />
      ) : (
        <div
          className="pv-frame"
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setActive(undefined)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(undefined)}
          aria-label="Volume chart. Use the arrow keys to read each column."
        >
          {width === 0 ? null : (
            <svg
              className="pv-svg"
              width={width}
              height={height}
              role="img"
              aria-label={`SOSO traded ${GRAIN_WORD[grain]}: ${formatSoso(
                buckets.reduce((s, b) => s + b.total, 0n),
                2,
              )} SOSO across ${totalSales} ${totalSales === 1 ? "sale" : "sales"}${
                peakIndex === -1
                  ? ""
                  : `, the busiest being ${spanLabel(buckets[peakIndex]!, grain)} at ${formatSoso(peak, 2)} SOSO`
              }.`}
            >
              {/* Solid hairlines. Dashed ones read as a threshold or a
                  projection, and these are neither. */}
              <g className="pv-grid">
                {ticks.map((v) => (
                  <g key={v}>
                    <line x1={PAD.left} x2={width - PAD.right} y1={Y(v)} y2={Y(v)} />
                    <text x={PAD.left - 8} y={Y(v) + 4}>
                      {tickLabel(v)}
                    </text>
                  </g>
                ))}
              </g>

              <g className={`pv-bars${focus === undefined ? "" : " is-focusing"}`}>
                {buckets.map((bucket, i) => {
                  if (bucket.total === 0n) return null;
                  const x = xOf(i);
                  /* A column that rounds to nothing still had sales. Two
                     cents beside a 2,500 SOSO column is a hundredth of a
                     pixel, and drawing that honestly draws it the same as an
                     idle period. So it gets a 2px stub in the colour of
                     whatever dominated it: marked as busy, still flat enough
                     that nobody reads a quantity into it. */
                  if ((toSoso(bucket.total) / top) * plotH < MIN_STUB) {
                    const main = bucket.parts.reduce<number>(
                      (at, p, s) => (p > bucket.parts[at]! ? s : at),
                      0,
                    );
                    return (
                      <g key={bucket.start} className={i === focus ? "is-active" : undefined}>
                        <rect
                          className={SERIES_CLASS[main]}
                          x={x}
                          y={baseline - MIN_STUB}
                          width={barW}
                          height={MIN_STUB}
                        />
                      </g>
                    );
                  }
                  let cursor = baseline;
                  /* The topmost drawn segment is the one that gets the rounded
                     end, so find it before drawing. */
                  const lastDrawn = bucket.parts.reduce<number>(
                    (at, p, s) => (p > 0n ? s : at),
                    -1,
                  );
                  return (
                    <g key={bucket.start} className={i === focus ? "is-active" : undefined}>
                      {bucket.parts.map((part, s) => {
                        if (part === 0n) return null;
                        const h = (toSoso(part) / top) * plotH;
                        const yTop = cursor - h;
                        cursor = yTop;
                        const isTop = s === lastDrawn;
                        /* Every segment but the top one gives up 2px at its top
                           edge to the surface gap. The column's total height is
                           still exact: the gap is taken from inside it. */
                        const drawTop = isTop ? yTop : yTop + GAP;
                        const drawH = yTop + h - drawTop;
                        if (drawH < 0.75) return null;
                        if (!isTop) {
                          return (
                            <rect
                              key={s}
                              className={SERIES_CLASS[s]}
                              x={x}
                              y={drawTop}
                              width={barW}
                              height={drawH}
                            />
                          );
                        }
                        const r = Math.min(RADIUS, barW / 2, drawH);
                        const bottom = drawTop + drawH;
                        const d = `M${x} ${bottom}V${drawTop + r}Q${x} ${drawTop} ${x + r} ${drawTop}H${
                          x + barW - r
                        }Q${x + barW} ${drawTop} ${x + barW} ${drawTop + r}V${bottom}Z`;
                        return <path key={s} className={SERIES_CLASS[s]} d={d} />;
                      })}
                    </g>
                  );
                })}
              </g>

              {/* One direct label: the busiest column's total, on its cap. A
                  number on every column is a wall nobody reads; the extreme is
                  the one worth naming, and the axis carries the rest. */}
              {peakIndex === -1 || focus !== undefined ? null : (
                <text
                  className="pv-cap"
                  x={xOf(peakIndex) + barW / 2}
                  y={Math.max(PAD.top - 6, Y(peakSoso) - 6)}
                >
                  {formatSoso(peak, 0)}
                </text>
              )}

              <line className="pv-axis" x1={PAD.left} x2={width - PAD.right} y1={baseline} y2={baseline} />

              <g className="pv-times">
                {timeLabels.map((label) => (
                  <text key={label.key} x={label.x} y={height - 8}>
                    {label.text}
                  </text>
                ))}
              </g>

              {peak === 0n ? (
                <text className="pv-empty" x={PAD.left + plotW / 2} y={PAD.top + plotH / 2}>
                  No sales in this window
                </text>
              ) : null}
            </svg>
          )}

          {shown === undefined || width === 0 ? null : (
            <Tip
              bucket={shown}
              grain={grain}
              series={series}
              labelOf={labelOf}
              x={xOf(focus!) + barW / 2}
              width={width}
            />
          )}
        </div>
      )}
      </div>
    </section>
  );
}

/**
 * One column's breakdown.
 *
 * Every collection that traded in it, including the ones folded into Other —
 * the fold is for the colours, not for the facts.
 */
function Tip({
  bucket,
  grain,
  series,
  labelOf,
  x,
  width,
}: {
  bucket: Bucket;
  grain: Grain;
  series: ReadonlyArray<string>;
  labelOf: (address: string) => string;
  x: number;
  width: number;
}) {
  const TIP = 232;
  /* Centred on the column, held inside the frame at both ends. */
  const left = Math.max(4, Math.min(width - TIP - 4, x - TIP / 2));
  const others = [...bucket.byCollection.entries()]
    .filter(([address]) => !series.includes(address))
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));

  return (
    <div className="pv-tip" style={{ left, width: TIP }} role="status">
      <p className="pv-tip-when">{spanLabel(bucket, grain)}</p>
      {bucket.sales === 0 ? (
        <p className="pv-tip-none">No sales</p>
      ) : (
        <>
          <p className="pv-tip-total">
            {formatSoso(bucket.total, 2)} SOSO
            <span>
              {" "}
              · {bucket.sales} {bucket.sales === 1 ? "sale" : "sales"}
            </span>
          </p>
          <ul>
            {series.map((address, i) =>
              bucket.parts[i + 1]! > 0n ? (
                <li key={address}>
                  <i className={`pv-dot ${SERIES_CLASS[i + 1]}`} aria-hidden="true" />
                  <span className="pv-name">{labelOf(address)}</span>
                  <span className="pv-amount">{formatSoso(bucket.parts[i + 1], 2)}</span>
                </li>
              ) : null,
            )}
            {others.map(([address, v]) => (
              <li key={address}>
                <i className="pv-dot pv-s0" aria-hidden="true" />
                <span className="pv-name">{labelOf(address)}</span>
                <span className="pv-amount">{formatSoso(v, 2)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * The same numbers as rows, newest first, busy periods only.
 *
 * Not a nicety: the aqua series is under 3:1 against a white page, and a table
 * is what makes every value readable without telling colours apart at all.
 */
function VolumeTable({
  buckets,
  grain,
  series,
  labelOf,
}: {
  buckets: ReadonlyArray<Bucket>;
  grain: Grain;
  series: ReadonlyArray<string>;
  labelOf: (address: string) => string;
}) {
  const busy = [...buckets].filter((b) => b.sales > 0).reverse();
  if (busy.length === 0) return <p className="pv-table-empty">No sales in this window.</p>;

  return (
    <div className="pv-table-wrap">
      <table className="pv-table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Total</th>
            {series.map((address) => (
              <th key={address} scope="col">
                {labelOf(address)}
              </th>
            ))}
            <th scope="col">Other</th>
            <th scope="col">Sales</th>
          </tr>
        </thead>
        <tbody>
          {busy.map((b) => (
            <tr key={b.start}>
              <th scope="row">{spanLabel(b, grain)}</th>
              <td>{formatSoso(b.total, 2)}</td>
              {series.map((address, i) => (
                <td key={address}>{b.parts[i + 1]! > 0n ? formatSoso(b.parts[i + 1], 2) : "—"}</td>
              ))}
              <td>{b.parts[0]! > 0n ? formatSoso(b.parts[0], 2) : "—"}</td>
              <td>{b.sales}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
