import { erc721Abi } from "viem";
import { buildActivityRows } from "@/lib/activityRows";
import { decodeIndexedEvents, type IndexedEvent } from "@/lib/indexEvents";
import { floorChange } from "@/lib/floorChange";
import { indexConfigured, select, selectAll } from "@/lib/supabase";
import { CURSOR, indexClient } from "@/lib/indexSync";
import { isHidden } from "@/config/hidden";
import { SECONDS_PER_BLOCK } from "@/config/chain";
import type { ExploreCollection, ExploreSale, ExploreSummary } from "@/lib/exploreTypes";

/**
 * The Explore page's market figures, from the index and nothing else (2026-10-09).
 *
 * Explore was built to load fast and never wait on the chain, and that holds:
 * this runs on the server, its result is baked into the page every few minutes
 * (`revalidate` in app/page.tsx), and the browser reads no chain at all for it.
 *
 * Three reads, all from Supabase:
 *   - every sale (`events`, kind fulfilled), decoded by the same code the page
 *     uses (lib/indexEvents.ts) so a "sale" means the same thing everywhere;
 *   - the floor snapshots of the last day, which the sync takes every ten
 *     minutes from listings it has already checked can be filled;
 *   - the index's head, to put a time on a block number.
 * Plus one batched `name`/`symbol` call for the collections in the table, on
 * the server, so the table can render names before the page's own registry
 * has answered.
 */

export interface FloorRow {
  collection: string;
  bucket: string;
  floor_wei: string | null;
  listed: number;
}

export interface CursorRow {
  last_block: number;
  updated_at: string;
}

const LATEST = 10;
const DAY_MS = 86_400_000;

/**
 * Snapshots older than this mean the sync has stopped taking them. A floor
 * from then is not today's floor, so none is shown rather than a stale one.
 */
const SNAPSHOT_STALE_MS = 2 * 3_600_000;

export function summarise({
  events,
  floors,
  cursor,
  now,
}: {
  events: readonly IndexedEvent[];
  floors: readonly FloorRow[];
  cursor: CursorRow | undefined;
  now: Date;
}): ExploreSummary {
  const sales = buildActivityRows(decodeIndexedEvents(events))
    .filter((r) => r.kind === "sale" && !isHidden(r.collection))
    .sort((a, b) =>
      a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1,
    );

  /** A block's time, from how far it sits behind the index's own head. */
  const timeOf = (block: bigint): Date =>
    cursor === undefined
      ? now
      : new Date(Date.parse(cursor.updated_at) - (cursor.last_block - Number(block)) * SECONDS_PER_BLOCK * 1000);

  const dayAgo = now.getTime() - DAY_MS;
  const weekAgo = now.getTime() - 7 * DAY_MS;

  type Acc = { volume: { day: bigint; week: bigint; all: bigint }; sales: { day: number; week: number; all: number } };
  const byCollection = new Map<string, Acc>();
  const acc = (address: string): Acc => {
    const key = address.toLowerCase();
    let a = byCollection.get(key);
    if (a === undefined) {
      a = { volume: { day: 0n, week: 0n, all: 0n }, sales: { day: 0, week: 0, all: 0 } };
      byCollection.set(key, a);
    }
    return a;
  };

  const traders = new Set<string>();
  let volumeAll = 0n;

  for (const sale of sales) {
    const value = (sale.price ?? 0n) * sale.amount;
    const t = timeOf(sale.blockNumber).getTime();
    const a = acc(sale.collection);
    a.volume.all += value;
    a.sales.all += 1;
    if (t >= weekAgo) {
      a.volume.week += value;
      a.sales.week += 1;
    }
    if (t >= dayAgo) {
      a.volume.day += value;
      a.sales.day += 1;
    }
    volumeAll += value;
    if (sale.from !== undefined) traders.add(sale.from.toLowerCase());
    if (sale.to !== undefined) traders.add(sale.to.toLowerCase());
  }

  /**
   * Floors: the newest snapshot across every collection is "now". A collection
   * missing from it had nothing fillable listed then, so it has no floor now,
   * whatever an older bucket says.
   */
  const visible = floors.filter((f) => !isHidden(f.collection));
  const newest = visible.reduce((m, f) => (f.bucket > m ? f.bucket : m), "");
  const fresh = newest !== "" && now.getTime() - Date.parse(newest) <= SNAPSHOT_STALE_MS;

  const floorNow = new Map<string, { floorWei?: bigint; listed: number }>();
  const history = new Map<string, Array<{ at: Date; floorWei?: bigint }>>();
  for (const f of visible) {
    const key = f.collection.toLowerCase();
    const floorWei = f.floor_wei === null ? undefined : BigInt(f.floor_wei);
    history.set(key, [...(history.get(key) ?? []), { at: new Date(f.bucket), floorWei }]);
    if (fresh && f.bucket === newest) floorNow.set(key, { floorWei, listed: f.listed });
  }

  let forSale = 0;
  for (const f of floorNow.values()) forSale += f.listed;

  const keys = new Set<string>([...byCollection.keys(), ...floorNow.keys()]);
  const collections: ExploreCollection[] = [...keys].map((address) => {
    const a = byCollection.get(address);
    const f = floorNow.get(address);
    const change = f?.floorWei === undefined ? undefined : floorChange(history.get(address) ?? [], f.floorWei, now);
    return {
      address,
      ...(f?.floorWei === undefined ? {} : { floorWei: f.floorWei.toString() }),
      ...(change?.kind === "change" ? { floorChange: change.percent } : {}),
      listed: f?.listed ?? 0,
      volume: {
        day: (a?.volume.day ?? 0n).toString(),
        week: (a?.volume.week ?? 0n).toString(),
        all: (a?.volume.all ?? 0n).toString(),
      },
      sales: a?.sales ?? { day: 0, week: 0, all: 0 },
    };
  });

  collections.sort((x, y) => {
    const vx = BigInt(x.volume.all);
    const vy = BigInt(y.volume.all);
    if (vx !== vy) return vy > vx ? 1 : -1;
    return y.listed - x.listed;
  });

  const latest: ExploreSale[] = sales.slice(0, LATEST).map((s) => ({
    collection: s.collection.toLowerCase(),
    tokenId: s.tokenId.toString(),
    priceWei: (s.price ?? 0n).toString(),
    amount: s.amount.toString(),
    at: timeOf(s.blockNumber).toISOString(),
  }));

  return {
    builtAt: now.toISOString(),
    totals: { volumeWei: volumeAll.toString(), sales: sales.length, traders: traders.size, forSale },
    collections,
    latest,
  };
}

