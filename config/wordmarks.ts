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
 */

export type WordmarkKey = "cybereator";

/** Lower-cased collection address -> the mark it uses. */
const WORDMARKS: Record<string, WordmarkKey> = {
  /** Cybereator. */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": "cybereator",

  /** TestCybereator — SoDEX's test deployment of the same collection. */
  "0x412d8af16b7ff3fe75e1cd380bd86ef33dd8ad0f": "cybereator",
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
