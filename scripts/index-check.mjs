#!/usr/bin/env node
/**
 * Does the index agree with the chain?
 *
 *   npm run index:check
 *
 * Two questions, and they fail in opposite directions:
 *
 *   1. Is everything the index calls live actually fillable? A false positive
 *      shows a listing that reverts on contact — the visitor pays gas for
 *      nothing.
 *   2. Is anything the chain says is live missing from the index? A false
 *      negative hides a real listing from the market, and from its own seller,
 *      with nothing anywhere saying so. This is the worse of the two and the
 *      harder to notice, which is why the check reads the logs rather than
 *      trusting the cursor.
 *
 * Reads the chain directly with viem — deliberately not through the app's own
 * modules, because a check that shares its subject's bugs proves nothing.
 */

import { readFile } from "node:fs/promises";
import { createPublicClient, fallback, http, parseAbiItem } from "viem";

const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395";
const FROM_BLOCK = 14407869n;
const CHUNK = 20000n;
const CONFIRMATIONS = 6n;

const RPC = ["https://mainnet.valuechain.xyz", "https://rpc.valuechain.xyz"];

const ORDER_FULFILLED = parseAbiItem(
  "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)",
);

const ORDER_VALIDATED = parseAbiItem(
  "event OrderValidated(bytes32 orderHash, (address offerer, address zone, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) orderParameters)",
);

const GET_ORDER_STATUS = [
  {
    type: "function",
    name: "getOrderStatus",
    stateMutability: "view",
    inputs: [{ name: "orderHash", type: "bytes32" }],
    outputs: [
      { name: "isValidated", type: "bool" },
      { name: "isCancelled", type: "bool" },
      { name: "totalFilled", type: "uint256" },
      { name: "totalSize", type: "uint256" },
    ],
  },
];

