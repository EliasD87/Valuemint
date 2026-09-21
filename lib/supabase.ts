import "server-only";

/**
 * The index's database, over plain HTTP.
 *
 * Supabase is PostgREST in front of Postgres, and PostgREST is an ordinary REST
 * API. The whole surface this project needs is three verbs — upsert rows, read
 * rows, patch rows — so `@supabase/supabase-js` would be a dependency bought
 * for URL building. It would also buy nothing at the edge: no browser code
 * talks to Supabase, by design, so the client bundle never sees either.
 *
 * `server-only` is not decoration here. `SUPABASE_SERVICE_KEY` bypasses row
 * level security and can write every table; compiled into a client bundle it
 * would hand the database to anyone who opens devtools.
 *
 * ---
 *
 * **Nothing here is a source of truth.** Every row is a cache of public chain
 * state, and `configured()` returning false is a supported state, not an
 * error — the site then reads the chain directly, exactly as it did before this
 * file existed. That fallback is what makes the index safe to switch off, and
 * it is why no caller may treat a missing config as fatal.
 */

export interface SupabaseConfig {
  url: string;
  key: string;
}

/**
 * The project this build talks to, or `undefined` when there isn't one.
 *
 * Read per call rather than at module scope. At module scope the value is
 * frozen into whatever the build had, which on Vercel means a variable added
 * after the last deploy is invisible until someone redeploys — a failure that
 * looks like a broken index rather than a missing setting.
 */
export function supabaseConfig(): SupabaseConfig | undefined {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (url === undefined || url === "" || key === undefined || key === "") return undefined;
  return { url: normaliseUrl(url), key };
}

/**
 * The project's origin, whichever of Supabase's several labels it was copied from.
 *
 * The dashboard calls this the Project URL in one place and "API URL — RESTful
 * endpoint" in another, and the second is sometimes shown with `/rest/v1`
 * already on it. Pasting that produces `/rest/v1/rest/v1/orders`, which
 * PostgREST answers with `PGRST125: Invalid path specified in request URL` — a
 * 404 that reads as "the table is missing" and sends you looking at the schema.
 *
 * Cheaper to accept both than to make anyone diagnose that once.
 */
function normaliseUrl(raw: string): string {
  return raw.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
}

/** Is there an index to read at all? Callers fall back to the chain when not. */
export function indexConfigured(): boolean {
  return supabaseConfig() !== undefined;
}

/**
 * How long any one request may take.
 *
 * A serverless invocation that hangs on a database costs the whole request, and
 * the page behind it has a perfectly good chain path to fall back to. Failing
 * in eight seconds is better than succeeding in thirty.
 */
const TIMEOUT_MS = 8_000;

/**
 * PostgREST's error body carries the failing SQL, which can quote a row.
 *
 * That is genuinely useful in a log and has no business in an HTTP response, so
 * the message is kept deliberately short and the detail is left to the server
 * console. The key is never in either: it travels in a header, and headers are
 * not echoed here.
 */
export class SupabaseError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`supabase ${status}`);
    this.name = "SupabaseError";
  }
}

async function request(
  config: SupabaseConfig,
  path: string,
  init: RequestInit & { prefer?: string },
): Promise<Response> {
  const { prefer, ...rest } = init;

  const headers: Record<string, string> = {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    "content-type": "application/json",
  };
  if (prefer !== undefined) headers["prefer"] = prefer;

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...rest,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    /** Nothing here is ever worth serving stale from Next's fetch cache. */
    cache: "no-store",
  });

  if (!response.ok) {
    throw new SupabaseError(response.status, (await response.text()).slice(0, 500));
  }
  return response;
}

/**
 * Write rows, replacing any that collide on `onConflict`.
 *
 * Idempotent by construction, which is the property the whole indexer rests
 * on: every sync re-reads the last few blocks it already committed, so the same
 * log is written more than once by design. Without merge-duplicates that would
 * be a primary key violation on every single run.
 *
 * Chunked because PostgREST takes the whole body into memory and a full replay
 * can carry thousands of rows.
 */
export async function upsert<T extends object>(
  table: string,
  rows: readonly T[],
  onConflict: string,
): Promise<number> {
  const config = supabaseConfig();
  if (config === undefined) return 0;

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    if (slice.length === 0) continue;
    await request(config, `${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      body: JSON.stringify(slice),
      /** `return=minimal` so a 5,000-row replay does not echo 5,000 rows back. */
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
  return rows.length;
}

/**
 * Read rows. `query` is a PostgREST query string, e.g.
 * `listings_public?collection=eq.0x…&order=price_wei.asc&limit=60`.
 */
export async function select<T>(query: string): Promise<T[]> {
  const config = supabaseConfig();
  if (config === undefined) return [];
  const response = await request(config, query, { method: "GET" });
  return (await response.json()) as T[];
}

/** Change matching rows. `query` carries the filter; there is no unfiltered form on purpose. */
export async function patch(
  query: string,
  body: Record<string, unknown>,
): Promise<void> {
  const config = supabaseConfig();
  if (config === undefined) return;
  await request(config, query, {
    method: "PATCH",
    body: JSON.stringify(body),
    prefer: "return=minimal",
  });
}
