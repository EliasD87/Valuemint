import { NextResponse } from "next/server";
import { exploreSummary } from "@/lib/exploreSummary";

/**
 * The Explore page's market figures, for a page that was rendered without them
 * (2026-10-09). Normally they are baked into the page itself; this is the
 * fallback when that render could not reach the index. See lib/exploreSummary.ts.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const summary = await exploreSummary();
  if (summary === undefined) {
    return NextResponse.json({ error: "index unavailable" }, { status: 503 });
  }
  return NextResponse.json(summary, {
    headers: {
      /* The same five minutes the page itself is rebuilt on. */
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
