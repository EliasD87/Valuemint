/**
 * Collections that have their own wordmark, and where to find it.
 *
 * ── TO ADD ONE ───────────────────────────────────────────────────────────
 *
 * Put two PNGs in `public/brand/`: `<key>-dark.png` drawn light, for dark
 * grounds, and `<key>-light.png` drawn dark, for light ones. Name the key
 * here against the collection's address, add a `--mark-<key>` custom property
 * in `components/Wordmark.css`, and list its aspect ratio there.
 *
 * Both cuts are required. One drawing cannot serve both themes: a white
 * wordmark on a white card does not look wrong, it disappears, which is the
 * harder fault to notice. Generating the second from the first's alpha channel
 * keeps them the same shape — see the note in Wordmark.css.
 *
 * Add the word it spells to `SAYS` below at the same time. A mark is only a
 * legitimate substitute for the text it actually draws, and `wordmarkSaying`
 * is what enforces that.
 */

export type WordmarkKey = "cybereator";

/** Lower-cased collection address -> the mark it uses. */
const WORDMARKS: Record<string, WordmarkKey> = {
  /** Cybereator. */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": "cybereator",

  /** TestCybereator — SoDEX's test deployment of the same collection. */
  "0x412d8af16b7ff3fe75e1cd380bd86ef33dd8ad0f": "cybereator",
};

/** What each mark spells, so a caller can check before substituting it. */
const SAYS: Record<WordmarkKey, string> = {
  cybereator: "Cybereator",
};

/**
 * The wordmark for a collection, if it has one.
 *
 * `undefined` for everything else, so a caller falls straight through to
 * typesetting the name as before.
 */
export function wordmarkFor(address: string | undefined): WordmarkKey | undefined {
  if (address === undefined) return undefined;
  return WORDMARKS[address.toLowerCase()];
}

/**
 * The mark for this collection, but only if it spells this exact text.
 *
 * Use this wherever the text being replaced is a PIECE's name rather than the
 * collection's. On a token card the name comes from the design in the
 * manifest, and it is only a coincidence of Cybereator's that all thousand of
 * them read "Cybereator" — the collection ships one design. Swapping on
 * `wordmarkFor` alone would draw that same mark over "Red #3" and "Blue #7"
 * the moment a collection with a wordmark has more than one design, silently
 * replacing the one thing on the card that told the pieces apart.
 *
 * So the substitution is allowed exactly when it changes nothing but the
 * typesetting: the drawing says what the text said.
 */
export function wordmarkSaying(
  address: string | undefined,
  text: string | undefined,
): WordmarkKey | undefined {
  const mark = wordmarkFor(address);
  if (mark === undefined || text === undefined) return undefined;
  return SAYS[mark].toLowerCase() === text.trim().toLowerCase() ? mark : undefined;
}
