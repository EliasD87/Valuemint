import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * There was no robots file at all, which means crawlers guessed.
 *
 * `/api/` is disallowed because nothing under it is a page: /api/metadata is
 * machine-readable JSON that wallets and other marketplaces fetch, and having
 * it indexed puts raw metadata documents in search results instead of the
 * pages that present them.
 *
 * `/safe` is disallowed because it is an owner tool, not a page for visitors.
 * Nothing on it is secret — a Safe's owners and every approval it records are
 * public on chain — but an indexed page on this domain naming the wallets that
 * control the project is a gift to anyone composing a phishing message. The
 * page also carries a `noindex` of its own; this stops well-behaved crawlers
 * fetching it at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/safe"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
