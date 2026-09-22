"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import type { ActivityRow } from "@/hooks/useActivity";
import { WalletMark } from "@/components/WalletMark";
import { deployment } from "@/config/contracts";
import { formatSoso, shortAddress, timeAgo } from "@/lib/format";
import "@/styles/pulse.css";

/**
 * The whole market as one picture: every event, placed by when and for how much.
 *
 * `/activity` is the record and reads top to bottom, one row at a time. That is
 * the right shape for "what happened to this piece" and the wrong shape for
 * "what is this market doing" — three hundred rows of LISTED and SOLD do not
 * add up to a shape in anybody's head. Price against time does, immediately:
 * where the asks cluster, which ones nobody took, and how far a sale landed
 * under the listing that produced it.
 *
 * Nothing here is fetched. The page hands down the same rows `/activity`
 * already holds — one react-query entry, `["seaport-activity"]`, shared by
 * every page that shows history — and every figure on the page is a fold over
 * that array. No artwork, no metadata, no per-token reads.
 *
 * Log scale, and not negotiably. Real prices on this chain run from 0.0001
 * SOSO to 10,000 — eight orders of magnitude — and on a linear axis every
 * event under about 300 SOSO is the same row of pixels along the bottom.
 *
 *
 * NAVIGATION
 * ----------
 * Eight decades and six days in one frame means the busy evening is a smear,
 * so the frame moves. It moves *from the axes*, and deliberately not from the
 * plot:
 *
 *   drag or scroll the bottom axis   pan and zoom time
 *   drag or scroll the price labels  pan and zoom price
 *   click a mark                     pin it; click empty space to let go
 *
 * The plot itself takes no wheel and no drag at all. A chart that swallows the
 * wheel is a trap in the middle of a scrolling page: the reader flicks past it
 * and instead of the page moving, the chart silently rescales under them — and
 * on a phone, where the chart is most of the viewport, there is then no way
 * past it. The axes are narrow strips nobody scrolls *through*, so they can own
 * the gesture without stealing it.
 *
 * They are real elements over the svg rather than pointer-zone checks inside
 * it, because `touch-action` is a property of an element: the strips take
 * `none` so a finger drags them, and the svg keeps `auto` so a finger anywhere
 * else scrolls the page exactly as it would over a picture.
 *
 * Panning is a `translate` on two groups rather than recomputed coordinates —
 * a translation cannot distort a circle, so the dots keep their size and the
 * browser moves the layer without React touching a few hundred nodes per
 * frame. Zoom does recompute, because the radii must *not* scale with it.
 */

/** ValueChain's block time, measured. The same figure `Activity` dates rows with. */
const SECONDS_PER_BLOCK = 2.065;

/**
 * Wei to SOSO as a float, six decimals kept.
 *
 * `Number(wei)` alone is lossy above ~9e15 and 10,000 SOSO is 1e22, so the
 * division happens in bigint first. Only ever used to place a dot — every
 * price a reader actually sees goes through `formatSoso` on the original
 * bigint.
 */
function toSoso(wei: bigint): number {
  return Number(wei / 1_000_000_000_000n) / 1e6;
}

/** The floor of the scale. Below this a log is meaningless and a dot is a lie. */
const MIN_SOSO = 1e-6;

/** Far enough to separate two events in the same block; further is just empty. */
const MAX_ZOOM = 80;

/** A drag shorter than this was someone trying to click. */
const CLICK_SLOP = 4;

const PAD = { top: 22, right: 16, bottom: 44, left: 58 };
/** The strip under the axis where delistings live — they have no price. */
const RUG = 18;

export interface PulseSelection {
  row: ActivityRow;
  /** For a sale, the listing it filled, when that listing is in the window. */
  ask?: ActivityRow;
}

interface Mark {
  row: ActivityRow;
  /** Scaled, but not panned: the pan is a group transform. */
  x: number;
  y: number;
  r: number;
}

/** Pan in pixels and zoom per axis. Identity is "the whole window, fitted". */
interface View {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

const FITTED: View = { sx: 1, sy: 1, ox: 0, oy: 0 };

const sameRow = (a: ActivityRow | undefined, b: ActivityRow | undefined) =>
  a !== undefined &&
  b !== undefined &&
  a.blockNumber === b.blockNumber &&
  a.logIndex === b.logIndex &&
  a.kind === b.kind &&
  a.tokenId === b.tokenId;

/**
 * The container's width, measured rather than guessed.
 *
 * The alternative is a fixed `viewBox` and `preserveAspectRatio`, which scales
 * the marks along with the field: dots swell on a wide screen and the axis
 * labels shrink to nothing on a phone. Drawing at 1:1 against the real pixel
 * size keeps a 4px dot 4px everywhere, and makes the hit-testing below a plain
 * subtraction rather than a matrix inverse.
 */
function useWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;

