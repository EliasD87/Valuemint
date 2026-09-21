"use client";

import {
  fetchTokenMetadata,
  MetadataHttpError,
  readTokenMetadata,
  type TokenMetadata,
} from "@/lib/tokenMetadata";
import { gated } from "@/lib/fetchGate";

/**
 * Sixty callers asking for sixty documents, one request on the wire.
 *
 * Every caller still asks for exactly the token it wants and gets back exactly
 * that token's document, so a card can paint the moment its own answer arrives
 * and React Query can cache per document. What changes is underneath: asks for
 * the same collection that land in the same tick are collected and sent as one
 * `?ids=` request.
 *
 * The reason is the cold path, measured on the live site for a 60-card page:
 *
 *     60 per-token requests   11,406 ms cold,  756 ms warm,  32,716 B
 *     1 batched request          713 ms cold,  ~105 ms warm,  1,640 B gzipped
 *
 * Sixty requests are up to sixty serverless invocations, and every cold one
 * fetches the collection's manifest from IPFS before it can answer a single
 * token. One request is one invocation and one manifest read. The warm numbers
 * were never the problem; the first visitor to a collection was.
 *
 * Only our own metadata route is batched, because only it has a batch form.
 * Anything else — a gateway, a third party's API, an `ipfs://` document — takes
 * the ordinary path, at the ordinary politeness limit.
 */


/**
 * Hosts that just failed, and when to bother them again.
 *
 * A collection page asks for sixty documents. If the host serving them is down,
 * that is sixty requests to be told sixty times — measured for real: after the
 * ValueChain upgrade, SoDEX's metadata gateway returned 503 for every token of
 * all three of its collections, and every card asked it separately.
 *
 * So the first 5xx or unreachable host closes the door for half a minute and
 * the rest of the page's asks resolve instantly as "no metadata", which is what
 * they were going to be anyway. The cards render with their ids and no picture,
 * exactly as they do for a collection that publishes nothing.
 *
 * Only 5xx and network failures count. A 404 is one token's business — plenty
 * of collections have gaps — and must never take a whole host down with it.
 */
const failingUntil = new Map<string, number>();

/** Long enough to skip a page's worth of asks, short enough to notice a fix. */
const COOLDOWN_MS = 30_000;

function hostOf(url: string): string {
  try {
    return new URL(url, typeof window === "undefined" ? undefined : window.location.href).host;
  } catch {
    return url;
  }
}

/** True when this host refused us moments ago and is still in its cooldown. */
function refusing(url: string): boolean {
  const until = failingUntil.get(hostOf(url));
  return until !== undefined && Date.now() < until;
}

/** Record a failure worth backing off from. Anything else is left alone. */
function noteFailure(url: string, error: unknown): void {
  const status = error instanceof MetadataHttpError ? error.status : undefined;
  const worthBackingOff = status === undefined || status >= 500;
  if (worthBackingOff) failingUntil.set(hostOf(url), Date.now() + COOLDOWN_MS);
}

/** Our own document URL, split into the parts the batch form needs. */
interface Ours {
  /** `https://host/api/metadata/<collection>` — the batch endpoint itself. */
  endpoint: string;
  id: string;
}

/**
 * Recognise a URL this app serves, without hardcoding a hostname.
 *
 * Same-origin is the test, so localhost, a preview deployment and the real
 * domain all qualify and none of them has to be listed anywhere.
 */
function ours(url: string): Ours | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const u = new URL(url, window.location.href);
    if (u.origin !== window.location.origin) return undefined;

    const parts = u.pathname.split("/").filter((p) => p !== "");
    // ["api", "metadata", "<collection>", "<id>"]
    if (parts.length !== 4 || parts[0] !== "api" || parts[1] !== "metadata") return undefined;

    const collection = parts[2];
    const id = parts[3];
    if (collection === undefined || id === undefined) return undefined;
    if (!/^[0-9]+$/.test(id)) return undefined;

    return { endpoint: `${u.origin}/api/metadata/${collection}`, id };
  } catch {
    return undefined;
  }
}

