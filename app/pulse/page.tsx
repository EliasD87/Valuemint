"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useBlockNumber } from "wagmi";
import { useActivity, type ActivityRow } from "@/hooks/useActivity";
import { useAllCollections } from "@/hooks/useAllCollections";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PulseField, type PulseSelection } from "@/components/PulseField";
import { Sortie } from "@/components/Sortie";
import { Soso } from "@/components/Soso";
import { isHidden } from "@/config/hidden";
import { formatSoso, shortAddress, timeAgo } from "@/lib/format";
/* `.filters` and `.filt` — the window toggles below — live in `home.css`, the
   same way /market, /mint and /portfolio reach them. Sharing the stylesheet is
   the established convention here; a second copy of the pill would drift. */
import "@/styles/home.css";
import "@/styles/pulse.css";

/**
 * The market, all of it, on one screen.
 *
 * `/activity` answers "what happened to this piece" and answers it well. It
 * cannot answer "what is this market doing", because a list is read a row at a
 * time and a market is a shape — where the asks cluster, which ones nobody
 * took, whether today looks like yesterday. This page is that shape, and the
 * list is one click away for anyone who wants the record instead.
 *
 * It costs nothing. Every figure below is a fold over `useActivity(undefined)`
 * — the same react-query entry `/activity` and every history panel on the site
 * already share, keyed without a collection precisely so that they do. No
 * artwork is loaded, no metadata resolved, no token read. The only other hook
 * here is `useAllCollections`, the cached multicall the home page, /collections
 * and /market all mount anyway, used for one thing: turning an address into a
 * name. If the registry has not answered, the page renders complete with short
 * addresses instead.
 *
 * Deliberately no timer. There are already twenty-odd `refetchInterval`s in
 * this app and this page does not need the twenty-first: react-query refetches
 * on window focus, so coming back to the tab is the refresh, and the button in
 * the controls is there for anyone who wants it sooner.
 *
 *
 * WHY THE WINDOW IS SHORT, AND IT IS NOT A LIMIT
 * ----------------------------------------------
 * The feed reads Seaport's own logs, and Seaport went live on ValueChain at
 * block 14,407,869 — 16 September 2026. "Everything" really is everything: the
 * full life of this marketplace's trading engine, currently under a week.
 *
 * Nothing here truncates it. `orderBookFloor` caps a scan at ~108 days and does
 * not bite for another three months; the index holds the same range. Trades
 * older than that date exist, but they settled through ValueChainMarketplace v3
 * (paused the same day) and its `Sale`/`Listed`/`OfferMade` events, which this
 * feed does not decode. Showing them means reading three retired contracts with
 * a different ABI and merging two event vocabularies into one row type — real
 * work, not a constant to raise.
 */

/** ValueChain's block time, measured. Shared with `Activity` and `PulseField`. */
const SECONDS_PER_BLOCK = 2.065;

const LABEL: Record<ActivityRow["kind"], string> = {
  sale: "Sold",
  listed: "Listed",
  cancelled: "Delisted",
  offer: "Offer",
};

/** How many of the newest events the readable stream carries. */
const STREAM = 18;

/** How many collections the movers table names before it stops. */
const MOVERS = 6;

/**
 * The narrowest frame the plot is worth drawing in.
 *
 * Above it the field is an instrument; below it there is no wheel to zoom
 * with, a fingertip covers a dozen overlapping marks, and the axis strips are
 * the only way to move — which is navigation without a destination. 700px puts
 * the cut above every phone and below every laptop, and a desktop window
 * dragged narrower loses it too, which is the honest behaviour rather than a
 * special case for a device.
 */
const FIELD_MIN = "(min-width: 700px)";

/**
 * How far back to look.
 *
 * Trading here is bursty — quiet days and then forty events in an evening — so
 * a single fixed window is wrong twice over: wide enough to hold the history
 * and the busy evening is a smear at one edge, narrow enough to spread that
 * evening out and the history is gone. This is a filter over rows already in
 * memory, so switching costs nothing and fetches nothing.
 */
const WINDOWS: { label: string; hours?: number }[] = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "Everything" },
];