    /* `clientWidth` rather than the observer's `contentRect`, so the two
       measurements agree: `getBoundingClientRect` would include the frame's
       1px border and draw the field two pixels wider than its box. */
    const measure = () =>
      setWidth((previous) => (previous === node.clientWidth ? previous : node.clientWidth));

    /*
     * Measured once here, not only in the observer.
     *
     * A ResizeObserver callback is delivered on the frame loop, and a document
     * that is not being painted has no frame loop — a background tab, a hidden
     * browser pane, a print. Waiting for that first callback means the field
     * is empty for as long as nobody is looking at it, which sounds harmless
     * right up until the thing looking at it is a screenshot.
     */
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

/**
 * A price, for an axis label. No exponents, no float dust.
 *
 * `toPrecision` rather than `toFixed`, because a zoomed axis produces ticks
 * like 0.30000000000000004 — the sum of a step and a floor, not a price
 * anybody wrote.
 */
function priceLabel(value: number): string {
  if (value >= 1000) return `${+(value / 1000).toPrecision(3)}k`;
  if (value >= 1) return String(+value.toPrecision(4));
  return String(+value.toPrecision(2));
}

/**
 * How far back this tick is, at the precision the tick spacing deserves.
 *
 * The unit comes from the *step*, not from the value. Taking it from the value
 * is what put five ticks reading "3d" side by side on a deep zoom: the ticks
 * were fifteen minutes apart and the label rounded all of them to the same
 * day.
 *
 * Below an hour apart it switches to the wall clock, which is what every chart
 * does at close range and is more useful besides — "14:32" can be matched
 * against a transaction someone actually remembers making.
 */
function timeLabel(hours: number, step: number, at: number): string {
  if (step < 1) {
    return new Date(at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (hours === 0) return "now";
  if (hours < 48) return `${Math.round(hours)}h`;

  /* Days alone are only enough when the ticks are a day apart. An hourly tick
     four days back still has to say which hour, or seven neighbouring labels
     all read "3d" — which is what they did. */
  const total = Math.round(hours);
  const days = Math.floor(total / 24);
  const rest = total % 24;
  return step >= 24 || rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

/** A step that lands on 1, 2 or 5 times a power of ten. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  return (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
}

/**
 * Tick spacings, fine enough for a deep zoom and coarse enough for six days.
 *
 * Five minutes is the floor on purpose: blocks land every two seconds, so
 * anything finer is labelling noise.
 */
const HOUR_STEPS = [1 / 12, 1 / 4, 1 / 2, 1, 2, 3, 6, 12, 24, 48, 72, 168, 336];

/** The 1-2-5 ladder inside each decade, so a zoomed-in log axis still has ticks. */
const MANTISSAS = [1, 2, 5];

export function PulseField({
  rows,
  head,
  nameFor,
  selected,
  onSelect,
}: {
  /** Newest first, hidden collections already dropped. */
  rows: ActivityRow[];
  /** The chain head, so a block can be read as a time. Absent until it lands. */
  head?: bigint;
  /** A collection's name, when the registry knows one. */
  nameFor: (address: string) => string | undefined;
  /** The pinned event, owned by the page so it can render the detail below. */
  selected?: PulseSelection;
  onSelect: (selection: PulseSelection | undefined) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useWidth(box);
  const clipId = useId();

  const [view, setView] = useState<View>(FITTED);
  const [hover, setHover] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);

  /**
   * Taller than wide would be wrong and square wastes the span; this lands near
   * 21:9 on a laptop and floors at 300px so a phone still has somewhere to put
   * eight decades.
   */
  const height = Math.round(Math.min(520, Math.max(300, width * 0.42)));

  const base = useMemo(() => {
    const plotTop = PAD.top;
    const axisY = height - PAD.bottom;
    const plotBottom = axisY - RUG;
    const rugY = axisY - RUG / 2;
    const left = PAD.left;
    const right = Math.max(left + 1, width - PAD.right);
    const W = right - left;
    const H = plotBottom - plotTop;

    /* Blocks, not timestamps. Block spacing is constant, so the two are the
       same axis — and a position computed from blocks never shifts under a
       mark when the chain head finally lands. `head` only labels the axis. */
    let minB = rows.length === 0 ? 0n : rows[rows.length - 1]!.blockNumber;
    let maxB = rows.length === 0 ? 1n : rows[0]!.blockNumber;
    for (const row of rows) {
      if (row.blockNumber < minB) minB = row.blockNumber;
      if (row.blockNumber > maxB) maxB = row.blockNumber;
    }
    if (head !== undefined && head > maxB) maxB = head;
    if (maxB <= minB) maxB = minB + 1n;
    const span = Number(maxB - minB);

    /* Decade boundaries, so the gridlines fall on round money. */
    let minP = Number.POSITIVE_INFINITY;
    let maxP = 0;
    for (const row of rows) {
      if (row.price === undefined || row.price <= 0n) continue;
      const value = Math.max(MIN_SOSO, toSoso(row.price));
      if (value < minP) minP = value;
      if (value > maxP) maxP = value;
    }
    const hasPrices = maxP > 0;
    const lo = hasPrices ? Math.floor(Math.log10(minP)) : 0;
    const hi = hasPrices ? Math.max(lo + 1, Math.ceil(Math.log10(maxP))) : 1;

    /** Where a block and a price sit in the fitted frame, as a 0..1 fraction. */
    const u = (block: bigint) => Number(block - minB) / span;
    const v = (soso: number) => (Math.log10(Math.max(MIN_SOSO, soso)) - lo) / (hi - lo);

    return { plotTop, plotBottom, axisY, rugY, left, right, W, H, minB, maxB, span, lo, hi, u, v };
  }, [rows, head, width, height]);

  /**
   * The same fractions, scaled into pixels. Pan is deliberately absent — it is
   * a group `translate`, so a drag never touches these.
   */
  const placed = useMemo(() => {
    const { left, plotTop, plotBottom, W, H, u, v } = base;
    const X = (block: bigint) => left + u(block) * W * view.sx;
    const Y = (soso: number) => plotTop + (plotBottom - v(soso) * H - plotTop) * view.sy;

    const marks: Mark[] = [];
    const rug: { x: number; row: ActivityRow }[] = [];

    for (const row of rows) {
      if (row.price === undefined || row.price <= 0n) {
        rug.push({ x: X(row.blockNumber), row });
        continue;
      }
      const soso = toSoso(row.price);
      marks.push({
        row,
        x: X(row.blockNumber),
        y: Y(soso),
        /* Bigger money, bigger dot — but a decade buys one pixel, so a 10,000
           SOSO listing reads as notable rather than swallowing the field.
           Deliberately not scaled by zoom: a zoom is a magnifying glass over
           the layout, not over the marks. */
        r: 3 + Math.min(4, Math.log10(1 + soso)),
      });
    }

    /*
     * A sale, joined to the listing it came from.
     *
     * This is the one thing a table of the same rows cannot show: the ask and
     * the fill are two lines forty rows apart, and the distance between them
     * is the whole story of the negotiation. Walking oldest-first and keeping
     * the last open ask per token is one pass over an array the page has.
     *
     * A cancellation clears the ask deliberately — a listing that was pulled
     * and replaced should join to the price that actually stood when it sold.
     */
    const byRow = new Map<ActivityRow, Mark>();
    for (const mark of marks) byRow.set(mark.row, mark);

    const openAsk = new Map<string, Mark>();
    const threads: { from: Mark; to: Mark }[] = [];
    /** The ask each sale filled, so a pinned sale can name its own listing. */
    const askFor = new Map<ActivityRow, ActivityRow>();

    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i]!;
      const key = `${row.collection.toLowerCase()}-${row.tokenId}`;

      if (row.kind === "listed") {
        const mark = byRow.get(row);
        if (mark !== undefined) openAsk.set(key, mark);
        continue;
      }
      if (row.kind === "cancelled") {
        openAsk.delete(key);
        continue;
      }
      if (row.kind === "sale") {
        const ask = openAsk.get(key);
        const fill = byRow.get(row);
        if (ask !== undefined && fill !== undefined) {
          threads.push({ from: ask, to: fill });
          askFor.set(row, ask.row);
        }
        openAsk.delete(key);
      }
    }

    return { marks, rug, threads, askFor };
  }, [base, rows, view.sx, view.sy]);

  /* Read by the wheel and drag handlers, which are attached once and must not
     close over a stale frame. */
  const live = useRef({ base, placed, view });
  live.current = { base, placed, view };

  /*
   * A new window means a new domain, so the frame goes back to fitted.
   *
   * Keyed on the oldest block and not on `rows`, which was the first version
   * and was wrong: react-query hands back a new array on every refetch, and
   * refetch-on-focus means someone who zoomed in, switched tab and came back
   * found their frame thrown away. Switching the window moves this floor by
   * days; a refetch only ever adds rows at the head and leaves it alone.
   */
  useEffect(() => setView(FITTED), [base.minB]);

  const clampX = useCallback(
    (ox: number, sx: number) => Math.min(0, Math.max(ox, base.W - base.W * sx)),
    [base.W],
  );
  const clampY = useCallback(
    (oy: number, sy: number) => Math.min(0, Math.max(oy, base.H - base.H * sy)),
    [base.H],
  );

  /**
   * Zoom one axis about the pointer, so the value under it stays under it.
   *
   * `anchor` is in svg coordinates, which is what the clamps and the scales
   * are expressed in — each strip converts from its own box before calling.
   */
  const zoomAxis = useCallback(
    (axis: "x" | "y", factor: number, anchor: number) => {
      setView((previous) => {
        const b = live.current.base;
        /* The point sat at `a + (p - a - o) / s` in fitted space and has to
           land back on the same pixel at the new scale. */
        const keep = (p: number, a: number, s0: number, s1: number, o: number) =>
          p - a - ((p - a - o) / s0) * s1;

        if (axis === "x") {
          const sx = Math.min(MAX_ZOOM, Math.max(1, previous.sx * factor));
          return {
            ...previous,
            sx,
            ox: clampX(keep(anchor, b.left, previous.sx, sx, previous.ox), sx),
          };
        }
        const sy = Math.min(MAX_ZOOM, Math.max(1, previous.sy * factor));
        return {
          ...previous,
          sy,
          oy: clampY(keep(anchor, b.plotTop, previous.sy, sy, previous.oy), sy),
        };
      });
    },
    [clampX, clampY],
  );

  const xAxisRef = useRef<HTMLDivElement>(null);
  const yAxisRef = useRef<HTMLDivElement>(null);

  /*
   * Attached natively rather than through React's `onWheel`, which is passive
   * at the root: `preventDefault` there does nothing, so the page would scroll
   * away underneath the zoom.
   */
  useEffect(() => {
    const xNode = xAxisRef.current;
    const yNode = yAxisRef.current;
    if (xNode === null || yNode === null) return;

    const handler = (axis: "x" | "y", node: HTMLDivElement) => (event: WheelEvent) => {
      event.preventDefault();
      const b = live.current.base;
      const rect = node.getBoundingClientRect();
      /* Each strip's own box, back into svg coordinates. */
      const anchor =
        axis === "x" ? event.clientX - rect.left + b.left : event.clientY - rect.top + b.plotTop;
      zoomAxis(axis, Math.exp(-event.deltaY * 0.0015), anchor);
    };

    const onX = handler("x", xNode);
    const onY = handler("y", yNode);
    xNode.addEventListener("wheel", onX, { passive: false });
    yNode.addEventListener("wheel", onY, { passive: false });
    return () => {
      xNode.removeEventListener("wheel", onX);
      yNode.removeEventListener("wheel", onY);
    };
  }, [zoomAxis, width]);

  /** An in-progress drag on one of the axis strips. */
  const axisDrag = useRef<{ axis: "x" | "y"; from: number; origin: number } | null>(null);

  const onAxisDown = (axis: "x" | "y") => (event: React.PointerEvent<HTMLDivElement>) => {
    /* Capture so the drag survives the pointer leaving a 44px strip, which it
       does almost immediately. Guarded because it throws for a pointer that is
       no longer active — which costs nothing in a real drag and takes the
       whole handler down with it when it happens. */
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Dragging still works, it just stops at the edge of the strip. */
    }
    axisDrag.current = {
      axis,
      from: axis === "x" ? event.clientX : event.clientY,
      origin: axis === "x" ? view.ox : view.oy,
    };
    setDragging(true);
  };

  const onAxisMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = axisDrag.current;
    if (drag === null) return;
    const delta = (drag.axis === "x" ? event.clientX : event.clientY) - drag.from;
    setView((previous) =>
      drag.axis === "x"
        ? { ...previous, ox: clampX(drag.origin + delta, previous.sx) }
        : { ...previous, oy: clampY(drag.origin + delta, previous.sy) },
    );
  };

