import { encodePacked, keccak256, type Hex } from "viem";

/**
 * A ticket draw anyone can re-run (2026-10-15, first used for the Cybereator
 * seats given to Trenches holders; see config/draws.ts). The same rules run on
 * chain in contracts/TicketDraw.sol; the tests there prove both agree.
 *
 * The list is frozen first: every wallet, in address order, holds a run of
 * *places* (`from`..`to`), published at /draws/<id>.json.
 *
 * Then the places are shuffled into ticket numbers by `numberSeed`, the hash of
 * a block named when the list was sealed (owner, 2026-10-16: randomise the
 * numbers). The shuffle is a bijection, so each place gets one number and each
 * number one place — it changes how the numbers look, never anyone's odds.
 *
 * Then round r (0, 1, 2…) of the draw picks
 *
 *     ticket = keccak256(seed, r, attempt) mod totalTickets + 1
 *
 * starting at attempt 0, where `seed` is the hash of the later draw block. If
 * that ticket's wallet has already won, the round tries attempt 1, 2… until it
 * lands on a wallet that has not: one prize per wallet. The modulo bias over a
 * 256-bit hash is negligible.
 */

export interface DrawEntry {
  wallet: string;
  /** The depth of every qualifying piece held at the snapshot. */
  depths: number[];
  tickets: number;
  /** First and last place held, inclusive (places, not ticket numbers). */
  from: number;
  to: number;
}

export interface DrawList {
  id: string;
  snapshot: { block: number; time: string };
  rule: string;
  wallets: number;
  tickets: number;
  entries: DrawEntry[];
  /** Written by `STEP=number` once the contract has shuffled the numbers. */
  numbers?: { block: number; seed: Hex; contract: string };
}

export interface DrawWinner {
  /** 1-based place in the result. */
  place: number;
  wallet: string;
  /** The ticket number that won. */
  ticket: number;
  tickets: number;
  /** How many re-draws this round needed because the ticket's wallet had already won. */
  attempt: number;
}

const FEISTEL_ROUNDS = 4;

/** Mirror of TicketDraw._shuffle: 0-based place -> 0-based number on [0, n), or back. */
export function shuffle(x: number, n: number, numberSeed: Hex, inverse = false): number {
  let bits = 2;
  while (2 ** bits < n) bits += 2;
  const h = bits / 2;
  const mask = (1n << BigInt(h)) - 1n;
  const f = (i: number, v: number) =>
    Number(BigInt(keccak256(encodePacked(["bytes32", "uint256", "uint256"], [numberSeed, BigInt(i), BigInt(v)]))) & mask);
  do {
    let l = Math.floor(x / 2 ** h);
    let r = x % 2 ** h;
    if (!inverse) {
      for (let i = 0; i < FEISTEL_ROUNDS; i++) [l, r] = [r, l ^ f(i, r)];
    } else {
      for (let i = FEISTEL_ROUNDS; i > 0; i--) [l, r] = [r ^ f(i - 1, l), l];
    }
    x = l * 2 ** h + r;
  } while (x >= n);
  return x;
}

/** The ticket number a place got, both 1-based. */
export function numberOfPlace(place: number, total: number, numberSeed: Hex): number {
  return shuffle(place - 1, total, numberSeed) + 1;
}

/** The place a ticket number belongs to, both 1-based. */
export function placeOfNumber(ticket: number, total: number, numberSeed: Hex): number {
  return shuffle(ticket - 1, total, numberSeed, true) + 1;
}

/** Every ticket number a wallet holds, ascending. */
export function numbersOf(e: Pick<DrawEntry, "from" | "to">, total: number, numberSeed: Hex): number[] {
  const out: number[] = [];
  for (let p = e.from; p <= e.to; p++) out.push(numberOfPlace(p, total, numberSeed));
  return out.sort((a, b) => a - b);
}

/** The entry holding a place, or undefined if the place is out of range. */
export function ownerOfPlace(entries: readonly DrawEntry[], place: number): DrawEntry | undefined {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = entries[mid]!;
    if (place < e.from) hi = mid - 1;
    else if (place > e.to) lo = mid + 1;
    else return e;
  }
  return undefined;
}

/** The wallet holding a ticket number: through the shuffle when there is one. */
export function ownerOfTicket(entries: readonly DrawEntry[], ticket: number, numberSeed?: Hex): DrawEntry | undefined {
  const total = entries.length === 0 ? 0 : entries[entries.length - 1]!.to;
  if (ticket < 1 || ticket > total) return undefined;
  return ownerOfPlace(entries, numberSeed === undefined ? ticket : placeOfNumber(ticket, total, numberSeed));
}

/** The ticket a round lands on before any re-draw logic. */
export function ticketFor(seed: Hex, round: number, attempt: number, total: number): number {
  const h = keccak256(encodePacked(["bytes32", "uint256", "uint256"], [seed, BigInt(round), BigInt(attempt)]));
  return Number(BigInt(h) % BigInt(total)) + 1;
}

/** Checks the list is what the draw assumes: runs start at 1, touch, never overlap, match their counts. */
export function validateEntries(entries: readonly DrawEntry[]): number {
  let next = 1;
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.from !== next || e.to < e.from || e.to - e.from + 1 !== e.tickets) {
      throw new Error(`ticket ranges are not contiguous at ${e.wallet}`);
    }
    const k = e.wallet.toLowerCase();
    if (seen.has(k)) throw new Error(`${e.wallet} is listed twice`);
    seen.add(k);
    next = e.to + 1;
  }
  return next - 1;
}

/** Give every wallet its run of places in a fixed order: by address, so the order favours nobody. */
export function numberTickets(rows: ReadonlyArray<{ wallet: string; depths: number[]; tickets: number }>): DrawEntry[] {
  let next = 1;
  return [...rows]
    .filter((r) => r.tickets > 0)
    .sort((a, b) => (a.wallet.toLowerCase() < b.wallet.toLowerCase() ? -1 : 1))
    .map((r) => {
      const e = { ...r, from: next, to: next + r.tickets - 1 };
      next += r.tickets;
      return e;
    });
}

/**
 * The winners. With `numberSeed` (the on-chain draw), each round's ticket is a
 * shuffled number; without it, a place — the draw before numbers were shuffled.
 */
export function drawWinners(entries: readonly DrawEntry[], seed: Hex, winners: number, numberSeed?: Hex): DrawWinner[] {
  const total = validateEntries(entries);
  const want = Math.min(winners, entries.length);
  const won = new Set<string>();
  const out: DrawWinner[] = [];
  for (let round = 0; out.length < want; round++) {
    for (let attempt = 0; ; attempt++) {
      const ticket = ticketFor(seed, round, attempt, total);
      const e = ownerOfTicket(entries, ticket, numberSeed)!;
      const k = e.wallet.toLowerCase();
      if (won.has(k)) continue;
      won.add(k);
      out.push({ place: out.length + 1, wallet: e.wallet, ticket, tickets: e.tickets, attempt });
      break;
    }
  }
  return out;
}
