import { NextResponse } from "next/server";
import { parseAbi } from "viem";
import { CYBEREATOR_SEATS as DRAW, ticketsFor } from "@/config/draws";
import { TIER_STRIDE, TRENCHES_ADDRESS } from "@/config/trenches";
import { indexClient } from "@/lib/indexSync";

/**
 * Live standings for the Trenches holder draw, before its snapshot.
 *
 * `GET /api/trenches/leaderboard` → every wallet holding depth `minDepth`+
 * right now, with its pieces and tickets, most tickets first; ValueMint's own
 * wallets left out, exactly as the snapshot will (contracts/scripts/draw-snapshot.mjs).
 *
 * Read from the chain's own state in one pinned block. The depth is in the
 * token id (depth × 1,000,000 + serial, serials from 1) and the contract counts
 * `mintedPerTier`, so the deep pieces' ids are known without reading the other
 * ~5,000: six counts, then `ownerOf` for each deep piece — three batched calls.
 * (Enumerating every piece with `tokenByIndex` first took 8.6–10.8 s, measured
 * 2026-10-16.) The CDN keeps the answer for a minute, so visitors share one read.
 *
 * Display only. What counts is the snapshot, built from Transfer logs by the
 * script and locked on chain; this is a preview of where it is heading.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ABI = parseAbi([
  "function mintedPerTier(uint8 tier) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

/** ~480 calls per eth_call; viem's 1 KB default would split this into hundreds of requests. */
const BATCH_BYTES = 32_768;
const FRESH_MS = 60_000;

export interface LeaderboardRow {
  wallet: string;
  depths: number[];
  tickets: number;
}

export interface Leaderboard {
  block: number;
  at: string;
  wallets: number;
  tickets: number;
  rows: LeaderboardRow[];
}

/** Per instance, on top of the CDN: a burst of misses still reads the chain once. */
let memo: { at: number; value: Promise<Leaderboard> } | undefined;

async function read(): Promise<Leaderboard> {
  const client = indexClient();
  const address = TRENCHES_ADDRESS as `0x${string}`;
  const blockNumber = await client.getBlockNumber();
  const tiers = Array.from({ length: 10 - DRAW.minDepth + 1 }, (_, i) => DRAW.minDepth + i);
  const minted = await client.multicall({
    contracts: tiers.map((t) => ({ address, abi: ABI, functionName: "mintedPerTier" as const, args: [t] as const })),
    allowFailure: false,
    blockNumber,
  });
  const deep = tiers.flatMap((t, i) =>
    Array.from({ length: Number(minted[i]) }, (_, k) => BigInt(t) * BigInt(TIER_STRIDE) + BigInt(k + 1)),
  );
  // allowFailure: a burned piece has no owner and simply drops out.
  const owners = await client.multicall({
    contracts: deep.map((id) => ({ address, abi: ABI, functionName: "ownerOf" as const, args: [id] as const })),
    allowFailure: true,
    blockNumber,
    batchSize: BATCH_BYTES,
  });

  const byWallet = new Map<string, number[]>();
  deep.forEach((id, i) => {
    const o = owners[i]!;
    if (o.status !== "success") return;
    const w = o.result.toLowerCase();
    if (DRAW.excluded.includes(w)) return;
    const list = byWallet.get(w) ?? [];
    list.push(Number(id / BigInt(TIER_STRIDE)));
    byWallet.set(w, list);
  });

  const rows = [...byWallet].map(([wallet, depths]) => ({
    wallet,
    depths: depths.sort((a, b) => b - a),
    tickets: ticketsFor(depths, DRAW.minDepth),
  }));
  rows.sort((a, b) => b.tickets - a.tickets || (a.wallet < b.wallet ? -1 : 1));
  const block = await client.getBlock({ blockNumber });
  return {
    block: Number(blockNumber),
    at: new Date(Number(block.timestamp) * 1000).toISOString(),
    wallets: rows.length,
    tickets: rows.reduce((s, r) => s + r.tickets, 0),
    rows,
  };
}

export async function GET() {
  if (TRENCHES_ADDRESS === "") return NextResponse.json({ error: "Trenches is not configured." }, { status: 503 });
  if (memo === undefined || Date.now() - memo.at > FRESH_MS) {
    const value = read();
    memo = { at: Date.now(), value };
    value.catch(() => {
      memo = undefined; // a failed read is not cached
    });
  }
  try {
    const board = await memo.value;
    return NextResponse.json(board, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ error: "Could not read the chain right now." }, { status: 502 });
  }
}