/** Each collection's `name` and `symbol`, in one call. A contract that will not say is left unnamed. */
async function readNames(addresses: readonly string[]): Promise<Map<string, { name?: string; symbol?: string }>> {
  const out = new Map<string, { name?: string; symbol?: string }>();
  if (addresses.length === 0) return out;
  const answers = await indexClient().multicall({
    allowFailure: true,
    contracts: addresses.flatMap((address) => [
      { address: address as `0x${string}`, abi: erc721Abi, functionName: "name" as const },
      { address: address as `0x${string}`, abi: erc721Abi, functionName: "symbol" as const },
    ]),
  });
  addresses.forEach((address, i) => {
    const name = answers[i * 2];
    const symbol = answers[i * 2 + 1];
    out.set(address, {
      ...(name?.status === "success" ? { name: name.result as string } : {}),
      ...(symbol?.status === "success" ? { symbol: symbol.result as string } : {}),
    });
  });
  return out;
}

/** `undefined` when there is no index to ask, or it could not be reached. The page then asks later. */
export async function exploreSummary(now: Date = new Date()): Promise<ExploreSummary | undefined> {
  if (!indexConfigured()) return undefined;
  try {
    const since = new Date(now.getTime() - 26 * 3_600_000).toISOString();
    const [events, floors, cursor] = await Promise.all([
      selectAll<IndexedEvent>(
        "events?select=tx_hash,log_index,kind,order_hash,block_number,args,collection,token_id" +
          "&kind=eq.fulfilled&order=block_number.desc,log_index.desc",
      ),
      selectAll<FloorRow>(
        `floor_history_public?select=collection,bucket,floor_wei,listed&bucket=gte.${since}&order=bucket.asc`,
      ),
      select<CursorRow>(`index_cursor?name=eq.${CURSOR}&select=last_block,updated_at&limit=1`),
    ]);

    const summary = summarise({ events, floors, cursor: cursor[0], now });

    /** Names are a nicety. Without them the page falls back to its own registry. */
    const names = await readNames(summary.collections.map((c) => c.address)).catch(() => new Map());
    for (const c of summary.collections) Object.assign(c, names.get(c.address) ?? {});

    return summary;
  } catch (err) {
    console.error("[explore] summary failed", err);
    return undefined;
  }
}
