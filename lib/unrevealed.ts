import type { TokenMetadata } from "@/lib/tokenMetadata";

/**
 * Whether a token document is one `/api/metadata` serves for a piece whose
 * design has not been published yet.
 *
 * Keyed on the ABSENCE of a design rather than the presence of the word
 * "Unrevealed", because the absence is the thing that is actually true and the
 * word is a label that could be spelled differently tomorrow. A revealed piece
 * always carries a Design; nothing else does.
 *
 * It deliberately does not ask the collection whether it holds anything back —
 * a document either names a design or it does not, and a page should render
 * what it was handed.
 */
export function isUnrevealed(metadata: TokenMetadata | undefined): boolean {
  const attributes = metadata?.attributes;
  if (attributes === undefined || attributes.length === 0) return false;
  return !attributes.some((a) => String(a.trait_type).toLowerCase() === "design");
}

/**
 * When a held-back piece becomes public, in words.
 *
 * Two lengths from one place, so the card and the token page can never
 * disagree about the date — the bug that would follow from formatting it at
 * each call site is one surface saying October and another saying mint-out.
 *
 * Both fall back to the mint-out wording when no date is set, because that is
 * the promise being made when there is no date: true, and open-ended.
 */
export function revealShort(held: { revealBy?: string }): string {
  if (held.revealBy === undefined) return "At mint-out";
  return new Date(`${held.revealBy}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function revealLong(held: { revealBy?: string }): string {
  if (held.revealBy === undefined) return "when the last one is minted";
  return `on ${new Date(`${held.revealBy}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })}`;
}
