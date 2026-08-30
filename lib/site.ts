/**
 * The site's own origin.
 *
 * `SITE_URL` is the same variable that is baked into every collection's
 * permanent `baseURI`, so this stays consistent with what is already on chain
 * rather than introducing a second idea of where the site lives.
 *
 * Trailing slashes are stripped: `${siteUrl()}/sitemap.xml` should not produce
 * a double slash, and a sitemap full of them is a sitemap full of duplicates.
 */
export function siteUrl(): string {
  const raw = process.env.SITE_URL ?? "https://www.valuemint.store";
  return raw.replace(/\/+$/, "");
}
