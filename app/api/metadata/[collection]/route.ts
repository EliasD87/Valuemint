import { NextResponse } from "next/server";
import { CACHE_HEADERS, tokenDocument, willFetch } from "@/lib/tokenDocument";
import { callerKey, limiter } from "@/lib/rateLimit";

/**
 * Many tokens' metadata, in one request.
 *
 * `GET /api/metadata/<collection>?ids=1,2,3` → `{ "1": {…}, "2": {…} }`
 *
 * The per-token route beside this one is what contracts point at and can never
 * change. This is what the *app* asks, and it exists because asking sixty times
 * is the single most expensive thing a collection page did. Measured on the
 * live site for a 60-card page:
 *
 *     60 per-token requests   11,406 ms cold,  756 ms warm,  32,716 B
 *     1 batched request          713 ms cold,  ~105 ms warm,  1,640 B gzipped
 *
 * The cold figure is the one that matters and its cause is structural: sixty
 * requests are up to sixty serverless invocations, and each cold one fetches
 * the collection's manifest from IPFS before it can answer a single token. One
 * request is one invocation and one manifest read — and that manifest already
 * described the whole collection. Orange Companions' is 1,306 bytes for all 90
 * tokens; the same 60 documents fetched individually are 32,716 bytes.
 *
 * It computes from `lib/tokenDocument.ts`, the same module the per-token route
 * uses. Not a copy: a second implementation of the thing an immutable `baseURI`
 * points at would eventually disagree with the first, and a disagreement here
 * means somebody's token showing the wrong picture.
 */

/**
 * The most tokens one request may ask for.
 *
 * A page shows sixty. The cap is what stops this being an amplification vector
 * — the work is bounded per request, so a caller cannot ask for a hundred
 * thousand documents and have the server build them all.
 */
const MAX_IDS = 100;

const HOUR = 60 * 60 * 1000;

/** The same budget the per-token route uses, and for the same reason. */
const MISSES_PER_HOUR = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { collection } = await params;
  const raw = new URL(request.url).searchParams.get("ids") ?? "";

  /**
   * Parsed strictly, deduped, and order-preserving.
   *
   * The response is keyed by id rather than positional, so a caller cannot be
   * confused by gaps — a token that does not exist is simply absent, exactly as
   * a 404 from the per-token route would be.
   */
  const ids: number[] = [];
  const seen = new Set<string>();
  for (const piece of raw.split(",")) {
    const id = piece.trim();
    if (id === "" || seen.has(id)) continue;
    if (!/^[0-9]+$/.test(id)) {
      return NextResponse.json({ error: "Token ids must be whole numbers." }, { status: 400 });
    }
    seen.add(id);
    ids.push(Number(id));
    if (ids.length > MAX_IDS) {
      return NextResponse.json(
        { error: `At most ${MAX_IDS} ids per request.` },
        { status: 400 },
      );
    }
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "Ask for at least one id." }, { status: 400 });
  }

  /**
   * One token from the budget for the whole batch, not one per id.
   *
   * The budget exists to bound outbound gateway fetches, and a batch makes at
   * most one of those however many ids it names — the manifest is loaded once
   * and every id is then arithmetic against it. Charging per id would make the
   * efficient call the expensive one.
   */
  if (willFetch(collection)) {
    const gate = await limiter.take(`meta:${callerKey(request)}`, MISSES_PER_HOUR, HOUR);
    if (!gate.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
      );
    }
  }

  /**
   * Sequential on purpose.
   *
   * The first id loads the manifest and every later one hits the in-process
   * cache, so this is one await and then arithmetic. `Promise.all` would start
   * a hundred manifest loads before the first finished — the very stampede this
   * route exists to prevent, moved inside the server.
   */
  const documents: Record<string, unknown> = {};
  for (const id of ids) {
    const result = await tokenDocument(collection, id);
    if (result.ok) documents[String(id)] = result.document;
  }

  /**
   * An empty result is still a 200.
   *
   * "None of those ids exist" is a complete and correct answer about a
   * collection that does exist, and the caller distinguishes it by the object
   * being empty. A 404 here would be a statement about the collection.
   */
  return NextResponse.json({ documents }, { headers: CACHE_HEADERS });
}