  const endAxisDrag = () => {
    axisDrag.current = null;
    setDragging(false);
  };

  /** Where the pointer went down, and whether it travelled too far to be a click. */
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  /** The mark nearest a point, or nothing within reach of one. */
  const nearest = useCallback((px: number, py: number): number | undefined => {
    const { placed: p, view: v } = live.current;
    let best: number | undefined;
    let bestDistance = 22 * 22;
    p.marks.forEach((mark, index) => {
      const dx = mark.x + v.ox - px;
      const dy = mark.y + v.oy - py;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }, []);

  /*
   * No pointer capture here, and no `preventDefault` anywhere in these three.
   *
   * Capturing would fight the browser for a touch that is trying to scroll the
   * page — which, over the plot, is what a touch is nearly always trying to
   * do. The svg is as inert to a scroll as an image is.
   */
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      moved: false,
    };
  };

  /**
   * Hover: snap to the nearest mark.
   *
   * A hit target per dot would be several hundred more nodes and would still
   * miss, because the marks overlap wherever the market is busy — which is
   * exactly where anybody points. Nearest-within-22px always resolves to
   * something.
   */
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const start = drag.current;

    /* A finger on its way to scrolling the page is not choosing a mark. */
    if (start !== null && !start.moved && Math.hypot(px - start.x, py - start.y) > CLICK_SLOP) {
      start.moved = true;
    }

