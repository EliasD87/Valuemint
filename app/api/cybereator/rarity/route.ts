import { NextResponse } from "next/server";
import { cybereatorRarities } from "@/lib/traitSets";

/**
 * Every opened Cybereator's rarity, in one answer (2026-11-13).
 *
 * `GET /api/cybereator/rarity` → `{ bound, rarity: { "<id>": "Epic", … } }`.
 *
 * The collection page filtered by rarity by reading every opened piece's
 * document first, one request each, so "Epic" showed nothing and then
 * trickled in over seconds. This is a few kilobytes, read once, and the page
 * filters instantly; only the cards on screen still fetch their documents.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const body = await cybereatorRarities();
    return NextResponse.json(body, {
      headers: { "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[cybereator] rarity failed", err);
    return NextResponse.json({ error: "Could not read rarities just now." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
