import "server-only";
import { createPublicClient, fallback, http, parseAbiItem, zeroAddress, type Address, type PublicClient } from "viem";
import { RPC_HTTP, SECONDS_PER_BLOCK, valuechain } from "@/config/chain";
import { deployment, legacyFactories } from "@/config/contracts";
import { isHidden } from "@/config/hidden";
import { KNOWN_COLLECTIONS } from "@/config/known";
import { TRENCHES_ADDRESS } from "@/config/trenches";

/**
 * Every wallet that has minted on ValueMint, with the block of its latest mint.
 *
 * The stats page counted "wallets involved" from the marketplace alone —
 * listings, offers, sales — so a wallet that only minted or claimed never
 * appeared: most of the Trenches' claimers, for one. Mints are not in the
 * order index, so they are read here from each collection's own `Transfer`
 * events from the zero address.
 *
 * **Which collections.** Everything the factories created, and every collection
 * the site knows by name (The Trenches, ValueChain Genesis, …) — except SoDEX's
 * Treasure Box and Cybereator, the owner's rule (2026-09-27): they are minted on
 * SoDEX, and their tens of thousands of boxes would make this a count of SoDEX
 * users. Hidden collections are left out, as everywhere else on the stats page.
 *
 * Kept separate from the rest of the page on purpose: it is its own request,
 * cached at the edge, so nothing else on /stats waits for a chain scan.
 * `scanLogs` remembers what it has read, so after the first walk each refresh
 * reads only the blocks mined since.
 */

const client = createPublicClient({
  chain: valuechain,
  transport: fallback(
    RPC_HTTP.map((url) => http(url, { timeout: 15_000 })),
    { rank: false },
  ),
}) as PublicClient;

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

const REGISTRY = parseAbiItem(
  "function latestCollections(uint256 offset, uint256 limit) view returns ((address collection, address creator, string name, string symbol, uint64 createdAt)[])",
);
const TOTAL = parseAbiItem("function totalCollections() view returns (uint256)");

/** Minted on SoDEX, not here. */
const NOT_MINTED_HERE = new Set([
  "0x371c4f7f68be3e558b89cc1f0fb113851c76e750", // SoDEX Treasure Box
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30", // Cybereator
]);

/** The collections minted on ValueMint, with a creation time where the factory knows it. */
async function mintedHere(): Promise<Array<{ address: Address; createdAt?: number }>> {
  const out = new Map<string, { address: Address; createdAt?: number }>();
  for (const factory of [deployment.factory, ...legacyFactories] as Address[]) {
    try {
      const total = await client.readContract({ address: factory, abi: [TOTAL], functionName: "totalCollections" });
      const list = await client.readContract({
        address: factory,
        abi: [REGISTRY],
        functionName: "latestCollections",
        args: [0n, total],
      });
      for (const c of list) out.set(c.collection.toLowerCase(), { address: c.collection, createdAt: Number(c.createdAt) });
    } catch {
      // A factory that cannot answer adds nothing; the others still count.
    }
  }
  for (const a of [TRENCHES_ADDRESS, ...KNOWN_COLLECTIONS.map((c) => c.address)]) {
    if (typeof a === "string" && a.startsWith("0x") && !out.has(a.toLowerCase())) {
      out.set(a.toLowerCase(), { address: a as Address });
    }
  }
  return [...out.values()].filter((c) => !isHidden(c.address) && !NOT_MINTED_HERE.has(c.address.toLowerCase()));
}

/** How far back no mint on this chain can be — well before the first collection. */
const FLOOR_DAYS = 150;

const firstBlocks = new Map<string, bigint>();

/**
 * Where a collection's history starts. The factory's creation time, converted
 * to a block with a day's margin; otherwise the explorer's creation
 * transaction; otherwise the floor. Early is only slower — late would miss mints.
 */
