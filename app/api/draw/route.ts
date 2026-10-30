import { NextResponse } from "next/server";
import { indexClient } from "@/lib/indexSync";
import { firstBlockAtOrAfter, firstMintFrom } from "@/lib/drawCutoff";
import { lastSnapshotAt, nextDrawDay, nextSnapshotAt } from "@/lib/drawSchedule";
import { TREASURE_DRAW } from "@/config/treasureDraw";

/**
 * Which Treasure Boxes count for SoDEX's next draw, worked out from the
 * chain for the current week (2026-10-28).
 *
 * The snapshot is every Tuesday 12:00 UTC (lib/drawSchedule.ts); the first
 * box minted after it is read from the box contract's mint events
 * (lib/drawCutoff.ts). Every box at or above that id counts until the next
 * Tuesday, when this answer moves on by itself.
 *
 * Finding it takes a few seconds of reads, so it is cached at the edge: until
 * the next snapshot once a first box is known (the answer cannot change
 * before then), and for a minute while nothing has been minted since the
 * snapshot yet.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface DrawWindow {
  /** The snapshot that opened this window, ISO. */
  snapshot: string;
  /** The one that closes it. */
  nextSnapshot: string;
  /** The Wednesday draw the boxes in this window enter, YYYY-MM-DD. */
  drawDay: string;
  /** The first box minted after `snapshot`, or null if none has been yet. */
  firstEligibleId: string | null;
}

export async function GET(): Promise<NextResponse> {
  const now = new Date();
  const snapshot = lastSnapshotAt(now);
  const closes = nextSnapshotAt(now);

  try {
    const client = indexClient();
    const block = await firstBlockAtOrAfter(client, snapshot);
    const first = await firstMintFrom(client, TREASURE_DRAW.collection, block);

    const body: DrawWindow = {
      snapshot: snapshot.toISOString(),
      nextSnapshot: closes.toISOString(),
      drawDay: nextDrawDay(now).toISOString().slice(0, 10),
      firstEligibleId: first === undefined ? null : first.tokenId.toString(),
    };

    /* Never cached past the next snapshot, so a new week is never served last week's cut-off. */
    const untilClose = Math.max(30, Math.floor((closes.getTime() - now.getTime()) / 1000) - 30);
    const maxAge = first === undefined ? 60 : Math.min(untilClose, 3600);
    return NextResponse.json(body, {
      headers: { "cache-control": `public, max-age=60, s-maxage=${maxAge}, stale-while-revalidate=60` },
    });
  } catch (err) {
    console.error("[draw] cut-off failed", err);
    /* No badges is the safe failure: a wrong "counts" is a claim about someone else's draw. */
    return NextResponse.json({ error: "cut-off unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
