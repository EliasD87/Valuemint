import "server-only";
import { erc721Abi, type Hex } from "viem";
import { indexConfigured, select } from "@/lib/supabase";
import { indexClient } from "@/lib/indexSync";
import { decodeParams, type JsonOrderParameters } from "@/lib/indexRows";
import { checkOrders, decodeChecks, fillabilityQuestions, type CheckTarget } from "@/lib/orderChecks";
import { isExpired, readOrder, resolveFillable, unitPrice, type OrderParameters } from "@/lib/seaport";
import { readTokenMetadata, type TokenMetadata } from "@/lib/tokenMetadata";
import { resolveMediaUrl } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { ValueChainCollectionAbi } from "@/config/contracts";
import { KNOWN_COLLECTIONS } from "@/config/known";
import { MAIN_COLLECTIONS, PINNED_COLLECTIONS } from "@/config/featured";
import { isHidden } from "@/config/hidden";
import type { FrontCollection, FrontPiece, FrontSnapshot } from "@/lib/frontTypes";

/**
 * The front page's first screen, read from the index once per rebuild rather
 * than from the chain by every visitor (2026-10-25).
 *
 * The page used to draw its listings from the browser's own order book: the
 * whole of it, ~1 MB from `/api/index/orders` at 4-7 seconds, then a
 * `tokenURI` read, then a document per card — and its mint list from the
 * collection registry, a multicall per collection behind an explorer query.
 * Nothing drew until all of that landed.
 *
 * This asks the index for only what the first screen shows: each vouched-for
 * collection's newest and cheapest live listings, a handful each, from
 * `listings_public` — a view that has already dropped what is filled,
 * cancelled, expired or voided by a counter. Then, once per rebuild:
 *
 *   - the same two gates every order passes in the browser: `readOrder`, the
 *     shape whitelist that refuses an order paying a stranger, and Seaport's
 *     status plus the owner and approval reads (`resolveFillable`)
 *   - the cards' `tokenURI` and documents, so a card has its picture and name
 *   - each collection's name and mint progress
 *
 * Baked into the page beside the market summary, on the same thirty-minute
 * rebuild (app/page.tsx). It is display, never settlement: Buy opens the token
 * page, which checks the chain again before a wallet sees anything, and the
 * browser swaps this list for its live order book the moment that arrives.
 *
 * Cost, which is why it is shaped like this: two small Supabase queries per
 * collection per rebuild — tens of kilobytes, against the ~1 MB the full book
 * is — and one document batch per collection to our own metadata route.
 */

/** Listings read per collection, per ordering. Newest and cheapest overlap often. */
const PER_COLLECTION = 6;

/** The whole snapshot gets this long. Anything slower is left for the browser. */
const BUDGET_MS = 9_000;
const DOC_TIMEOUT_MS = 5_000;
const DOC_CONCURRENCY = 8;

interface ListingRow {
  order_hash: string;
  block_number: number;
  params: JsonOrderParameters;
}