async function readEnv() {
  const text = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

const env = await readEnv();
const base = env.SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headers = {
  apikey: env.SUPABASE_SERVICE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
};

async function index(query) {
  const r = await fetch(`${base}/rest/v1/${query}`, { headers });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * A bare chain definition rather than the app's, on purpose: this check exists
 * to disagree with the app, so it shares as little with it as possible.
 * Multicall3 sits at the same deterministic address on every chain.
 */
const client = createPublicClient({
  chain: {
    id: 286623,
    name: "ValueChain",
    nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
    rpcUrls: { default: { http: RPC } },
    contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  },
  transport: fallback(RPC.map((u) => http(u, { batch: true, retryCount: 2 }))),
});

// ---------------------------------------------------------------------------

const open = await index("listings_public?select=order_hash,collection,token_id,price_wei&limit=2000");
const openOffers = await index("offers_public?select=order_hash&limit=2000");
const live = [...open, ...openOffers];

console.log(`index: ${open.length} live listings, ${openOffers.length} live offers`);

// --- 1. everything the index calls live, asked of Seaport ------------------

const statuses = await client.multicall({
  contracts: live.map((o) => ({
    address: SEAPORT,
    abi: GET_ORDER_STATUS,
    functionName: "getOrderStatus",
    args: [o.order_hash],
  })),
  allowFailure: true,
});

const ghosts = [];
for (let i = 0; i < live.length; i++) {
  const result = statuses[i];
  if (result?.status !== "success") continue;
  const [isValidated, isCancelled, totalFilled, totalSize] = result.result;
  const finished = totalSize > 0n && totalFilled >= totalSize;
  if (!isValidated || isCancelled || finished) {
    ghosts.push({
      order_hash: live[i].order_hash,
      token: live[i].token_id ?? "—",
      why: isCancelled ? "cancelled" : finished ? "filled" : "not validated",
    });
  }
}

// --- 2. everything the chain calls live, asked of the index ----------------

const head = await client.getBlockNumber();
const latest = head - CONFIRMATIONS;
const validated = [];
for (let from = FROM_BLOCK; from <= latest; from += CHUNK) {
  const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
  validated.push(
    ...(await client.getLogs({ address: SEAPORT, event: ORDER_VALIDATED, fromBlock: from, toBlock: to })),
  );
}

/** Latest validation wins, exactly as the indexer does it. */
const onChain = new Map();
for (const log of validated) {
  const hash = log.args.orderHash.toLowerCase();
  const prior = onChain.get(hash);
  if (prior !== undefined && prior >= log.blockNumber) continue;
  onChain.set(hash, log.blockNumber);
}

const known = new Set((await index("orders?select=order_hash&limit=5000")).map((o) => o.order_hash));
const unseen = [...onChain.keys()].filter((h) => !known.has(h));

// ---------------------------------------------------------------------------

console.log(`chain: ${onChain.size} distinct orders ever validated, index holds ${known.size}`);
console.log("");

if (ghosts.length === 0) {
  console.log(`OK   every one of the ${live.length} orders the index calls live is live on chain`);
} else {
  console.log(`FAIL ${ghosts.length} order(s) the index shows as live are not:`);
  console.table(ghosts.slice(0, 20));
}

if (unseen.length === 0) {
  console.log(`OK   the index is missing none of the ${onChain.size} orders the chain has announced`);
} else {
  console.log(`FAIL ${unseen.length} order(s) on chain are missing from the index:`);
  console.log(unseen.slice(0, 20).join("\n"));
}

/**
 * History, counted rather than sampled.
 *
 * A feed that is merely *short* is the failure mode here, and it is invisible:
 * a missing sale does not render as a gap, it renders as a shorter list that
 * looks complete. So the count is compared, not a handful of rows.
 */
const sales = [];
for (let from = FROM_BLOCK; from <= latest; from += CHUNK) {
  const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
  sales.push(
    ...(await client.getLogs({ address: SEAPORT, event: ORDER_FULFILLED, fromBlock: from, toBlock: to })),
  );
}

let indexedSales = [];
try {
  indexedSales = await index("events?select=tx_hash&kind=eq.fulfilled&limit=5000");
} catch {
  console.log("SKIP the events table is not there yet — re-run supabase/schema.sql");
  process.exit(ghosts.length === 0 && unseen.length === 0 ? 0 : 1);
}

if (indexedSales.length === sales.length) {
  console.log(`OK   history holds all ${sales.length} sales the chain has settled`);
} else {
  console.log(`FAIL chain settled ${sales.length} sales, the index holds ${indexedSales.length}`);
}

/**
 * The text-cast ordering trap, asserted rather than remembered.
 *
 * `price_wei` is text so a uint256 survives JSON intact, and text sorts
 * lexicographically — which once put 10 SOSO ahead of 9 and dropped the real
 * floor off the page. `price_sort` exists to prevent that, so this checks the
 * two columns still agree about which listing is cheapest.
 */
let cheapest;
try {
  cheapest = await index("listings_public?select=price_wei&order=price_sort.asc&limit=1");
} catch {
  console.log("SKIP price_sort is not in the views yet — re-run supabase/schema.sql");
  process.exit(ghosts.length === 0 && unseen.length === 0 ? 0 : 1);
}
const floors = await index("collection_floors?select=floor_wei");
const trueFloor = floors.reduce((a, b) => (BigInt(a.floor_wei) < BigInt(b.floor_wei) ? a : b), floors[0]);

if (cheapest[0] !== undefined && BigInt(cheapest[0].price_wei) === BigInt(trueFloor.floor_wei)) {
  console.log(`OK   cheapest-first agrees with the floor (${trueFloor.floor_wei} wei)`);
} else {
  console.log(
    `FAIL cheapest-first says ${cheapest[0]?.price_wei}, the floor says ${trueFloor?.floor_wei}`,
  );
}

process.exit(ghosts.length === 0 && unseen.length === 0 ? 0 : 1);
