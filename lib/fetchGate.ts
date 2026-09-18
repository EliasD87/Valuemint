"use client";

/**
 * How many metadata fetches may be in flight at once, by who is answering.
 *
 * One number used to serve both, and it was set for the stricter of the two:
 * eight. That is right for a public IPFS gateway, which is somebody else's
 * shared infrastructure and will rate-limit or simply stall under a burst. It
 * is badly wrong for our own `/api/metadata`, which is a CDN edge answering in
 * 110-220 ms and is built to be hit hard.
 *
 * The cost of conflating them was measured on a live collection page: sixty
 * tokens fetched eight at a time is eight serial waves before the last document
 * lands, and because the grid waited for ALL of them, no artwork appeared until
 * the slowest wave finished. The first image did not start downloading until
 * 5.70 s, while the first metadata document had arrived at 1.71 s.
 *
 * So the gate is per class of host. HTTP/2 multiplexes the same-origin requests
 * down one connection, so twenty-four of ours cost little more than eight; a
 * gateway keeps the polite number it always had.
 */

/** Our own origin — a CDN we pay for and control. */
const OURS = 24;

/** Somebody else's gateway. Unchanged, deliberately. */
const THEIRS = 8;

interface Gate {
  active: number;
  readonly limit: number;
  readonly waiting: Array<() => void>;
}

const gates = new Map<string, Gate>();

function gateFor(url: string): Gate {
  /**
   * Same-origin is the only thing that gets the higher limit, and it is decided
   * by the browser's own idea of the origin rather than by matching a hostname
   * string — a preview deployment, a custom domain and localhost are all "ours"
   * without anything needing to list them.
   */
  let key = "gateway";
  try {
    if (typeof window !== "undefined" && new URL(url, window.location.href).origin === window.location.origin) {
      key = "ours";
    }
  } catch {
    // An unparseable URL is treated as somebody else's, which is the safe way
    // round: it gets the smaller limit.
  }

  const existing = gates.get(key);
  if (existing !== undefined) return existing;

  const made: Gate = { active: 0, limit: key === "ours" ? OURS : THEIRS, waiting: [] };
  gates.set(key, made);
  return made;
}

/**
 * Run `work` once the gate for this URL has room.
 *
 * Deliberately a semaphore rather than a batching queue: a caller asks for one
 * document and gets one promise, so a card can render the moment *its* document
 * arrives instead of waiting for the batch it happened to be in.
 */
export async function gated<T>(url: string, work: () => Promise<T>): Promise<T> {
  const gate = gateFor(url);

  if (gate.active >= gate.limit) {
    await new Promise<void>((resolve) => gate.waiting.push(resolve));
  }
  gate.active += 1;

  try {
    return await work();
  } finally {
    gate.active -= 1;
    const next = gate.waiting.shift();
    if (next !== undefined) next();
  }
}