interface Pending {
  id: string;
  resolve: (value: TokenMetadata | undefined) => void;
  reject: (reason: unknown) => void;
}

/** Waiting asks, grouped by the batch endpoint they belong to. */
const queues = new Map<string, Pending[]>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** The route's own ceiling. Asking for more in one go is a 400. */
const MAX_IDS = 100;

/**
 * How long to wait for other asks before sending.
 *
 * Long enough that a grid rendering sixty cards in one pass lands in one
 * batch, short enough to be invisible. A microtask would be too eager —
 * React Query starts its queries across more than one tick.
 */
const WINDOW_MS = 12;

async function flush(endpoint: string): Promise<void> {
  const waiting = queues.get(endpoint) ?? [];
  queues.delete(endpoint);
  timers.delete(endpoint);
  if (waiting.length === 0) return;

  /** The route caps a request at 100 ids, so a very large grid sends two. */
  for (let start = 0; start < waiting.length; start += MAX_IDS) {
    const chunk = waiting.slice(start, start + MAX_IDS);
    const ids = [...new Set(chunk.map((p) => p.id))];

    try {
      const url = `${endpoint}?ids=${ids.join(",")}`;
      const res = await gated(url, () => fetch(url, { signal: AbortSignal.timeout(20_000) }));
      if (!res.ok) throw new MetadataHttpError(res.status);

      const body = (await res.json()) as { documents?: Record<string, unknown> };
      const documents = body.documents ?? {};

      /**
       * A token the batch did not return is `undefined`, not an error: the
       * route omits ids that do not exist, exactly as the per-token route
       * answers 404 for them.
       */
      for (const p of chunk) {
        const doc = documents[p.id];
        p.resolve(doc === undefined ? undefined : readTokenMetadata(doc));
      }
    } catch (error) {
      /**
       * One failed batch must not cost sixty cards their artwork. Each ask
       * falls back to the per-token route it would have used anyway — which is
       * also the path that still works if this endpoint is ever unavailable
       * while the old one is not.
       */
      noteFailure(endpoint, error);

      for (const p of chunk) {
        /**
         * The per-token route is the fallback, but not against a host that has
         * just failed wholesale — that would turn one bad batch into sixty bad
         * requests, which is the shape this whole file exists to avoid.
         */
        if (refusing(endpoint)) {
          p.resolve(undefined);
          continue;
        }
        fetchTokenMetadata(`${endpoint}/${p.id}`, 20_000).then(p.resolve, () => p.reject(error));
      }
    }
  }
}

/**
 * The index answered nothing for this URL — not "there is nothing there".
 *
 * A distinct value rather than `undefined`, because `undefined` already means
 * "no metadata" to every caller. Confusing the two would render a card as
 * permanently blank the moment the index ran out of time on it.
 */
const UNANSWERED = Symbol("unanswered");

/** One ask waiting on the index. */
interface IndexPending {
  url: string;
  resolve: (value: TokenMetadata | undefined | typeof UNANSWERED) => void;
}

const indexQueue: IndexPending[] = [];
let indexTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Set once the index says it is not configured.
 *
 * Without it, a build with no index pays a wasted request per batch for the
 * life of the tab to be told the same thing every time.
 */
let indexAbsent = false;

/**
 * Fewer per request than the route will take.
 *
 * The URLs travel in the query string and some of them are long; 100 of
 * SoDEX's would run past the 8 KB a proxy may quietly cut off. Fifty is well
 * inside that and still one request for a page of sixty cards.
 */
const INDEX_MAX_URLS = 50;

