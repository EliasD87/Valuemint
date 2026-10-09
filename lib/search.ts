import { PINNED_COLLECTIONS } from "@/config/featured";
import { coverFor } from "@/config/covers";
import { stillUrl } from "@/lib/media";
import { shortAddress } from "@/lib/format";

/**
 * The header search's matching, kept pure so it can be tested (2026-10-09).
 * See components/Search.tsx for what it is for and what it never touches.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Lower case, letters and digits only: "SoDEX Treasure-Box" and "treasurebox" meet in the middle. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface SearchResult {
  key: string;
  href: string;
  title: string;
  sub: string;
  art?: string;
}

interface Collection {
  address: `0x${string}`;
  name: string;
  symbol?: string;
}

/** Pinned first, in their order; the rest after. */
const pinRank = (address: string) => {
  const i = PINNED_COLLECTIONS.findIndex((p) => p.toLowerCase() === address.toLowerCase());
  return i === -1 ? PINNED_COLLECTIONS.length : i;
};

/** How well `query` names `c`, lower is better; undefined when it does not. */
function score(c: Collection, query: string): number | undefined {
  const q = squash(query);
  if (q === "") return undefined;
  const name = squash(c.name);
  const symbol = squash(c.symbol ?? "");
  if (symbol === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (symbol.startsWith(q)) return 3;
  return undefined;
}

function matching(collections: readonly Collection[], query: string): Collection[] {
  return collections
    .map((c) => ({ c, s: score(c, query) }))
    .filter((x): x is { c: Collection; s: number } => x.s !== undefined)
    .sort((a, b) => a.s - b.s || pinRank(a.c.address) - pinRank(b.c.address) || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c);
}

const MAX_RESULTS = 6;

/** What a query turns into: results to pick from, or a hint saying why there are none. */
export function searchResults(collections: readonly Collection[], raw: string): SearchResult[] | { hint: string } {
  const query = raw.trim();
  const artOf = (address: string) => {
    const art = coverFor(address)?.[0];
    return art === undefined ? undefined : stillUrl(art, 64);
  };
  const asCollection = (c: Collection): SearchResult => ({
    key: `c:${c.address}`,
    href: `/collection/${c.address}`,
    title: c.name,
    sub: c.symbol === undefined || c.symbol === "" ? "Collection" : `Collection · ${c.symbol}`,
    art: artOf(c.address),
  });

  if (query === "") {
    return [...collections]
      .sort((a, b) => pinRank(a.address) - pinRank(b.address) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map(asCollection);
  }

  if (ADDRESS.test(query)) {
    const known = collections.find((c) => c.address.toLowerCase() === query.toLowerCase());
    const wallet: SearchResult = {
      key: "wallet",
      href: `/address/${query}`,
      title: `Wallet ${shortAddress(query as `0x${string}`)}`,
      sub: "See everything this address holds",
    };
    if (known !== undefined) return [asCollection(known), wallet];
    return [
      wallet,
      { key: "as-collection", href: `/collection/${query}`, title: "Open as a collection", sub: "For a contract this site has not listed yet" },
    ];
  }

  if (/^0x/i.test(query) && query.length > 2) {
    return { hint: "A ValueChain address is 0x followed by 40 hex characters." };
  }

  /* The whole query as a name first, so a name with a number in it ("Layer 1") still matches. */
  const named = matching(collections, query);
  if (named.length > 0) return named.slice(0, MAX_RESULTS).map(asCollection);

  /* Then a name and a piece number: "genesis 45", "treasure #79565", "cyber#2760". */
  const split = /^(.*?)[\s#]*#?(\d{1,30})$/.exec(query);
  if (split !== null) {
    const [, text, digits] = split;
    if (text!.trim() === "") {
      return { hint: `Add the collection's name to find piece #${digits}: for example "Genesis ${digits}".` };
    }
    const pieces = matching(collections, text!).slice(0, MAX_RESULTS);
    if (pieces.length > 0) {
      return pieces.map((c) => ({
        key: `t:${c.address}:${digits}`,
        href: `/token/${c.address}/${BigInt(digits!).toString()}`,
        title: `${c.name} #${BigInt(digits!).toString()}`,
        sub: "Open this piece",
        art: artOf(c.address),
      }));
    }
  }

  return { hint: `No collection matches "${query}". Paste a 0x address to look up a wallet.` };
}