export default function PulsePage() {
  const { rows: all, isLoading, logsUnavailable, logsPartial, refetch } = useActivity(undefined);
  const { collections } = useAllCollections();

  /** Twelve seconds of staleness cannot change what "3 hours ago" says. */
  const { data: head } = useBlockNumber({ query: { staleTime: 12_000 } });

  const [hours, setHours] = useState<number | undefined>(undefined);
  const [pinned, setPinned] = useState<PulseSelection | undefined>(undefined);

  const field = useMediaQuery(FIELD_MIN);

  /* Escape lets go, the way it does of every other transient thing on the site.
     Clicking empty field does too — this is for whoever reaches for the key. */
  useEffect(() => {
    if (pinned === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  /**
   * Hidden collections are hidden here too.
   *
   * Not a detail: SoDEX's two retired test contracts carry 9,623 test boxes
   * between them, which is most of the events this chain has ever produced. On
   * a page whose whole claim is "this is what the market is doing", leaving
   * them in would make the picture almost entirely a picture of a test.
   */
  const visible = useMemo(() => all.filter((r) => !isHidden(r.collection)), [all]);

  /**
   * Nothing to show yet, as opposed to nothing to show.
   *
   * `visible.length` and not `rows.length`: a refetch with the window narrowed
   * to an empty stretch is not a loading page, and treating it as one would
   * replace a true answer with a shimmer.
   */
  const loading = isLoading && visible.length === 0;

  /**
   * The chosen window, or everything.
   *
   * Every figure on the page reads from this rather than from `visible`, so the
   * counts, the movers and the field always describe the same span. A stat row
   * that quietly stayed all-time under a 24-hour chart would be the worst of
   * both.
   */
  const rows = useMemo(() => {
    if (hours === undefined || head === undefined) return visible;
    const back = BigInt(Math.round((hours * 3600) / SECONDS_PER_BLOCK));
    if (head < back) return visible;
    const floor = head - back;
    return visible.filter((r) => r.blockNumber >= floor);
  }, [visible, hours, head]);

  /* A pin that is no longer in the window is a card describing something the
     field is not drawing. */
  useEffect(() => setPinned(undefined), [hours]);

  const nameFor = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of collections) names.set(c.address.toLowerCase(), c.name);
    return (address: string) => names.get(address.toLowerCase());
  }, [collections]);

  const stats = useMemo(() => {
    const traders = new Set<string>();
    const seen = new Set<string>();
    let volume = 0n;
    let sales = 0;
    let listings = 0;
    let offers = 0;

    for (const row of rows) {
      seen.add(row.collection.toLowerCase());
      if (row.from !== undefined) traders.add(row.from.toLowerCase());
      if (row.to !== undefined) traders.add(row.to.toLowerCase());

      if (row.kind === "sale") {
        sales += 1;
        volume += (row.price ?? 0n) * row.amount;
      }
      if (row.kind === "listed") listings += 1;
      if (row.kind === "offer") offers += 1;
    }

    const oldest = rows[rows.length - 1]?.blockNumber;
    const newest = rows[0]?.blockNumber;
    const span =
      oldest === undefined || newest === undefined
        ? undefined
        : (Number(newest - oldest) * SECONDS_PER_BLOCK) / 3600;

    return { traders: traders.size, collections: seen.size, volume, sales, listings, offers, span };
  }, [rows]);

  /** Who is actually moving, by what settled rather than by what was asked. */
  const movers = useMemo(() => {
    const byCollection = new Map<
      string,
      { address: `0x${string}`; events: number; sales: number; volume: bigint }
    >();

    for (const row of rows) {
      const key = row.collection.toLowerCase();
      const entry = byCollection.get(key) ?? {
        address: row.collection,
        events: 0,
        sales: 0,
        volume: 0n,
      };
      entry.events += 1;
      if (row.kind === "sale") {
        entry.sales += 1;
        entry.volume += (row.price ?? 0n) * row.amount;
      }
      byCollection.set(key, entry);
    }

    return [...byCollection.values()]
      .sort((a, b) => (b.volume === a.volume ? b.events - a.events : b.volume > a.volume ? 1 : -1))
      .slice(0, MOVERS);
  }, [rows]);

  const busiest = movers[0]?.volume ?? 0n;

  /** A block, dated. The same conversion `Activity` uses, and just as approximate. */
  const when = (block: bigint) =>
    head === undefined
      ? `#${block.toString()}`
      : timeAgo(Math.floor(Date.now() / 1000) - Number(head - block) * SECONDS_PER_BLOCK);

  return (
    <section className="page section pulse">
      <div className="head">
        <h2 className="pulse-title">ValueMint Pulse</h2>
      </div>

      {logsUnavailable ? null : (
        <div className="pulse-controls">
          {/* `Sortie` rather than three buttons of this page's own: it is the
              control the market and collection pages already use, and it is
              shared precisely so a copy cannot drift and lose `aria-pressed`. */}
          <div className="filters pulse-windows" role="group" aria-label="How far back to look">
            {WINDOWS.map((w) => (
              <Sortie key={w.label} active={hours === w.hours} onClick={() => setHours(w.hours)}>
                {w.label}
              </Sortie>
            ))}
          </div>

          {/* The controls are up before the data, so the page has its shape
              from the first paint and nothing jumps when the rows land. The
              count is the one part that cannot be honest yet — "0 events" is a
              claim about the market, not a loading state. */}
          {loading ? (
            <span className="skeleton pulse-bar" style={{ width: "9rem", height: "11px" }} />
          ) : (
            <span className="pulse-span dim">
              {rows.length} {rows.length === 1 ? "event" : "events"}
              {stats.span === undefined
                ? null
                : stats.span < 48
                  ? ` across ${Math.round(stats.span)} hours`
                  : ` across ${Math.round(stats.span / 24)} days`}
            </span>
          )}

          <button className="pulse-refresh" type="button" onClick={() => void refetch()}>
            Refresh
          </button>
        </div>
      )}

      {loading ? (
        <Waiting field={field} />
      ) : logsUnavailable ? (
        /* "Nothing traded" and "we could not read what traded" are different
           statements, and only the second is ever true after a refused scan. */
        <p className="act-note">
          Event logs could not be read just now. This is not an empty market &mdash; try
          again in a moment.
        </p>
      ) : visible.length === 0 ? (
        <p className="act-note">Nothing has traded here yet.</p>
      ) : rows.length === 0 ? (
        /* An empty window is a fact about the window, not about the market.
           Saying "nothing has traded" here would be false, and the rows are
           still in memory one click away. */
        <p className="act-note">
          Nothing traded in this window. The full record has {visible.length} events.
        </p>
      ) : (
        <>
          <Ticker rows={rows} nameFor={nameFor} />

          <ul className="pulse-figures">
            <li>
              <span className="pulse-fig">{stats.sales}</span>
              <span className="pulse-cap">pieces sold</span>
            </li>
            <li>
              {/* The bare figure, with the unit in the caption. `Soso` sets
                  `white-space: nowrap`, and mark plus figure plus "SOSO" does
                  not fit a half-width tile on a phone — it was clipped to
                  "2996.03 SOS". A stat tile's caption is where a unit belongs
                  anyway, and it makes all six figures read alike. */}
              <span className="pulse-fig">{formatSoso(stats.volume, 2)}</span>
              {/* "through Seaport" was plumbing showing through the paint. */}
              <span className="pulse-cap">SOSO settled</span>
            </li>
            <li>
              <span className="pulse-fig">{stats.listings}</span>
              <span className="pulse-cap">listings written</span>
            </li>
            <li>
              <span className="pulse-fig">{stats.offers}</span>
              <span className="pulse-cap">offers made</span>
            </li>
            <li>
              <span className="pulse-fig">{stats.traders}</span>
              <span className="pulse-cap">wallets involved</span>
            </li>
            <li>
              <span className="pulse-fig">{stats.collections}</span>
              <span className="pulse-cap">collections moving</span>
            </li>
          </ul>

          {/*
            The field is a desktop instrument, and below `FIELD_MIN` it is not
            offered at all.

            Not hidden with CSS — not rendered. Two hundred marks in a 333px
            frame overlap into a smear, there is no wheel to zoom them apart,
            and picking one of them with a fingertip is a coin toss. What is
            left after that is a picture that cannot be read and cannot be
            interrogated, and building it costs a phone a few hundred SVG
            nodes, a ResizeObserver and a pointer pipeline to produce it.

            The page is complete without it: the ticker, the figures, the
            movers and the stream all carry the same window, and the legend
            goes with the field because a key to marks nobody can see is
            noise.
          */}
          {field ? (
            <>
              {/* The pinned event's detail is drawn inside the field, anchored
                  to its own mark. It used to be a strip under the chart, which
                  on a laptop is below the fold — so a click appeared to do
                  nothing. */}
              <PulseField
                rows={rows}
                head={head}
                nameFor={nameFor}
                selected={pinned}
                onSelect={setPinned}
              />

              <div className="pulse-legend">
                <span className="pl-key">
                  <i className="pl-sale" /> Sold
                </span>
                <span className="pl-key">
                  <i className="pl-listed" /> Listed
                </span>
                <span className="pl-key">
                  <i className="pl-offer" /> Offer
                </span>
                <span className="pl-key">
                  <i className="pl-thread" /> Listing &rarr; sale
                </span>
                <span className="pl-key">
                  <i className="pl-rug" /> Delisted
                </span>
                {/* Two words, not the sentence that used to explain the
                    decades. The axis labels already read 10k, 1k, 100 — this
                    only has to name what they are. */}
                <span className="pl-note dim">Log scale</span>
              </div>
            </>
          ) : null}

          <div className="pulse-split">
            <div className="pulse-panel">
              <p className="pulse-panel-title">What is moving</p>
              <ul className="pulse-movers">
                {movers.map((m) => (
                  <li key={m.address}>
                    <Link className="pm-name" href={`/collection/${m.address}`}>
                      {nameFor(m.address) ?? shortAddress(m.address)}
                    </Link>
                    <span className="pm-bar" aria-hidden="true">
                      {/* Width against the busiest, so the column is a
                          comparison rather than six full bars. */}
                      <i
                        style={{
                          width:
                            busiest === 0n ? "0%" : `${Number((m.volume * 100n) / busiest)}%`,
                        }}
                      />
                    </span>
                    <span className="pm-figure">
                      {/* Default precision, not whole SOSO. Rounding a
                          collection that settled 0.0002 down to "0" reads as
                          "nothing sold here", which is the opposite of true. */}
                      <Soso size={14}>{formatSoso(m.volume)}</Soso>
                    </span>
                    {/* The footnote that explained this column is gone; the
                        column explains itself on hover instead. */}
                    <span className="pm-events dim" title="Sales / total events">
                      {m.sales}/{m.events}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pulse-panel">
              <p className="pulse-panel-title">As it happened</p>
              {/* The readable counterpart of the field above: the same events,
                  in the accessibility tree, in order. The chart is aria-hidden
                  because of this list, not instead of it. */}
              <ul className="pulse-stream">
                {rows.slice(0, STREAM).map((row) => (
                  <li key={`${row.blockNumber}-${row.logIndex}-${row.kind}-${row.tokenId}`}>
                    <span className={`act-kind act-kind-${row.kind}`}>{LABEL[row.kind]}</span>
                    <Link className="ps-what" href={`/token/${row.collection}/${row.tokenId}`}>
                      {nameFor(row.collection) ?? shortAddress(row.collection)}{" "}
                      <b>#{row.tokenId.toString()}</b>
                    </Link>
                    <span className="ps-price">
                      {row.price === undefined ? (
                        <span className="dim">&mdash;</span>
                      ) : (
                        <Soso size={14}>{formatSoso(row.price)}</Soso>
                      )}
                    </span>
                    <span className="ps-when dim">{when(row.blockNumber)}</span>
                  </li>
                ))}
              </ul>
              <Link className="act-all" href="/activity">
                See the full record &rarr;
              </Link>
            </div>
          </div>

          {logsPartial ? (
            <p className="act-note">
              Some event types could not be read, so this picture is incomplete.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * The page before it has anything to say.
 *
 * Built from the real classes, so the shimmer occupies the geometry the data
 * will occupy: the same six-tile grid, the same two panels, the same frame for
 * the field. A skeleton that is merely a grey rectangle buys nothing — the
 * page still jumps when the rows land, which is the cost this exists to avoid.
 *
 * The wait is real and worth naming. `useActivity` holds itself back 900ms so
 * the reads a page actually paints with go first, then the index answers, then
 * a few hundred logs are decoded. That is a second or more of nothing, and a
 * bare shimmer says only "something".
 *
 * The phrases cycle rather than advance. Nothing here ticks off a completed
 * step, because the page cannot see those boundaries and a progress bar that
 * invents them is a lie told with an animation — these name the parts of one
 * job that is genuinely in flight.
 */
function Waiting({ field }: { field: boolean }) {
  const stages = [
    "Reading Seaport's logs",
    "Decoding orders",
    "Counting wallets and collections",
    /* On a phone there is no field to plot, and saying so would be the one
       false note in a sequence that is otherwise all true. */
    field ? "Plotting the field" : "Sorting the feed",
  ];

  /*
   * Cycled in JavaScript, and the text is text.
   *
   * The first version stacked all four and cross-faded them in CSS, with the
   * first given `opacity: 1` as the at-rest fallback. That fallback does not
   * work: an infinite animation's 0% keyframe wins over the base rule, so any
   * document that is not running animations — a backgrounded tab, a frozen
   * compositor, print — showed an empty line where the status should be.
   * Measured in that state: computed opacity 0 on all four.
   *
   * This is the same shape as the bug that once rendered the hero deck blank,
   * and the rule it broke is the one this project already wrote down: content
   * must never be reachable only through an animation. So the phrase is plain
   * visible text and the timer only swaps which one. If the timer is throttled
   * to nothing, the first phrase simply stays — still true, still legible.
   */
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStage((s) => s + 1), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pulse-waiting">
      <p className="pulse-stage" role="status">
        <i className="pulse-stage-dot" aria-hidden="true" />
        <span className="pulse-stage-line">{stages[stage % stages.length]}</span>
      </p>

      <div className="pulse-ticker pulse-ticker-wait" aria-hidden="true">
        <div className="pt-run">
          {[132, 88, 164, 104, 148, 92, 176, 116].map((w, i) => (
            <span key={i} className="skeleton pulse-bar" style={{ width: `${w}px`, height: "11px" }} />
          ))}
        </div>
      </div>

      <ul className="pulse-figures" aria-hidden="true">
        {["3.5rem", "6rem", "4rem", "2.5rem", "3rem", "2.5rem"].map((w, i) => (
          <li key={i}>
            <span className="skeleton pulse-bar" style={{ width: w, height: "22px" }} />
            <span className="skeleton pulse-bar" style={{ width: "5.5rem", height: "10px" }} />
          </li>
        ))}
      </ul>

      {field ? <div className="pf pf-wait" aria-hidden="true" /> : null}

      <div className="pulse-split" aria-hidden="true">
        {[0, 1].map((panel) => (
          <div className="pulse-panel" key={panel}>
            <span className="skeleton pulse-bar" style={{ width: "7rem", height: "10px" }} />
            <div className="pulse-wait-rows">
              {Array.from({ length: panel === 0 ? MOVERS : 8 }, (_, i) => (
                <span
                  key={i}
                  className="skeleton pulse-bar"
                  style={{ width: `${96 - i * 4}%`, height: "14px" }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The newest events, moving.
 *
 * Content first, motion second: the track renders in place and is legible at
 * `translateX(0)`, so a reader who never sees the animation — reduced motion,
 * a frozen compositor, an animation that simply fails to start — still gets
 * every word. That failure has shipped here before, in the hero deck.
 */
function Ticker({
  rows,
  nameFor,
}: {
  rows: ActivityRow[];
  nameFor: (address: string) => string | undefined;
}) {
  const feed = rows.slice(0, 24);

  const item = (row: ActivityRow, index: number) => (
    <span className="pt-item" key={`${row.blockNumber}-${row.logIndex}-${index}`}>
      <i className={`pt-dot pt-${row.kind}`} />
      <b>{nameFor(row.collection) ?? shortAddress(row.collection)}</b>
      <span className="dim">#{row.tokenId.toString()}</span>
      {LABEL[row.kind].toLowerCase()}
      {row.price === undefined ? null : <b>{formatSoso(row.price)} SOSO</b>}
    </span>
  );

  return (
    /* Out of the accessibility tree entirely. Every event in here is also in
       the stream panel below, in order and without the motion, so a reader
       using this page as text loses nothing and is spared the same feed
       twice. */
    <div className="pulse-ticker" aria-hidden="true">
      <div className="pt-track">
        {/* Twice, so the loop has somewhere to go. */}
        <div className="pt-run">{feed.map(item)}</div>
        <div className="pt-run">{feed.map(item)}</div>
      </div>
    </div>
  );
}