async function flushIndex(): Promise<void> {
  const waiting = indexQueue.splice(0);
  indexTimer = undefined;
  if (waiting.length === 0) return;

  const give = (value: TokenMetadata | undefined | typeof UNANSWERED) => {
    for (const w of waiting) w.resolve(value);
  };

  try {
    const query = waiting.map((w) => encodeURIComponent(w.url)).join(",");
    const response = await fetch(`/api/index/documents?urls=${query}`);

    /** 503 is "no index here". Stop asking for the life of the tab. */
    if (response.status === 503) {
      indexAbsent = true;
      give(UNANSWERED);
      return;
    }
    if (!response.ok) {
      give(UNANSWERED);
      return;
    }

    const body = (await response.json()) as { documents?: Record<string, unknown> };
    const documents = body.documents ?? {};

    for (const w of waiting) {
      if (!Object.prototype.hasOwnProperty.call(documents, w.url)) {
        /** Not answered. The caller reads it the way it always did. */
        w.resolve(UNANSWERED);
        continue;
      }
      const raw = documents[w.url];
      /**
       * Read here, not trusted as sent. `readTokenMetadata` is the gate that
       * decides what counts as a name, a picture and a trait, and the cached
       * path must not be a laxer door than the direct one.
       */
      w.resolve(raw === null ? undefined : readTokenMetadata(raw));
    }
  } catch {
    give(UNANSWERED);
  }
}

/**
 * Ask the index for one document, batched with everything asked alongside it.
 *
 * Every URL goes through here, whatever host it belongs to — which is the
 * point. The batching already in this file only ever applied to this project's
 * own metadata route, and the collections that actually cost something are
 * SoDEX's, whose contracts name SoDEX's gateway and always will.
 */
function viaIndex(url: string): Promise<TokenMetadata | undefined | typeof UNANSWERED> {
  if (typeof window === "undefined" || indexAbsent) return Promise.resolve(UNANSWERED);

  return new Promise((resolve) => {
    indexQueue.push({ url, resolve });

    if (indexQueue.length >= INDEX_MAX_URLS) {
      if (indexTimer !== undefined) clearTimeout(indexTimer);
      indexTimer = undefined;
      void flushIndex();
      return;
    }

    if (indexTimer === undefined) {
      indexTimer = setTimeout(() => void flushIndex(), WINDOW_MS);
    }
  });
}

export async function loadTokenDocument(
  url: string,
  timeoutMs = 20_000,
): Promise<TokenMetadata | undefined> {
  const cached = await viaIndex(url);
  if (cached !== UNANSWERED) return cached;

  return loadTokenDocumentDirect(url, timeoutMs);
}

/**
 * The path this file had before the index existed, unchanged.
 *
 * Still reached whenever the index is unset, down, or ran out of time on a
 * URL — so it stays exercised rather than becoming code nobody has run in six
 * months.
 */
function loadTokenDocumentDirect(
  url: string,
  timeoutMs = 20_000,
): Promise<TokenMetadata | undefined> {
  const mine = ours(url);
  if (mine === undefined) {
    /** This host just refused everything; do not ask it once per card. */
    if (refusing(url)) return Promise.resolve(undefined);

    return gated(url, () => fetchTokenMetadata(url, timeoutMs)).catch((error: unknown) => {
      noteFailure(url, error);
      throw error;
    });
  }

  return new Promise<TokenMetadata | undefined>((resolve, reject) => {
    const queue = queues.get(mine.endpoint) ?? [];
    queue.push({ id: mine.id, resolve, reject });
    queues.set(mine.endpoint, queue);

    /**
     * Send as soon as the window closes, or immediately once a full request's
     * worth has accumulated — a large grid should not wait out the timer for a
     * batch it has already filled.
     */
    if (queue.length >= MAX_IDS) {
      const timer = timers.get(mine.endpoint);
      if (timer !== undefined) clearTimeout(timer);
      void flush(mine.endpoint);
      return;
    }

    if (!timers.has(mine.endpoint)) {
      timers.set(
        mine.endpoint,
        setTimeout(() => void flush(mine.endpoint), WINDOW_MS),
      );
    }
  });
}