    const next = nearest(px, py);
    // Bail out rather than re-render on every pixel of a move inside one dot.
    setHover((previous) => (previous === next ? previous : next));
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    drag.current = null;
    if (start === null || start.moved) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const index = nearest(event.clientX - rect.left, event.clientY - rect.top);

    /* Clicking nothing lets go of whatever was pinned. Anything else and the
       only way out of a pinned state would be to find the same dot again. */
    if (index === undefined) {
      onSelect(undefined);
      return;
    }
    const mark = placed.marks[index]!;
    onSelect(
      sameRow(selected?.row, mark.row)
        ? undefined
        : { row: mark.row, ask: placed.askFor.get(mark.row) },
    );
  };

  /**
   * Gridlines, log while the frame spans decades and linear once it does not.
   *
   * The 1-2-5 ladder inside a decade carries a normal zoom. Past about half a
   * decade in view it runs out — at full zoom the visible band can be 1.0 to
   * 1.3, where the ladder has exactly one rung and the axis loses its scale
   * entirely. Inside a band that narrow the log curve is straight anyway, so
   * plain linear ticks over the visible range are both honest and legible.
   */
  const priceTicks = useMemo(() => {
    const { plotTop, plotBottom, H, lo, hi, v } = base;

    const yOf = (value: number) =>
      plotTop + (plotBottom - v(value) * H - plotTop) * view.sy + view.oy;

    /** The inverse, so the visible band can be asked for directly. */
    const priceAt = (y: number) => {
      const fraction = (H - (y - view.oy - plotTop) / view.sy) / H;
      return 10 ** (lo + fraction * (hi - lo));
    };

    const low = priceAt(plotBottom);
    const high = priceAt(plotTop);
    const out: { y: number; label: string; major: boolean }[] = [];

    if (high > 0 && low > 0 && Math.log10(high / low) < 0.7) {
      const step = niceStep((high - low) / 5);
      for (let value = Math.ceil(low / step) * step; value <= high; value += step) {
        if (value <= 0) continue;
        const y = yOf(value);
        if (y < plotTop - 1 || y > plotBottom + 1) continue;
        out.push({ y, label: priceLabel(value), major: true });
      }
      return out;
    }

    for (let power = lo; power <= hi; power += 1) {
      for (const mantissa of MANTISSAS) {
        const value = mantissa * 10 ** power;
        if (value > 10 ** hi) continue;
        const y = yOf(value);
        if (y < plotTop - 1 || y > plotBottom + 1) continue;
        out.push({ y, label: priceLabel(value), major: mantissa === 1 });
      }
    }

    /* Nearest-first thinning: a decade line survives a crowd before a 2 or a 5
       does, so zooming out degrades to the decades rather than to a random
       five of them. */
    const kept: typeof out = [];
    for (const tick of [...out].sort((a, b) => Number(b.major) - Number(a.major))) {
      if (kept.every((k) => Math.abs(k.y - tick.y) >= 26)) kept.push(tick);
    }
    return kept.sort((a, b) => a.y - b.y);
  }, [base, view.sy, view.oy]);

  /** Round times before now, across whatever slice of the window is on screen. */
  const timeTicks = useMemo(() => {
    const { left, right, W, minB, maxB, span, u } = base;
    if (head === undefined) return [];

    const blockAt = (px: number) => {
      const fraction = (px - left - view.ox) / (W * view.sx);
      return minB + BigInt(Math.round(fraction * span));
    };
    const hoursOf = (block: bigint) => (Number(head - block) * SECONDS_PER_BLOCK) / 3600;

    const newest = Math.max(0, hoursOf(blockAt(right)));
    const oldest = Math.max(newest, hoursOf(blockAt(left)));

    /* Roughly one label every 90px of the visible axis, never fewer than three. */
    const maxTicks = Math.min(9, Math.max(3, Math.floor(W / 90)));
    const step =
      HOUR_STEPS.find((h) => (oldest - newest) / h <= maxTicks) ??
      HOUR_STEPS[HOUR_STEPS.length - 1]!;

    const now = Math.floor(Date.now() / 1000);
    const out: { x: number; label: string }[] = [];
    const first = Math.floor(newest / step) * step;
    for (let hours = first; hours <= oldest + step; hours += step) {
      if (hours < 0) continue;
      const back = BigInt(Math.round((hours * 3600) / SECONDS_PER_BLOCK));
      if (head < back) break;
      const block = head - back;
      if (block < minB || block > maxB) continue;
      const x = left + u(block) * W * view.sx + view.ox;
      if (x < left - 1 || x > right + 1) continue;
      out.push({ x, label: timeLabel(hours, step, now - hours * 3600) });
    }
    return out;
  }, [base, head, view.ox, view.sx]);

  const active = dragging || hover === undefined ? undefined : placed.marks[hover];
  const pinned = useMemo(
    () => placed.marks.find((m) => sameRow(m.row, selected?.row)),
    [placed.marks, selected?.row],
  );
  const pinnedAsk = useMemo(
    () => placed.marks.find((m) => sameRow(m.row, selected?.ask)),
    [placed.marks, selected?.ask],
  );

  /*
   * Drawn once and held.
   *
   * Hovering and panning both set state, and without this the whole field —
   * several hundred nodes — would reconcile on every pointer move. Memoised,
   * React sees the same element and skips it; panning changes one `transform`
   * attribute on the group above it.
   */
  const field = useMemo(
    () => (
      <>
        <g className="pf-threads">
          {placed.threads.map(({ from, to }) => (
            <line
              key={`t-${from.row.blockNumber}-${from.row.logIndex}-${to.row.logIndex}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          ))}
        </g>

        <g>
          {placed.marks.map((mark) => {
            const key = `m-${mark.row.blockNumber}-${mark.row.logIndex}`;

            if (mark.row.kind === "sale") {
              return (
                <g key={key} className="pf-sale">
                  <circle cx={mark.x} cy={mark.y} r={mark.r * 2.4} className="pf-halo" />
                  <circle cx={mark.x} cy={mark.y} r={mark.r} />
                </g>
              );
            }

            if (mark.row.kind === "offer") {
              const r = mark.r;
              const d = `M${mark.x} ${mark.y - r}L${mark.x + r} ${mark.y}L${mark.x} ${
                mark.y + r
              }L${mark.x - r} ${mark.y}Z`;
              return <path key={key} className="pf-offer" d={d} />;
            }

            return <circle key={key} className="pf-listed" cx={mark.x} cy={mark.y} r={mark.r} />;
          })}
        </g>
      </>
    ),
    [placed],
  );

  const rug = useMemo(
    () => (
      <g className="pf-rug">
        {placed.rug.map(({ x, row }) => (
          <line
            key={`r-${row.blockNumber}-${row.logIndex}`}
            x1={x}
            y1={base.rugY - 5}
            x2={x}
            y2={base.rugY + 5}
          />
        ))}
      </g>
    ),
    [placed.rug, base.rugY],
  );

  const latest = placed.marks[0];
  const moved = view.sx !== 1 || view.sy !== 1;

  return (
    <div className="pf" ref={box}>
      {width === 0 ? null : (
        <svg
          ref={svgRef}
          className="pf-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          /* The stream below carries the same events as readable text, so
             nothing is lost by keeping this out of the accessibility tree —
             and a screen reader announcing several hundred unlabelled dots is
             worse than silence. */
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerLeave={() => setHover(undefined)}
        >
          <defs>
            <clipPath id={`${clipId}-plot`}>
              <rect x={base.left} y={base.plotTop} width={base.W} height={base.H} />
            </clipPath>
            <clipPath id={`${clipId}-rug`}>
              <rect x={base.left} y={base.rugY - 7} width={base.W} height={14} />
            </clipPath>
          </defs>

          <g className="pf-grid">
            {/* Keyed by position, not by label: two ticks can legitimately
                round to the same text, and duplicate keys silently drop one. */}
            {priceTicks.map((t) => (
              <g key={t.y} className={t.major ? "" : "pf-minor"}>
                <line x1={base.left} y1={t.y} x2={base.right} y2={t.y} />
                <text x={base.left - 10} y={t.y + 4} textAnchor="end">
                  {t.label}
                </text>
              </g>
            ))}
          </g>

          <line
            className="pf-axis"
            x1={base.left}
            y1={base.axisY}
            x2={base.right}
            y2={base.axisY}
          />

          <g className="pf-times">
            {timeTicks.map((t) => (
              <text key={t.x} x={t.x} y={base.axisY + 20} textAnchor="middle">
                {t.label}
              </text>
            ))}
          </g>

          <g clipPath={`url(#${clipId}-rug)`}>
            <g transform={`translate(${view.ox},0)`}>{rug}</g>
          </g>

          <g clipPath={`url(#${clipId}-plot)`}>
            <g
              transform={`translate(${view.ox},${view.oy})`}
              /* Pinning isolates. A ring around one dot among two hundred is
                 not a selection anybody can see — pushing the other one
                 hundred and ninety-nine back is. The pinned mark and its
                 listing are redrawn at full strength in the layer below. */
              className={pinned === undefined ? undefined : "pf-dim"}
            >
              {field}

              {/* The live edge: a ring that breathes on the newest event, and
                  the only animation in the field. The marks themselves stay
                  still so a busy market does not turn into a strobe. */}
              {latest === undefined || pinned !== undefined ? null : (
                <circle className="pf-ping" cx={latest.x} cy={latest.y} r={latest.r + 3} />
              )}

              {/* Above the dimmed field: the pinned event and the listing it
                  filled, at full strength and redrawn rather than un-dimmed,
                  because they live inside the group that is being dimmed. */}
              {pinned === undefined ? null : (
                <g className="pf-keep">
                  {pinnedAsk === undefined ? null : (
                    <>
                      <line
                        className="pf-thread-on"
                        x1={pinnedAsk.x}
                        y1={pinnedAsk.y}
                        x2={pinned.x}
                        y2={pinned.y}
                      />
                      <circle
                        className="pf-listed"
                        cx={pinnedAsk.x}
                        cy={pinnedAsk.y}
                        r={pinnedAsk.r}
                      />
                      <circle
                        className="pf-ask"
                        cx={pinnedAsk.x}
                        cy={pinnedAsk.y}
                        r={pinnedAsk.r + 4}
                      />
                    </>
                  )}
                  <circle
                    className={`pf-keep-dot pf-keep-${pinned.row.kind}`}
                    cx={pinned.x}
                    cy={pinned.y}
                    r={pinned.r}
                  />
                </g>
              )}

              {active === undefined || sameRow(active.row, pinned?.row) ? null : (
                <circle className="pf-near" cx={active.x} cy={active.y} r={active.r + 5} />
              )}
            </g>
          </g>

          {/* Outside the clip and outside the pan group: the crosshair runs the
              full height of the frame, so it is drawn at the mark's panned
              position rather than moved with it. */}
          {pinned === undefined ? null : (
            <g className="pf-pin">
              <line
                x1={pinned.x + view.ox}
                y1={base.plotTop}
                x2={pinned.x + view.ox}
                y2={base.axisY}
              />
              <line
                x1={base.left}
                y1={pinned.y + view.oy}
                x2={base.right}
                y2={pinned.y + view.oy}
              />
              <circle cx={pinned.x + view.ox} cy={pinned.y + view.oy} r={pinned.r + 6} />
            </g>
          )}
        </svg>
      )}

      {/*
        The two handles, over the svg's own axis labels.

        Transparent and empty: the labels underneath are drawn by the svg, and
        these exist only to own a gesture. Sized to the bands the labels
        already occupy, so what you grab is what you were looking at.
      */}
      {width === 0 ? null : (
        <>
          <div
            ref={xAxisRef}
            className={`pf-grab pf-grab-x${dragging ? " pf-grabbing" : ""}`}
            style={{
              left: `${base.left}px`,
              top: `${base.axisY}px`,
              width: `${base.W}px`,
              height: `${height - base.axisY}px`,
            }}
            role="presentation"
            title="Drag or scroll to move through time"
            onPointerDown={onAxisDown("x")}
            onPointerMove={onAxisMove}
            onPointerUp={endAxisDrag}
            onPointerCancel={endAxisDrag}
          />
          <div
            ref={yAxisRef}
            className={`pf-grab pf-grab-y${dragging ? " pf-grabbing" : ""}`}
            style={{
              left: 0,
              top: `${base.plotTop}px`,
              width: `${base.left}px`,
              height: `${base.H}px`,
            }}
            role="presentation"
            title="Drag or scroll to move through price"
            onPointerDown={onAxisDown("y")}
            onPointerMove={onAxisMove}
            onPointerUp={endAxisDrag}
            onPointerCancel={endAxisDrag}
          />
        </>
      )}

      {/* One card at a time. A hover preview floating beside a pinned card is
          two answers to the same question. */}
      {pinned !== undefined ? (
        <PinCard
          mark={pinned}
          ask={selected?.ask}
          head={head}
          width={width}
          offset={view}
          nameFor={nameFor}
          onClear={() => onSelect(undefined)}
        />
      ) : active === undefined ? null : (
        <Tip mark={active} head={head} width={width} offset={view} nameFor={nameFor} />
      )}

      {!moved ? null : (
        <button className="pf-reset" type="button" onClick={() => setView(FITTED)}>
          Fit
        </button>
      )}

      {/* An affordance label, not a sentence. The cursors over the two
          strips and the `title` on each say the rest. */}
      {width === 0 ? null : (
        <p className="pf-hint" aria-hidden="true">
          Drag the axes &middot; click a mark
        </p>
      )}
    </div>
  );
}

const LABEL: Record<ActivityRow["kind"], string> = {
  sale: "Sold",
  listed: "Listed",
  cancelled: "Delisted",
  offer: "Offer",
};

/**
 * What the two parties to each kind of event are called.
 *
 * Only a sale has two. A listing and an offer are one wallet saying what it
 * would accept, and inventing a counterparty for them would be inventing a
 * trade that did not happen.
 */
const PARTIES: Record<ActivityRow["kind"], { from: string; to?: string }> = {
  sale: { from: "seller", to: "buyer" },
  listed: { from: "listed by" },
  offer: { from: "offered by" },
  cancelled: { from: "delisted by" },
};

/** One wallet: its generated face, its address, and what it did here. */
function Party({ address, role }: { address: `0x${string}`; role: string }) {
  return (
    <Link className="pf-party" href={`/address/${address}`}>
      <WalletMark address={address} size={26} />
      <span>
        <b>{shortAddress(address)}</b>
        <i>{role}</i>
      </span>
    </Link>
  );
}

/**
 * The pinned event, anchored to its own mark.
 *
 * Under the chart is where this lived, and on a laptop that is a hundred and
 * fifty pixels below the fold: the click landed, the card filled in, and
 * nothing the reader could see had changed. A selection has to answer where it
 * was made.
 */
function PinCard({
  mark,
  ask,
  head,
  width,
  offset,
  nameFor,
  onClear,
}: {
  mark: Mark;
  ask?: ActivityRow;
  head?: bigint;
  width: number;
  offset: View;
  nameFor: (address: string) => string | undefined;
  onClear: () => void;
}) {
  const { row } = mark;
  const parties = PARTIES[row.kind];
  const name = nameFor(row.collection) ?? shortAddress(row.collection);

  const x = mark.x + offset.ox;
  const y = mark.y + offset.oy;

  /* How far the fill landed from the ask. Only ever shown for a sale that has
     its own listing in the window — a percentage against a listing that is not
     the one this sale filled would be an invented number. */
  const gap =
    ask?.price === undefined || row.price === undefined || ask.price === 0n
      ? undefined
      : Number(((row.price - ask.price) * 10000n) / ask.price) / 100;

  const stood =
    ask === undefined
      ? undefined
      : (Number(row.blockNumber - ask.blockNumber) * SECONDS_PER_BLOCK) / 3600;

  return (
    <div
      className={`pf-card${y < 200 ? " pf-card-below" : ""}`}
      style={{
        // Clamped so a mark near either edge cannot push the card off the field.
        left: `${Math.min(Math.max(x, 140), Math.max(140, width - 140))}px`,
        top: `${y}px`,
      }}
      role="status"
    >
      <div className="pf-card-top">
        <span className={`act-kind act-kind-${row.kind}`}>{LABEL[row.kind]}</span>
        <button className="pf-card-close" type="button" onClick={onClear} aria-label="Clear">
          &times;
        </button>
      </div>

      <Link className="pf-card-what" href={`/token/${row.collection}/${row.tokenId}`}>
        {name} <b>#{row.tokenId.toString()}</b> &rarr;
      </Link>

      {row.price === undefined ? null : (
        <p className="pf-card-price">{formatSoso(row.price)} SOSO</p>
      )}

      {/* The trade itself: who it came from, who it went to. */}
      <div className="pf-flow">
        {row.from === undefined ? null : <Party address={row.from} role={parties.from} />}
        {row.to === undefined || parties.to === undefined ? null : (
          <>
            <span className="pf-flow-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 10" focusable="false">
                <path d="M0 5h20M16 1l5 4-5 4" />
              </svg>
            </span>
            <Party address={row.to} role={parties.to} />
          </>
        )}
      </div>

      {ask?.price === undefined || gap === undefined || stood === undefined ? null : (
        <p className="pf-card-ask">
          asked {formatSoso(ask.price)}, {stood < 1 ? "under an hour" : `${Math.round(stood)} h`}{" "}
          earlier
          <b className={gap < 0 ? "pf-down" : gap > 0 ? "pf-up" : ""}>
            {gap === 0 ? "at the ask" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)}%`}
          </b>
        </p>
      )}

      <a
        className="pf-card-block"
        href={`${deployment.explorer}/block/${row.blockNumber.toString()}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        block {row.blockNumber.toString()}
        {head === undefined
          ? null
          : ` · ${timeAgo(
              Math.floor(Date.now() / 1000) - Number(head - row.blockNumber) * SECONDS_PER_BLOCK,
            )}`}
      </a>
    </div>
  );
}

function Tip({
  mark,
  head,
  width,
  offset,
  nameFor,
}: {
  mark: Mark;
  head?: bigint;
  width: number;
  offset: View;
  nameFor: (address: string) => string | undefined;
}) {
  const name = nameFor(mark.row.collection);
  const minutes =
    head === undefined ? undefined : (Number(head - mark.row.blockNumber) * SECONDS_PER_BLOCK) / 60;

  const x = mark.x + offset.ox;
  const y = mark.y + offset.oy;

  return (
    <div
      /* Above the mark normally; below it near the top of the field, where
         there is no room and the card would otherwise sit outside the frame. */
      className={`pf-tip${y < 130 ? " pf-tip-below" : ""}`}
      style={{
        // Clamped so a mark near either edge cannot push the card off the field.
        left: `${Math.min(Math.max(x, 96), Math.max(96, width - 96))}px`,
        top: `${y}px`,
      }}
    >
      <span className={`act-kind act-kind-${mark.row.kind}`}>{LABEL[mark.row.kind]}</span>
      <p className="pf-tip-what">
        {name ?? shortAddress(mark.row.collection)} <b>#{mark.row.tokenId.toString()}</b>
      </p>
      {mark.row.price === undefined ? null : (
        <p className="pf-tip-price">{formatSoso(mark.row.price)} SOSO</p>
      )}
      {minutes === undefined ? null : (
        <p className="pf-tip-when">
          {minutes < 60
            ? `${Math.max(0, Math.round(minutes))} min ago`
            : `${Math.round(minutes / 60)} h ago`}
        </p>
      )}
    </div>
  );
}
