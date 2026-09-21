/**
 * The two rules the document cache got wrong, in one place that can be tested.
 *
 * Both were written correctly in a comment and implemented backwards, and
 * between them they blanked every Treasure Box card on the live site for
 * twenty-five minutes. Neither is complicated. Both are invisible when wrong:
 * a card renders empty, nothing throws, and nothing in a log says why.
 *
 * So they are pure functions with tests rather than branches inside a route
 * handler that only runs against the network.
 */

export type DocStatus = "ok" | "missing" | "refused";

export interface Decided {
  status: DocStatus;
  /** What to store. Only meaningful when `ok`. */
  raw: unknown;
}

/**
 * What a fetch attempt amounts to.
 *
 * `body` is `undefined` when nothing JSON came back, which is different from a
 * body of `null` — some hosts genuinely answer `null`.
 */
export interface Attempt {
  /** Did the allowlist permit this URL at all? */
  allowed: boolean;
  /** HTTP ok, or `undefined` when the request never completed. */
  ok?: boolean;
  /** The status code, where there was one. */
  status?: number;
  /** The parsed body, or `undefined` when there was no JSON to read. */
  body?: unknown;
  /** Whether the body is something this app can read as metadata. */
  readable: boolean;
}

/**
 * **Rule one: the body decides, not the status.**
 *
 * SoDEX's gateway answers `501 Not Implemented` and then sends a perfectly good
 * document — not always, which is worse: of 109 cached documents, 107 had been
 * filed as unfetchable while the same URLs had returned 2xx minutes earlier.
 * `fetchTokenMetadata` has always read that host body-first, which is why the
 * browser path never noticed. Checking `response.ok` first threw every Treasure
 * Box document away.
 *
 * The status only gets a say where there is no JSON to read, and there it
 * separates "there is nothing at this URL" from "ask again later".
 */
export function decideDocument(attempt: Attempt): Decided {
  if (!attempt.allowed) return { status: "refused", raw: null };

  /** A 404 is an answer whatever the body looks like: there is no document. */
  if (attempt.status === 404) return { status: "missing", raw: null };

  if (attempt.body === undefined) {
    /** No JSON. A bad status means try later; a good one means nothing here. */
    return { status: attempt.ok === true ? "missing" : "refused", raw: null };
  }

  /** JSON arrived. Whether it is *metadata* is the only remaining question. */
  if (!attempt.readable) return { status: "missing", raw: null };

  return { status: "ok", raw: attempt.body };
}

/**
 * **Rule two: "I could not read it" is not "there is nothing there".**
 *
 * The caller treats `null` as a final answer and renders a card with no name
 * and no picture. `refused` is not final — it means this cache failed, and the
 * caller should fetch the document the way it did before this cache existed.
 *
 * `omit` is how that is said. Leaving a URL out of the response is the only
 * thing that puts a caller back on its own path; answering `null` takes the
 * fallback away at exactly the moment it is needed.
 */
export function documentAnswer(row: Decided): { omit: true } | { omit: false; value: unknown } {
  if (row.status === "refused") return { omit: true };
  return { omit: false, value: row.status === "ok" ? row.raw : null };
}
