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
