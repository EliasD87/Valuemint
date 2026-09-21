import "server-only";

import { metadataFetchAllowed } from "@/lib/media";
import { readTokenMetadata } from "@/lib/tokenMetadata";
import { decideDocument, type Decided } from "@/lib/documentCache";
import { upsert } from "@/lib/supabase";

/**
 * Fetching documents and keeping them. Shared by the read path and the warmer.
 *
 * Pulled out of the route when the warmer arrived, because two copies of "what
 * to do with a 501" is exactly how the read path got it wrong in the first
 * place. The *judgement* still lives in `lib/documentCache.ts` and is tested
 * there; this is the I/O around it.
 */

/**
 * How many documents to fetch at once.
 *
 * This was 12, chosen to be polite, and it made the cache slower than the thing
 * it replaced. Measured against SoDEX for 69 documents:
 *
 *     12 concurrent   1,235 ms
 *     24 concurrent     583 ms
 *     48 concurrent     428 ms
 *     69 concurrent     224 ms
 *
 * The browser those requests used to come from has no such limit over HTTP/2 —
 * the same 69 took it 842 ms — so throttling to 12 was not politeness, it was
 * handing the user a worse deal than they had before and calling it a cache.
 *
 * 48 is where the curve flattens. It is also bounded work: one server, a
 * capped list, against a host this project is told it may call.
 */
export const CONCURRENCY = 48;

/** Per-document timeout. Longer than this and the page has moved on anyway. */
const FETCH_MS = 8_000;

export interface StoredRow extends Decided {
  url: string;
}

/**
 * Fetch one document and decide what it amounts to. Never throws.
 *
 * The allowlist is checked before anything else: these URLs come from
 * `tokenURI` on a caller-named contract, so anyone can deploy an ERC-721 that
 * returns `http://169.254.169.254/…` and then ask this server to read it. See
 * `lib/media.ts` for why it is an allowlist rather than a denylist.
 */
export async function fetchDocument(url: string): Promise<StoredRow> {
  if (!metadataFetchAllowed(url)) {
    return { url, ...decideDocument({ allowed: false, readable: false }) };
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    let body: unknown;
    let hadJson = false;
    try {
      body = await response.json();
      hadJson = true;
    } catch {
      hadJson = false;
    }

    /**
     * Read only to decide whether the body is worth keeping. What gets stored
     * is the original — `readTokenMetadata` runs again on the client, which is
     * where the decision about what a document *means* belongs.
     */
    const readable = hadJson && readTokenMetadata(body) !== undefined;

    return {
      url,
      ...decideDocument({
        allowed: true,
        ok: response.ok,
        status: response.status,
        ...(hadJson ? { body } : {}),
        readable,
      }),
    };
  } catch {
    /** The request never completed. Not an answer about the URL. */
    return { url, ...decideDocument({ allowed: true, readable: false }) };
  }
}

/** Run `work` over `items`, `CONCURRENCY` at a time, stopping at `deadline`. */
async function pool<T, R>(
  items: T[],
  work: (item: T) => Promise<R>,
  deadline: number,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (Date.now() > deadline) return;
      const i = next++;
      const item = items[i];
      if (item === undefined) return;
      out.push(await work(item));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

/** Fetch these URLs and keep whatever they turn out to be. */
export async function fetchAndStore(urls: string[], deadline: number): Promise<StoredRow[]> {
  if (urls.length === 0) return [];

  const rows = await pool(urls, fetchDocument, deadline);
  if (rows.length === 0) return [];

  const at = new Date().toISOString();

  await upsert(
    "documents",
    rows.map((r) => {
      const doc = r.status === "ok" ? readTokenMetadata(r.raw) : undefined;
      return {
        url: r.url,
        raw: r.raw,
        status: r.status,
        fetched_at: at,
        /** Filter keys for search. What a row *means* is still decided client-side. */
        name: doc?.name ?? null,
        image: doc?.image ?? null,
        traits: doc?.attributes ?? null,
      };
    }),
    "url",
  );

  return rows;
}
