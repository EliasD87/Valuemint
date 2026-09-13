/**
 * Pre-renders every collection's artwork through the image optimiser, so no
 * visitor is the one who waits on IPFS.
 *
 *   node scripts/warm-images.mjs                          (against production)
 *   node scripts/warm-images.mjs --site http://localhost:5173
 *   node scripts/warm-images.mjs --collection 0xabc…      (just one)
 *
 * Why this exists, measured on 2026-09-13 against the live site:
 *
 *   /api/metadata              210-990ms, CDN HIT — not the problem
 *   original from the gateway  1,577-7,586ms for 234KB-1.1MB, and no faster on
 *                              a second request; IPFS gateways do not cache for
 *                              us, and only two of ten public gateways serve
 *                              these CIDs at all
 *   /_next/image, cold          559-2,883ms (it has to fetch that original)
 *   /_next/image, warm          333-559ms for 4-37KB
 *
 * So the artwork is fast once it has been asked for once, and slow exactly
 * once per variant. That first request is currently made by a real person
 * looking at a blank card. This script makes it instead.
 *
 * Nothing here writes anything. It is HTTP GETs against our own site, safe to
 * run repeatedly, and safe to run while the marketplace is live — the optimiser
 * is the same endpoint visitors already hit.
 */
import { createPublicClient, http, erc721Abi } from "viem";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const SITE = flag("site", "https://www.valuemint.store").replace(/\/$/, "");
const ONLY = flag("collection", undefined);
const TOKENS = Number(flag("tokens", "40"));
const RPC = flag("rpc", "https://mainnet.valuechain.xyz");

/**
 * The widths a browser can actually choose, from next.config.ts: the
 * `imageSizes` a card reaches plus the trimmed `deviceSizes`. Warming a width
 * nobody requests wastes gateway time; missing one a phone picks puts the wait
 * straight back.
 */
const WIDTHS = [128, 192, 256, 384, 640, 828, 1080];
const QUALITY = 75;

const client = createPublicClient({ transport: http(RPC) });

const FACTORIES = [
  "0x7DFcafE62ac616CEa70C6f98115280454cE2b54a",
  "0xb1153Aa3dbADD59e3e6aa61452f2DAa90b99A859",
];

/** Collections that never came from a factory, so no registry lists them. */
const EXTRA = [
  "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B", // ValueChain Genesis, pre-factory
  "0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19", // The Trenches, deployed directly
];

const factoryAbi = [
  {
    inputs: [],
    name: "totalCollections",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    name: "latestCollections",
    outputs: [
      {
        components: [
          { name: "collection", type: "address" },
          { name: "creator", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "createdAt", type: "uint64" },
        ],
        name: "page",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

async function collections() {
  if (ONLY !== undefined) return [ONLY];

  const found = new Map(EXTRA.map((a) => [a.toLowerCase(), a]));

  for (const address of FACTORIES) {
    try {
      const total = await client.readContract({
        address,
        abi: factoryAbi,
        functionName: "totalCollections",
      });
      if (total === 0n) continue;

      const page = await client.readContract({
        address,
        abi: factoryAbi,
        functionName: "latestCollections",
        args: [0n, total],
      });
      for (const row of page) found.set(row.collection.toLowerCase(), row.collection);
    } catch {
      // A factory without a registry getter is not an error — the older one
      // predates it, and its collections still arrive through the newer.
    }
  }

  return [...found.values()];
}

/**
 * Every distinct artwork URL in a collection.
 *
 * By sampling tokens rather than reading the manifest, because a collection's
 * artwork is whatever `tokenURI` actually resolves to — which is the thing a
 * visitor's browser will ask for, manifest or not. A collection is a handful of
 * designs however large its supply, so the set stops growing quickly.
 */
async function imagesOf(address) {
  let ids = [];
  try {
    const supply = await client.readContract({
      address,
      abi: erc721Abi,
      functionName: "totalSupply",
    });
    if (supply === 0n) return [];

    // Ids are not required to be 1..n — The Trenches encodes its tier in the id
    // — so walk the enumerable index rather than guessing.
    const take = Number(supply) < TOKENS ? Number(supply) : TOKENS;
    const indexAbi = [
      {
        inputs: [{ type: "uint256" }],
        name: "tokenByIndex",
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ];
    ids = await Promise.all(
      Array.from({ length: take }, (_, i) =>
        client
          .readContract({ address, abi: indexAbi, functionName: "tokenByIndex", args: [BigInt(i)] })
          .catch(() => BigInt(i + 1)),
      ),
    );
  } catch {
    return [];
  }

  const images = new Set();
  for (const id of ids) {
    let uri;
    try {
      uri = await client.readContract({
        address,
        abi: erc721Abi,
        functionName: "tokenURI",
        args: [id],
      });
    } catch {
      continue;
    }
    try {
      const doc = await (await fetch(uri)).json();
      if (typeof doc.image === "string") images.add(doc.image);
    } catch {
      // An unreadable metadata document is not a reason to stop.
    }
    if (images.size >= 12) break;
  }
  return [...images];
}

async function warm(url) {
  const t = Date.now();
  try {
    const res = await fetch(url);
    await res.arrayBuffer();
    return {
      ms: Date.now() - t,
      status: res.status,
      cache: res.headers.get("x-vercel-cache") ?? "-",
    };
  } catch (e) {
    return { ms: Date.now() - t, status: 0, cache: String(e).slice(0, 40) };
  }
}

/** Bounded, because the gateway behind the optimiser is the slow part. */
async function pool(items, size, fn) {
  const out = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const list = await collections();
console.log(`site    ${SITE}`);
console.log(`widths  ${WIDTHS.join(", ")}`);
console.log(`walking ${list.length} collection${list.length === 1 ? "" : "s"}\n`);

let warmed = 0;
let cold = 0;
const started = Date.now();

for (const address of list) {
  const images = await imagesOf(address);
  if (images.length === 0) {
    console.log(`${address}  nothing minted yet, skipping`);
    continue;
  }

  const urls = images.flatMap((src) =>
    WIDTHS.map((w) => `${SITE}/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${QUALITY}`),
  );

  const results = await pool(urls, 4, warm);
  const ok = results.filter((r) => r.status === 200);
  const hits = ok.filter((r) => r.cache === "HIT").length;
  const slowest = Math.max(0, ...ok.map((r) => r.ms));
  warmed += ok.length;
  cold += ok.length - hits;

  console.log(
    `${address}  ${String(images.length).padStart(2)} designs x ${WIDTHS.length} widths  ` +
      `${ok.length}/${urls.length} ok  ${hits} already warm  slowest ${slowest}ms`,
  );
}

console.log(
  `\n${warmed} variants warm (${cold} were cold and are now cached) in ` +
    `${((Date.now() - started) / 1000).toFixed(0)}s`,
);
console.log("Re-run after a new collection is created, or if the image cache expires.");
