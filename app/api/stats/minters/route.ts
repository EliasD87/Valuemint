import { NextResponse } from "next/server";
import { mintersOnValueMint } from "@/lib/minters";

/**
 * GET /api/stats/minters
 *   → { minters: [[wallet, latestMintBlock]…], collections, head }
 *
 * Wallets that have minted on ValueMint (see lib/minters.ts), for the stats
 * page's wallet count. Its own request so /stats never waits on it, and cached
 * at the edge: ten minutes fresh, then served stale while it refreshes, so a
 * visitor almost never pays for the chain scan.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const body = await mintersOnValueMint();
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("[minters] failed", err);
    return NextResponse.json({ error: "Could not read mints just now." }, { status: 503 });
  }
}
