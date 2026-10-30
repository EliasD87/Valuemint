import type { ActivityKind, ActivityRow } from "@/lib/activityRows";

/**
 * Activity rows as they travel from the server, already decoded.
 *
 * The history route used to send raw events: every `OrderValidated` with its
 * whole parameter block, 2.2 MB for the market-wide feed, which every visitor
 * downloaded and then decoded in the browser. The stats page spent its first
 * four seconds on exactly that ("Reading Seaport's logs", "Decoding orders").
 *
 * The server now runs the same `decodeIndexedEvents` → `buildActivityRows`, so
 * `readFulfilment` and `readOrder` still decide what a sale and a listing are —
 * on the server instead of in the tab — and sends only the rows. A row is a
 * fixed-position array rather than an object, because the keys would be most
 * of the bytes.
 *
 * Bigints travel as decimal strings: JSON has no integer wider than 2^53, and a
 * price in wei is far wider.
 */

/** kind, collection, tokenId, amount, price, from, to, block, logIndex, collectionOffer */
export type WireRow = [
  WireKind,
  string,
  string,
  string,
  string | null,
  string | null,
  string | null,
  string,
  number,
  0 | 1,
];

type WireKind = "s" | "l" | "c" | "o";

const TO_WIRE: Record<ActivityKind, WireKind> = { sale: "s", listed: "l", cancelled: "c", offer: "o" };
const FROM_WIRE: Record<WireKind, ActivityKind> = { s: "sale", l: "listed", c: "cancelled", o: "offer" };

/** What `/api/index/activity?format=rows` answers. */
export interface ActivityWire {
  rows: WireRow[];
  /** When the index last advanced; null when it never has. */
  indexedAt: string | null;
  /** When this copy was built, which the edge may hold for minutes (lib/indexLag.ts). */
  servedAt: string;
}

export function encodeRows(rows: readonly ActivityRow[]): WireRow[] {
  return rows.map((r) => [
    TO_WIRE[r.kind],
    r.collection,
    r.tokenId.toString(),
    r.amount.toString(),
    r.price === undefined ? null : r.price.toString(),
    r.from ?? null,
    r.to ?? null,
    r.blockNumber.toString(),
    r.logIndex,
    r.collectionOffer === true ? 1 : 0,
  ]);
}

/**
 * Back into rows, refusing anything that is not the shape above.
 *
 * The server built these, but the browser cannot tell a row from the server
 * from a row from a stale edge copy of an older build, so a row that does not
 * parse is dropped rather than allowed to throw inside a page.
 */
export function decodeRows(wire: readonly WireRow[]): ActivityRow[] {
  const out: ActivityRow[] = [];
  for (const w of wire) {
    if (!Array.isArray(w) || w.length < 10) continue;
    const kind = FROM_WIRE[w[0]];
    if (kind === undefined) continue;
    try {
      out.push({
        kind,
        collection: w[1] as `0x${string}`,
        tokenId: BigInt(w[2]),
        ...(w[9] === 1 ? { collectionOffer: true as const } : {}),
        amount: BigInt(w[3]),
        ...(w[4] === null ? {} : { price: BigInt(w[4]) }),
        ...(w[5] === null ? {} : { from: w[5] as `0x${string}` }),
        ...(w[6] === null ? {} : { to: w[6] as `0x${string}` }),
        blockNumber: BigInt(w[7]),
        logIndex: w[8],
      });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * What to narrow by, and what deliberately is not here.
 *
 * `tokenId` is missing on purpose. A token page and its collection page would
 * otherwise be different queries, and so would every card on a collection page
 * wanting a last-sale figure — sixty requests where one would do. Narrowing to
 * a collection is what shrinks the payload; narrowing to a token inside it
 * saves nothing worth a second round trip, so that stays in the browser.
 */
export interface ActivityFilter {
  collection?: `0x${string}`;
  wallet?: `0x${string}`;
  salesOnly?: boolean;
}

/**
 * The cache key, exported so a server-rendered page can put its own answer
 * under it (`HydrationBoundary`) and the browser starts with the rows instead
 * of asking for them.
 */
export function activityQueryKey(filter: ActivityFilter) {
  return [
    "indexed-activity-rows",
    filter.collection?.toLowerCase() ?? null,
    filter.wallet?.toLowerCase() ?? null,
    filter.salesOnly === true,
  ] as const;
}
