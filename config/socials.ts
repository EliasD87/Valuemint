/**
 * Collections with an official X account, and which one.
 *
 * Keyed by lower-cased address, like `config/wordmarks.ts`, because the name is
 * the one thing anybody can copy. A link on a collection page reads as the site
 * vouching for where it goes, so an account goes here only when its owner has
 * confirmed it is the collection's own.
 */

/** Lower-cased collection address -> X handle, without the "@". */
const X_HANDLES: Record<string, string> = {
  /** Cybereator. */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": "CybeReator",

  /** TestCybereator — SoDEX's test deployment of the same collection. */
  "0x412d8af16b7ff3fe75e1cd380bd86ef33dd8ad0f": "CybeReator",

  /** SoDEX Treasure Box — SoDEX's own account. */
  "0x371c4f7f68be3e558b89cc1f0fb113851c76e750": "sodex_official",
};

/** Lower-cased collection address -> its own website. Same rule as above. */
const WEBSITES: Record<string, string> = {
  /** Cybereator, supplied by the owner (2026-11-10). */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": "https://cybereator.com",
};

/** Lower-cased collection address -> its Discord invite. Same rule as above. */
const DISCORDS: Record<string, string> = {
  /** Cybereator, supplied by the owner (2026-11-10). */
  "0xcd30d4bcaa99e556b70a2c4bdfc4050d26e48d30": "https://discord.gg/Jwa65Z96dk",
};

/** The collection's website, with the bare domain to show, or `undefined`. */
export function websiteFor(address: string | undefined): { url: string; host: string } | undefined {
  if (address === undefined) return undefined;
  const url = WEBSITES[address.toLowerCase()];
  return url === undefined ? undefined : { url, host: new URL(url).host.replace(/^www\./, "") };
}

/** The collection's Discord invite, or `undefined`. */
export function discordFor(address: string | undefined): string | undefined {
  return address === undefined ? undefined : DISCORDS[address.toLowerCase()];
}

/** The collection's X account, or `undefined` if it has none on record. */
export function xAccountFor(
  address: string | undefined,
): { handle: string; url: string } | undefined {
  if (address === undefined) return undefined;
  const handle = X_HANDLES[address.toLowerCase()];
  return handle === undefined ? undefined : { handle, url: `https://x.com/${handle}` };
}
