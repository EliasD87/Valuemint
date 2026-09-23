/**
 * The market's traded volume, bucketed by time and split by collection.
 *
 * What `/stats`'s volume chart draws, kept out of the component so the
 * arithmetic can be tested without a DOM: which events count, how time is cut
 * into columns, and which collections get a colour of their own.
 *
 * ---
 *
 * **Only settled sales count.** A listing is an intention and an offer is a
 * question; neither moved money. Volume is `price × amount`, the same product
 * the page's own "SOSO settled" figure sums — so the columns add up to that
 * figure exactly, and a reader who checks will find they agree.
 *
 * **Colour follows the collection, never its rank in the window.** The
 * collections that get a hue are the biggest by ALL-TIME volume, chosen once
 * from every row rather than from the window on screen. Ranking by the window
 * would repaint the chart every time the window changed — Cybereator blue under
 * "7 days" and orange under "24 hours" — and a reader who learned the colour
 * would be misled by the next click.
 *
 * **Time is cut on clock boundaries** — the hour, a quarter of the day, the
 * day — so a column is "14:00 to 15:00", something a person can say out loud,
 * rather than "the 62-minute span ending at the last block".
 */

/** ValueChain's block time, measured. The same figure every dated view uses. */
export const SECONDS_PER_BLOCK = 2.065;

/** How many collections get a colour of their own; the rest share "Other". */
export const NAMED_SERIES = 3;

export interface SaleLike {
  kind: string;
  blockNumber: bigint;
  price?: bigint;
  amount: bigint;
  collection: string;
}

export type Grain = "hour" | "sixHours" | "day";

export interface Bucket {
  /** Epoch ms, inclusive. */
  start: number;
  /** Epoch ms, exclusive. */
  end: number;
  /**
   * Volume per series, in wei: index 0 is "Other", then the named collections
   * in `series` order. Other first because that is its place in the stack.
   */
  parts: bigint[];
  total: bigint;
  sales: number;
  /** Every collection that traded in this bucket, for the tooltip's detail. */
  byCollection: Map<string, bigint>;
}

const isSale = (row: SaleLike) => row.kind === "sale" && row.price !== undefined && row.price > 0n;
const volumeOf = (row: SaleLike) => (row.price ?? 0n) * row.amount;

/**
 * The column width for a window.
 *
 * 24 hours in hours; a week in quarters of a day, because seven daily columns
 * leave most of the week's shape in two of them; and everything in days,
 * unless everything is short enough that days would be a handful of columns.
 */
export function grainFor(hours: number | undefined, spanHours: number): Grain {
  if (hours !== undefined) return hours <= 48 ? "hour" : "sixHours";
  if (spanHours <= 48) return "hour";
  if (spanHours <= 24 * 10) return "sixHours";
  return "day";
}

/** The start of the bucket holding `ms`, in the reader's own time zone. */
export function floorLocal(ms: number, grain: Grain): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  if (grain === "sixHours") d.setHours(d.getHours() - (d.getHours() % 6));
  if (grain === "day") d.setHours(0);
  return d.getTime();
}

/**
 * The next boundary after a bucket start.
 *
 * Through the Date setters rather than a fixed number of milliseconds, so a
 * daylight-saving change makes one day 23 or 25 hours long instead of shifting
 * every boundary after it by an hour.
 */
export function nextLocal(start: number, grain: Grain): number {
  const d = new Date(start);
  if (grain === "hour") d.setHours(d.getHours() + 1);
  else if (grain === "sixHours") d.setHours(d.getHours() + 6);
  else d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** The collections with the most all-time settled volume, lower-cased. */
export function topCollections(rows: ReadonlyArray<SaleLike>, n = NAMED_SERIES): string[] {
  const volume = new Map<string, bigint>();
  const count = new Map<string, number>();
  for (const row of rows) {
    if (!isSale(row)) continue;
    const key = row.collection.toLowerCase();
    volume.set(key, (volume.get(key) ?? 0n) + volumeOf(row));
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...volume.keys()]
    .sort((a, b) => {
      const va = volume.get(a)!;
      const vb = volume.get(b)!;
      if (va !== vb) return vb > va ? 1 : -1;
      /* Equal money: the one that changed hands more often, then the address,
         so the order — and therefore the colours — never depends on the order
         the rows happened to arrive in. */
      const ca = count.get(a)!;
      const cb = count.get(b)!;
      return ca !== cb ? cb - ca : a < b ? -1 : 1;
    })
    .slice(0, n);
}

export function bucketVolume({
  rows,
  head,
  nowMs,
  hours,
  series,
  floor = floorLocal,
  next = nextLocal,
}: {
  /** The window's rows. Non-sales are ignored. */
  rows: ReadonlyArray<SaleLike>;
  /** The chain head, which "now" is measured back from. */
  head: bigint;
  nowMs: number;
  /** The window in hours, or undefined for everything. */
  hours: number | undefined;
  /** Lower-cased addresses of the named collections, in slot order. */
  series: ReadonlyArray<string>;
  /** Injected so tests can cut buckets in UTC regardless of the machine. */
  floor?: (ms: number, grain: Grain) => number;
  next?: (start: number, grain: Grain) => number;
}): { grain: Grain; buckets: Bucket[] } {
  const sales = rows.filter(isSale);
  const timeOf = (block: bigint) => nowMs - Number(head - block) * SECONDS_PER_BLOCK * 1000;

  const oldest = sales.reduce<number | undefined>((least, row) => {
    const t = timeOf(row.blockNumber);
    return least === undefined || t < least ? t : least;
  }, undefined);

  const from = hours !== undefined ? nowMs - hours * 3_600_000 : (oldest ?? nowMs);
  const grain = grainFor(hours, (nowMs - from) / 3_600_000);

  /* Every bucket from the start of the window to now, empty ones included: a
     quiet evening is a gap in the chart, and dropping it would squeeze the
     busy days together and hide the rhythm the chart exists to show. */
  const buckets: Bucket[] = [];
  const slot = new Map<string, number>(series.map((address, i) => [address.toLowerCase(), i + 1]));
  for (let start = floor(from, grain); start <= nowMs; start = next(start, grain)) {
    buckets.push({
      start,
      end: next(start, grain),
      parts: Array.from({ length: series.length + 1 }, () => 0n),
      total: 0n,
      sales: 0,
      byCollection: new Map(),
    });
  }

  for (const row of sales) {
    const t = timeOf(row.blockNumber);
    /* Buckets are ascending and contiguous, so the one holding `t` is the last
       whose start is not after it. */
    let lo = 0;
    let hi = buckets.length - 1;
    if (hi < 0 || t < buckets[0]!.start) continue;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (buckets[mid]!.start <= t) lo = mid;
      else hi = mid - 1;
    }
    const bucket = buckets[lo]!;
    const key = row.collection.toLowerCase();
    const v = volumeOf(row);
    bucket.parts[slot.get(key) ?? 0]! += v;
    bucket.total += v;
    bucket.sales += 1;
    bucket.byCollection.set(key, (bucket.byCollection.get(key) ?? 0n) + v);
  }

  return { grain, buckets };
}