/** Vouched for by something we wrote down, and not hidden. */
function trustedAddresses(): string[] {
  const all = [...PINNED_COLLECTIONS, ...MAIN_COLLECTIONS, ...KNOWN_COLLECTIONS.map((k) => k.address)];
  const out = new Set<string>();
  for (const a of all) {
    const key = a.toLowerCase();
    if (!isHidden(key)) out.add(key);
  }
  return [...out];
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** At most `limit` of `fn` in flight, results in input order. */
async function pooled<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * A document with only what a card reads. The description is the long part of
 * most documents and no card shows it.
 */
function trim(doc: TokenMetadata | undefined): TokenMetadata | undefined {
  if (doc === undefined) return undefined;
  return {
    name: doc.name,
    description: "",
    ...(doc.image === undefined ? {} : { image: doc.image }),
    attributes: doc.attributes,
  };
}

/**
 * Documents for a set of URIs.
 *
 * Ours are generated per request by `/api/metadata`, which answers a whole
 * collection's worth in one call (`?ids=`), so they go as one request per
 * collection, and are cached only as long as the page itself: ours CAN change
 * at a URL — a held-back Genesis piece is revealed in place (config/reveal.ts)
 * — and the front page should show it the next time it is rebuilt. Anyone
 * else's are fetched one by one, a few at a time, and cached a day: a
 * document at someone else's URL does not change, because a reveal there
 * points the token at a new one.
 */
async function documents(uris: ReadonlyArray<string | undefined>): Promise<Array<TokenMetadata | undefined>> {
  const out = new Array<TokenMetadata | undefined>(uris.length);
  const own = `${siteUrl()}/api/metadata/`;

  const batches = new Map<string, Array<{ index: number; id: string }>>();
  const foreign: Array<{ index: number; url: string }> = [];

  uris.forEach((uri, index) => {
    const url = resolveMediaUrl(uri);
    if (url === undefined) return;
    if (url.startsWith(own)) {
      const [collection, id] = url.slice(own.length).split("/");
      if (collection !== undefined && id !== undefined && /^\d+$/.test(id)) {
        const list = batches.get(collection) ?? [];
        list.push({ index, id });
        batches.set(collection, list);
        return;
      }
    }
    foreign.push({ index, url });
  });

  /* Never below the page's own 1800: a shorter fetch would shorten the page's rebuild with it. */
  const json = async (url: string, revalidate: number): Promise<unknown> => {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOC_TIMEOUT_MS),
      next: { revalidate },
    });
    if (!res.ok) return undefined;
    return res.json();
  };

  await Promise.all([
    ...[...batches].map(async ([collection, wanted]) => {
      const ids = [...new Set(wanted.map((w) => w.id))];
      const body = (await json(`${own}${collection}?ids=${ids.join(",")}`, 1800).catch(() => undefined)) as
        | { documents?: Record<string, unknown> }
        | undefined;
      for (const w of wanted) out[w.index] = trim(readTokenMetadata(body?.documents?.[w.id]));
    }),
    pooled(foreign, DOC_CONCURRENCY, async ({ index, url }) => {
      out[index] = trim(readTokenMetadata(await json(url, 86_400).catch(() => undefined)));
    }),
  ]);

  return out;
}

/** Names and open mints, one multicall for every trusted collection. */
async function collectionsOf(addresses: readonly string[]): Promise<FrontCollection[]> {
  const client = indexClient();
  const fields = ["name", "symbol", "totalSupply", "maxSupply", "mintPrice", "publicMintEnabled", "publicMintRemaining"] as const;
  const answers = await client.multicall({
    allowFailure: true,
    contracts: addresses.flatMap((address) =>
      fields.map((functionName) => ({
        address: address as `0x${string}`,
        abi: functionName === "name" || functionName === "symbol" ? erc721Abi : ValueChainCollectionAbi,
        functionName,
      })),
    ),
  });

  return addresses.map((address, i) => {
    const at = <T,>(k: number): T | undefined => {
      const a = answers[i * fields.length + k];
      return a?.status === "success" ? (a.result as T) : undefined;
    };
    const name = at<string>(0);
    const symbol = at<string>(1);
    const minted = at<bigint>(2);
    const cap = at<bigint>(3);
    const price = at<bigint>(4);
    const open = at<boolean>(5);
    const remaining = at<bigint>(6);
    const mintable =
      open === true && remaining !== undefined && remaining > 0n && price !== undefined && minted !== undefined;
    return {
      address,
      ...(name === undefined ? {} : { name }),
      ...(symbol === undefined ? {} : { symbol }),
      ...(mintable
        ? {
            mint: {
              priceWei: price.toString(),
              minted: minted.toString(),
              cap: (cap ?? 0n).toString(),
              remaining: remaining.toString(),
            },
          }
        : {}),
    };
  });
}

