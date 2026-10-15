import { encodePacked, keccak256, type Hex } from "viem";

/**
 * A ticket draw anyone can re-run (2026-10-15, first used for the Cybereator
 * seats given to Trenches holders; see config/draws.ts).
 *
 * The list is frozen before the draw: every wallet holds a fixed, contiguous
 * range of ticket numbers, published at /draws/<id>.json. The randomness is the
 * hash of a ValueChain block chosen and announced in advance, so nobody, us
 * included, can know or steer the outcome when the list is fixed.
 *
 * Round r (0, 1, 2…) picks
 *
 *     ticket = keccak256(seed, r, attempt) mod totalTickets + 1
 *
 * starting at attempt 0. If that ticket's wallet has already won, the round
 * tries attempt 1, 2… until it lands on a wallet that has not. That is exactly
 * "remove a winner's tickets before the next draw", with the published ticket
 * numbers never changing. The modulo bias over a 256-bit hash is negligible.
 */

export interface DrawEntry {
  wallet: string;
  /** The depth of every qualifying piece held at the snapshot. */
  depths: number[];
  tickets: number;
  /** First and last ticket number held, inclusive. */
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
}

export interface DrawWinner {
  /** 1-based place in the draw. */
  place: number;
  wallet: string;
  ticket: number;
  tickets: number;
  /** How many re-draws this round needed because the ticket's wallet had already won. */
  attempt: number;
}

/** The wallet holding a ticket number, or undefined if the number is out of range. */
export function ownerOfTicket(entries: readonly DrawEntry[], ticket: number): DrawEntry | undefined {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = entries[mid]!;
    if (ticket < e.from) hi = mid - 1;
    else if (ticket > e.to) lo = mid + 1;
    else return e;
  }
  return undefined;
}

/** The ticket a round lands on before any re-draw logic. */
export function ticketFor(seed: Hex, round: number, attempt: number, total: number): number {
  const h = keccak256(encodePacked(["bytes32", "uint256", "uint256"], [seed, BigInt(round), BigInt(attempt)]));
  return Number(BigInt(h) % BigInt(total)) + 1;
}

/** Checks the list is what the draw assumes: ranges start at 1, touch, never overlap, match their counts. */
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

/** Number every wallet's tickets in a fixed order: by address, so the order favours nobody. */
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

export function drawWinners(entries: readonly DrawEntry[], seed: Hex, winners: number): DrawWinner[] {
  const total = validateEntries(entries);
  const want = Math.min(winners, entries.length);
  const won = new Set<string>();
  const out: DrawWinner[] = [];
  for (let round = 0; out.length < want; round++) {
    for (let attempt = 0; ; attempt++) {
      const ticket = ticketFor(seed, round, attempt, total);
      const e = ownerOfTicket(entries, ticket)!;
      const k = e.wallet.toLowerCase();
      if (won.has(k)) continue;
      won.add(k);
      out.push({ place: out.length + 1, wallet: e.wallet, ticket, tickets: e.tickets, attempt });
      break;
    }
  }
  return out;
}
