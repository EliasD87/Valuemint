import type { Metadata } from "next";
import { TokenView } from "./TokenView";
import { tokenShare } from "@/lib/shareMeta";

/**
 * A server shell around the client page, so this route can export metadata.
 *
 * The view below is a client component — it needs wallet state, live chain
 * reads and interaction — and a client component cannot export
 * `generateMetadata`. Without this split, a token link pasted into X, Discord
 * or Telegram rendered as a bare URL: the scraper reads the HTML, never runs
 * the JavaScript, and every page on the site inherited the same generic
 * description from the root layout.
 *
 * For an NFT marketplace that is a growth defect as much as a technical one —
 * a shared piece that shows no picture is a shared piece nobody clicks.
 */
/**
 * Rendered once per piece on first request, then served from the cache for an
 * hour.
 *
 * This shell was rendered on every request. Everything a visitor sees is drawn
 * in the browser by `TokenView`; the server's whole job is the share preview
 * below, which reads the chain and a metadata document — about a second of
 * function time each time. Grids prefetch every card in view, so one scroll of
 * /market cost 35 of those (measured 2026-09-30), for previews nobody was
 * going to share. An hour-old preview is still the right picture and name.
 *
 * `generateStaticParams` returns nothing: no piece is built ahead of time, any
 * piece is built when first asked for. That empty list is what makes the
 * route cacheable at all.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string; id: string }>;
}): Promise<Metadata> {
  const { address, id } = await params;
  const share = await tokenShare(address, id);

  const name = share?.name ?? `Token #${id}`;

  /**
   * The collection is appended only when the token's own name does not already
   * say it. Most collections name their pieces "<Collection> #N — <Design>",
   * and appending blindly produced "ValueChain Genesis #1 — STRIDE — ValueChain
   * Genesis", which reads as a bug in the preview rather than a title.
   */
  const collection = share?.collectionName;
  const title =
    collection === undefined || name.toLowerCase().includes(collection.toLowerCase())
      ? name
      : `${name} — ${collection}`;
  const description =
    share?.description ??
    `${name}${collection === undefined ? "" : ` from ${collection}`}, on ValueChain. View it, buy it, or make an offer on ValueMint.`;

  /**
   * The artwork is the preview. It is square rather than the 1.91:1 most
   * scrapers prefer, so it is centre-cropped — which for NFT art is the right
   * crop anyway, and far better than the alternative of no image at all.
   */
  const images = share?.image === undefined ? undefined : [{ url: share.image, alt: name }];

  return {
    title,
    description,
    openGraph: { title, description, images, type: "article" },
    twitter: {
      card: share?.image === undefined ? "summary" : "summary_large_image",
      title,
      description,
      images: share?.image === undefined ? undefined : [share.image],
    },
  };
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ address: string; id: string }>;
}) {
  return <TokenView params={params} />;
}
