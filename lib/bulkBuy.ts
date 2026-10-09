import { parseEventLogs, type Hex, type Log } from "viem";
import { SEAPORT, SeaportAbi } from "@/config/seaport";
import type { FillBlock } from "@/lib/fillCheck";

/**
 * What a bulk buy tells the buyer when some of their picks went to someone
 * else (2026-10-09).
 *
 * A pick can go three ways between being tapped and the purchase landing:
 *
 * 1. The page's own re-check (every 25 seconds, straight from the chain) sees
 *    it has gone, and it comes off the list before Buy is pressed.
 * 2. The check run just before the wallet opens finds it gone. It is left out
 *    of the transaction, so the buyer never sends SOSO for it.
 * 3. Someone else's purchase lands first, between the check and this one.
 *    Seaport skips it and returns its SOSO in the same transaction.
 *
 * In every case the buyer is not charged for what they did not get. What they
 * need told is how many they got.
 */

const pieces = (n: number) => (n === 1 ? "1 piece" : `${n} pieces`);

/** Nothing left to buy by the time the check ran. */
export const ALL_GONE: FillBlock = {
  kind: "sold",
  say: "Everything you picked has already gone to someone else. Nothing was sent, and you have not paid any gas.",
  refresh: true,
};

/** Mined and reverted: every one of them was bought between the check and this. */
export const BULK_REVERTED =
  "None of these went through: someone else got them first. Nothing was bought; you paid only a little gas.";

/** Case 1: picks the page has already seen go. */
export function goneNote(gone: number): string | undefined {
  if (gone <= 0) return undefined;
  return gone === 1
    ? "1 of your picks was just bought by someone else or taken down, so it is off your list."
    : `${gone} of your picks were just bought by someone else or taken down, so they are off your list.`;
}

/** Case 2, said while the wallet is open: what is actually being bought. */
export function skippedNote(asked: number, sent: number): string | undefined {
  const skipped = asked - sent;
  if (skipped <= 0) return undefined;
  return `${skipped} of your picks ${skipped === 1 ? "has" : "have"} just gone to someone else, so this buys the other ${sent === 1 ? "one" : sent}.`;
}

/** After it lands. `undefined` when everything picked was bought. */
export function boughtNote(asked: number, bought: number): string | undefined {
  const missed = asked - bought;
  if (missed <= 0) return undefined;
  return `You got ${pieces(bought)} of ${asked}. Someone else got the other ${missed === 1 ? "one" : missed} first, and you were not charged for ${missed === 1 ? "it" : "them"}.`;
}

/**
 * How many of the orders sent were actually filled, read from the receipt.
 *
 * Seaport emits `OrderFulfilled` once for each order it fills and nothing for
 * one it skips, so this is the count of the buyer's own order hashes among
 * Seaport's fulfilments in that transaction.
 */
export function countBought(logs: readonly Log[], sent: readonly Hex[]): number {
  const wanted = new Set(sent.map((h) => h.toLowerCase()));
  const filled = new Set<string>();
  for (const log of parseEventLogs({ abi: SeaportAbi, logs: [...logs], eventName: "OrderFulfilled" })) {
    if (log.address.toLowerCase() !== SEAPORT.toLowerCase()) continue;
    const hash = log.args.orderHash.toLowerCase();
    if (wanted.has(hash)) filled.add(hash);
  }
  return filled.size;
}
