/**
 * Where a collection's holdings live on the portfolio page.
 *
 * Shared rather than written out at each end, because the two ends are a link
 * in one file and an `id` in another: spelled separately they drift, and the
 * failure is silent — the browser finds no such element, scrolls nowhere, and
 * the reader lands at the top of a long page with no idea they were sent
 * somewhere specific.
 *
 * Lower-cased, because an address reaches this from a chain read in checksum
 * form at one end and from a route parameter at the other.
 */
export function holdingsAnchor(collection: string): string {
  return `holdings-${collection.toLowerCase()}`;
}

/** The collection a `holdingsAnchor` hash names, or undefined for any other hash. */
export function anchoredCollection(hash: string): string | undefined {
  const m = /^#?holdings-(0x[0-9a-f]{40})$/i.exec(hash);
  return m?.[1]?.toLowerCase();
}

/**
 * Fired when something asks the portfolio to open one collection's holdings.
 *
 * The anchor alone is enough when the link lands on a fresh /portfolio, which
 * reads the hash as it mounts. It is not enough when the reader is already
 * there: the App Router changes a hash with `history.pushState`, which fires
 * no `hashchange`, so the page would never hear about it. The link sends this
 * as well, with the collection's address as the detail.
 */
export const HOLDINGS_FOCUS_EVENT = "valuemint:holdings-focus";
