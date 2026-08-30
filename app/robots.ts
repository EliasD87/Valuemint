import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * There was no robots file at all, which means crawlers guessed.
 *
 * `/api/` is disallowed because nothing under it is a page: /api/metadata is
 * machine-readable JSON that wallets and other marketplaces fetch, and having
 * it indexed puts raw metadata documents in search results instead of the
 * pages that present them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