async function piecesOf(addresses: readonly string[]): Promise<FrontPiece[]> {
  const select_ = "select=order_hash,block_number,params";
  const rows = (
    await Promise.all(
      addresses.flatMap((a) => [
        select<ListingRow>(`listings_public?${select_}&collection=eq.${a}&order=block_number.desc&limit=${PER_COLLECTION}`),
        select<ListingRow>(`listings_public?${select_}&collection=eq.${a}&order=price_sort.asc&limit=${PER_COLLECTION}`),
      ]),
    )
  ).flat();

  /* Through `readOrder`, exactly as the browser's book is: the index is asked, never trusted. */
  const seen = new Set<string>();
  const targets: Array<CheckTarget & { blockNumber: bigint }> = [];
  for (const row of rows) {
    const hash = row.order_hash.toLowerCase();
    if (seen.has(hash)) continue;
    seen.add(hash);
    let params: OrderParameters;
    try {
      params = decodeParams(row.params);
    } catch {
      continue;
    }
    const read = readOrder(params);
    if (read === undefined || read.kind !== "listing" || read.tokenId === undefined) continue;
    if (!addresses.includes(read.collection.toLowerCase())) continue;
    targets.push({ hash: hash as Hex, params, read, blockNumber: BigInt(row.block_number) });
  }
  if (targets.length === 0) return [];

  /* Seaport's status and the two fillability reads, as `useSeaportOrders` asks them. */
  const checks = decodeChecks(await checkOrders(indexClient(), targets));
  if (checks === undefined) return [];
  const { keys, slots } = fillabilityQuestions(targets);
  const now = Math.floor(Date.now() / 1000);

  /** The cheapest fillable listing per token: a token can carry several. */
  const best = new Map<string, (typeof targets)[number]>();
  for (const t of targets) {
    const status = checks.status.get(t.hash);
    if (status === undefined) continue;
    const [validated, cancelled, filled, size] = status;
    if (!validated || cancelled || (size > 0n && filled >= size)) continue;
    if (isExpired(t.read.endTime, now)) continue;

    const slot = slots.get(t.hash);
    if (slot === undefined) continue;
    const first = checks.reads.get(keys[slot[0]]!);
    const second = checks.reads.get(keys[slot[1]]!);
    const order = { ...t.read, params: t.params };
    if (first === undefined || second === undefined || !resolveFillable(order, { first, second })) continue;

    const key = `${t.read.collection.toLowerCase()}-${t.read.tokenId}`;
    const current = best.get(key);
    if (current === undefined || unitPrice(t.read.priceWei, t.read.amount) < unitPrice(current.read.priceWei, current.read.amount)) {
      best.set(key, t);
    }
  }

  const live = [...best.values()];
  const client = indexClient();
  const uriReads = await client.multicall({
    allowFailure: true,
    contracts: live.map((t) => ({
      address: t.read.collection,
      abi: erc721Abi,
      functionName: "tokenURI" as const,
      args: [t.read.tokenId!],
    })),
  });
  const uris = uriReads.map((r) => (r.status === "success" ? (r.result as string) : undefined));
  const docs = await documents(uris);

  return live.map((t, i) => {
    const uri = uris[i];
    const metadata = docs[i];
    return {
      collection: t.read.collection.toLowerCase(),
      tokenId: t.read.tokenId!.toString(),
      hash: t.hash,
      maker: t.read.maker.toLowerCase(),
      priceWei: t.read.priceWei.toString(),
      amount: t.read.amount.toString(),
      blockNumber: t.blockNumber.toString(),
      ...(uri === undefined ? {} : { uri }),
      ...(metadata === undefined ? {} : { metadata }),
    };
  });
}

/** `undefined` when there is no index, or it could not answer in time. The page then reads live. */
export async function frontSnapshot(): Promise<FrontSnapshot | undefined> {
  if (!indexConfigured()) return undefined;
  const addresses = trustedAddresses();

  const build = async (): Promise<FrontSnapshot | undefined> => {
    try {
      const [collections, pieces] = await Promise.all([
        collectionsOf(addresses).catch((err: unknown) => {
          console.warn("[front] collections failed", err);
          return addresses.map((address) => ({ address }));
        }),
        piecesOf(addresses).catch((err: unknown) => {
          console.warn("[front] listings failed", err);
          return [];
        }),
      ]);
      return { builtAt: new Date().toISOString(), collections, pieces };
    } catch (err) {
      console.error("[front] snapshot failed", err);
      return undefined;
    }
  };

  return withTimeout(build(), BUDGET_MS, undefined);
}