async function firstBlockOf(c: { address: Address; createdAt?: number }, head: bigint): Promise<bigint> {
  const key = c.address.toLowerCase();
  const known = firstBlocks.get(key);
  if (known !== undefined) return known;

  const perDay = BigInt(Math.round(86_400 / SECONDS_PER_BLOCK));
  const floor = head > perDay * BigInt(FLOOR_DAYS) ? head - perDay * BigInt(FLOOR_DAYS) : 0n;
  let from = floor;

  if (c.createdAt !== undefined && c.createdAt > 0) {
    const ago = BigInt(Math.max(0, Math.round((Date.now() / 1000 - c.createdAt) / SECONDS_PER_BLOCK)));
    const est = head > ago + perDay ? head - ago - perDay : 0n;
    if (est > from) from = est;
  } else {
    try {
      const res = await fetch(`${deployment.explorer}/api/v2/addresses/${c.address}`, { signal: AbortSignal.timeout(8_000) });
      const body = res.ok ? ((await res.json()) as { creation_transaction_hash?: string; creation_tx_hash?: string }) : {};
      const tx = body.creation_transaction_hash ?? body.creation_tx_hash;
      if (tx) {
        const t = await client.getTransaction({ hash: tx as `0x${string}` });
        if (t.blockNumber !== null && t.blockNumber > from) from = t.blockNumber;
      }
    } catch {
      // The floor stands.
    }
  }

  firstBlocks.set(key, from);
  return from;
}

export interface Minters {
  /** [wallet, block of its latest mint], one row per wallet. */
  minters: Array<[string, number]>;
  collections: number;
  head: number;
}

/** What one request may span: under the node's own cap (~29,800 blocks, measured). */
const CHUNK = 20_000n;
const PARALLEL = 8;
/** A few blocks short of the head, as the order book reads, so a re-org cannot leave a phantom mint. */
const CONFIRMATIONS = 6n;

/**
 * One scan for every collection at once — `getLogs` takes a list of
 * addresses — rather than one per collection: the per-collection walk made
 * about 400 requests cold and took ~54s. Kept between requests: after the
 * first walk, each call reads only the blocks mined since. A change in the set
 * of collections (a new one created) starts over, which is rare and cheap
 * against the alternative of missing it.
 */
let memo: { key: string; scannedTo: bigint; latest: Map<string, number> } | undefined;
let running: Promise<Minters> | undefined;

async function logsIn(addresses: Address[], from: bigint, to: bigint): Promise<Array<{ to: string; block: number }>> {
  try {
    const logs = await client.getLogs({
      address: addresses,
      event: TRANSFER,
      args: { from: zeroAddress },
      fromBlock: from,
      toBlock: to,
    });
    return logs.flatMap((l) =>
      l.args.to === undefined || l.blockNumber === null ? [] : [{ to: l.args.to, block: Number(l.blockNumber) }],
    );
  } catch (err) {
    // Too many results or a node that balks at the span: halve and retry, down to one block.
    if (to <= from) throw err;
    const mid = from + (to - from) / 2n;
    return [...(await logsIn(addresses, from, mid)), ...(await logsIn(addresses, mid + 1n, to))];
  }
}

async function walk(addresses: Address[], from: bigint, to: bigint, into: Map<string, number>) {
  const spans: Array<[bigint, bigint]> = [];
  for (let a = from; a <= to; a += CHUNK) spans.push([a, a + CHUNK - 1n > to ? to : a + CHUNK - 1n]);
  for (let i = 0; i < spans.length; i += PARALLEL) {
    const batch = await Promise.all(spans.slice(i, i + PARALLEL).map(([a, b]) => logsIn(addresses, a, b)));
    for (const logs of batch) {
      for (const { to: w, block } of logs) {
        if (w === zeroAddress) continue;
        const k = w.toLowerCase();
        if ((into.get(k) ?? -1) < block) into.set(k, block);
      }
    }
  }
}

export function mintersOnValueMint(): Promise<Minters> {
  // Concurrent callers share one scan.
  running ??= scan().finally(() => {
    running = undefined;
  });
  return running;
}

async function scan(): Promise<Minters> {
  const head = await client.getBlockNumber();
  const safe = head > CONFIRMATIONS ? head - CONFIRMATIONS : head;
  const collections = await mintedHere();
  const addresses = collections.map((c) => c.address);
  const key = addresses.map((a) => a.toLowerCase()).sort().join(",");

  if (memo === undefined || memo.key !== key) {
    const starts = await Promise.all(collections.map((c) => firstBlockOf(c, head)));
    const from = starts.reduce((m, b) => (b < m ? b : m), safe);
    const latest = new Map<string, number>();
    await walk(addresses, from, safe, latest);
    memo = { key, scannedTo: safe, latest };
  } else if (safe > memo.scannedTo) {
    await walk(addresses, memo.scannedTo + 1n, safe, memo.latest);
    memo.scannedTo = safe;
  }

  return { minters: [...memo.latest.entries()], collections: collections.length, head: Number(head) };
}
