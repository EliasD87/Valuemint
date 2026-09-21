#!/usr/bin/env node
/**
 * Do the pre-flight rules match what Seaport actually says?
 *
 *   npm run fills:check
 *
 * `lib/fillCheck.ts` decides whether a wallet opens, by matching text inside a
 * revert — text this project does not control. It comes from viem decoding a
 * custom error against Seaport's ABI, and a rename upstream, an ABI that stops
 * carrying the error definitions, or a regex that was a good guess and never
 * checked would all fail the same silent way: every block falls through, every
 * buyer is sent to their wallet to pay gas for an answer this could have given
 * free, and nothing anywhere says so.
 *
 * So the rules are checked against the real thing. Orders the index already
 * knows are dead are simulated against the deployed bytecode and the verdict
 * printed. Nothing is signed and nothing is sent — `eth_call` only.
 *
 * It imports the app's own rules rather than a copy, which is why it needs
 * Node's TypeScript stripping. A copy would pass this check and still be wrong.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, fallback, http } from "viem";
import { classifyFillFailure } from "../lib/fillCheck.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395";
const NO_CONDUIT = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** A caller with no history, funded only inside the call. */
const BUYER = "0x000000000000000000000000000000000000dEaD";

const env = {};
for (const line of (await readFile(join(root, ".env.local"), "utf8")).split(/\r?\n/)) {
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

const base = env.SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headers = {
  apikey: env.SUPABASE_SERVICE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
};
const get = async (q) => (await fetch(`${base}/rest/v1/${q}`, { headers })).json();

/**
 * The app's own ABI, read out of the config it lives in.
 *
 * Deliberately not a hand-written subset: whether viem can decode
 * `OrderAlreadyFilled` into those words at all depends on the error definitions
 * being in the ABI the app ships, so that is the ABI this has to use.
 */
const src = await readFile(join(root, "config", "seaport.ts"), "utf8");
const open = src.indexOf("export const SeaportAbi = [");
const abi = JSON.parse(
  src.slice(open + "export const SeaportAbi = ".length, src.lastIndexOf("] as const;") + 1),
);

const RPC = ["https://mainnet.valuechain.xyz", "https://rpc.valuechain.xyz"];
const client = createPublicClient({
  chain: {
    id: 286623,
    name: "ValueChain",
    nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
    rpcUrls: { default: { http: RPC } },
  },
  transport: fallback(RPC.map((u) => http(u))),
});

const decode = (j) => ({
  offerer: j.offerer,
  zone: j.zone,
  offer: j.offer.map((i) => ({
    itemType: i.itemType,
    token: i.token,
    identifierOrCriteria: BigInt(i.identifierOrCriteria),
    startAmount: BigInt(i.startAmount),
    endAmount: BigInt(i.endAmount),
  })),
  consideration: j.consideration.map((i) => ({
    itemType: i.itemType,
    token: i.token,
    identifierOrCriteria: BigInt(i.identifierOrCriteria),
    startAmount: BigInt(i.startAmount),
    endAmount: BigInt(i.endAmount),
    recipient: i.recipient,
  })),
  orderType: j.orderType,
  startTime: BigInt(j.startTime),
  endTime: BigInt(j.endTime),
  zoneHash: j.zoneHash,
  salt: BigInt(j.salt),
  conduitKey: j.conduitKey,
  totalOriginalConsiderationItems: BigInt(j.totalOriginalConsiderationItems),
});

/** What each stored status should classify as, if the rules are right. */
const EXPECTED = { filled: "sold", cancelled: "withdrawn" };

let checked = 0;
let failures = 0;

for (const status of ["filled", "cancelled"]) {
  const rows = await get(
    `orders?select=order_hash,params,price_wei&status=eq.${status}&limit=3`,
  );

  if (rows.length === 0) {
    console.log(`(no ${status} orders in the index yet — nothing to check)`);
    continue;
  }

  for (const row of rows) {
    checked += 1;
    const id = row.order_hash.slice(0, 12);

    try {
      await client.simulateContract({
        address: SEAPORT,
        abi,
        functionName: "fulfillOrder",
        args: [{ parameters: decode(row.params), signature: "0x" }, NO_CONDUIT],
        value: BigInt(row.price_wei),
        account: BUYER,
        /**
         * Fund the caller inside the call, or the node refuses on balance
         * before it ever reaches the order — which is also what a real buyer
         * short of SOSO would see, and why `classifyFillFailure` lets that one
         * through to the wallet rather than blocking on it.
         */
        stateOverride: [{ address: BUYER, balance: 10n ** 24n }],
      });

      failures += 1;
      console.log(`FAIL ${status} ${id}: the simulation succeeded, but the index calls it ${status}`);
      continue;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const verdict = classifyFillFailure(message);

      if (verdict === undefined) {
        failures += 1;
        console.log(`FAIL ${status} ${id}: not recognised — a buyer would pay gas to find out`);
        console.log(`       ${message.split("\n")[0]?.slice(0, 110)}`);
        continue;
      }

      const want = EXPECTED[status];
      if (verdict.kind !== want) {
        failures += 1;
        console.log(`FAIL ${status} ${id}: called it "${verdict.kind}", expected "${want}"`);
        continue;
      }

      console.log(`OK   ${status} ${id} -> ${verdict.kind}`);
    }
  }
}

console.log("");
console.log(
  failures === 0
    ? `OK   all ${checked} dead orders were recognised before any wallet would have opened`
    : `FAIL ${failures} of ${checked} were not — those buyers would pay gas to find out`,
);

process.exit(failures === 0 ? 0 : 1);
