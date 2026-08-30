import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { KNOWN_COLLECTIONS } from "@/config/known";
import { isHidden } from "@/config/hidden";

/**
 * The pages worth indexing.
 *
 * Deliberately not every token. The marketplace holds thousands and they are
 * discovered from the chain at request time, so enumerating them here would
 * mean a full chain scan on every sitemap fetch to produce a list that is stale
 * the moment it is written. Collections are the durable, linkable unit;
 * crawlers reach individual pieces from there.
 *
 * Hidden collections are excluded — a sitemap is a recommendation, and
 * recommending something the site itself refuses to list is incoherent.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = (
    [
      { url: base, changeFrequency: "hourly", priority: 1 },
      { url: `${base}/mint`, changeFrequency: "hourly", priority: 0.9 },
      { url: `${base}/market`, changeFrequency: "hourly", priority: 0.9 },
      { url: `${base}/collections`, changeFrequency: "daily", priority: 0.8 },
      { url: `${base}/trenches`, changeFrequency: "daily", priority: 0.7 },
      { url: `${base}/kols`, changeFrequency: "weekly", priority: 0.6 },
      { url: `${base}/create`, changeFrequency: "monthly", priority: 0.5 },
    ] satisfies MetadataRoute.Sitemap
  ).map((p) => ({ ...p, lastModified: now }));

  const collections: MetadataRoute.Sitemap = KNOWN_COLLECTIONS.filter(
    (c) => !isHidden(c.address),
  ).map((c) => ({
    url: `${base}/collection/${c.address}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...collections];
}
