import { NextResponse } from "next/server";
import { numberToHex, type Hex } from "viem";
import { indexClient } from "@/lib/indexSync";
import { CYBEREATOR_OPENER, CYBEREATOR_TOPICS } from "@/lib/cybereator";

/**
 * Which Cybereators have been opened, for the Opened / Sealed filter.
 *
 * `GET /api/cybereator/opened` → `{ ids: ["488", …], scannedTo }`.
 *
 * The chain already says so: every opening emits `Opened(tokenId, …)` on the
 * opener contract, so the list is those logs and nothing else — no metadata
 * read per token, no guessing from a page of cards. The contract went live on
 * 10 November 2026, so the whole history is a few log requests.
 *
 * "Opened" here means the opening was committed on chain. The piece's art can
 * still be Rendering for up to a minute after; the card shows whatever its
 * metadata says, and the watcher refreshes it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Before the opener's first log (block 16,733,828, 2026-11-10); nothing earlier can exist. */
const FROM_BLOCK = 16_730_000n;

/** Under the node's measured ~29,800-block cap per request. */
const CHUNK = 20_000n;

interface RawLog {
  topics: Hex[];
}

export async function GET(): Promise<NextResponse> {
  try {
    const client = indexClient();
    const head = await client.getBlockNumber();
    const ids = new Set<string>();
    for (let from = FROM_BLOCK; from <= head; from += CHUNK) {
      const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
      const logs = (await client.request({
        method: "eth_getLogs",
        params: [
          {
            address: CYBEREATOR_OPENER as Hex,
            fromBlock: numberToHex(from),
            toBlock: numberToHex(to),
            topics: [CYBEREATOR_TOPICS.opened],
          },
        ],
      } as never)) as RawLog[];
      for (const log of logs) if (log.topics[1] !== undefined) ids.add(BigInt(log.topics[1]).toString());
    }
    return NextResponse.json(
      { ids: [...ids], scannedTo: head.toString() },
      { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" } },
    );
  } catch (err) {
    console.error("[cybereator] opened scan failed", err);
    return NextResponse.json({ error: "Could not read openings just now." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
