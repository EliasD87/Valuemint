import type { Metadata } from "next";
import { cache } from "react";
import { CollectionView } from "./CollectionView";
import { collectionShare } from "@/lib/shareMeta";

/**
 * Server shell so this route can export metadata — see the note in the token
 * route for why the split exists.
 *
 * The cover comes from the collection's first minted piece, which is the only
 * image a bare ERC-721 can be asked for without knowing anything about how the
 * collection was made.
 */
/**
 * Rendered once per collection on first request, then cached for an hour — the
 * same reasoning as the token route: the page is drawn in the browser, and the
 * server only builds the share preview, which an hour cannot make wrong.
 */
export const revalidate = 3600;

/**
 * One read per render for both the link preview and the page (2026-10-30).
 * `generateMetadata` and the page each asked for it, and `cache` makes that
 * one set of chain reads rather than two.
 */
const shareFor = cache((address: string) => collectionShare(address));

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const share = await shareFor(address);

  const name = share?.name ?? "Collection";
  const title = share?.symbol === undefined ? name : `${name} (${share.symbol})`;
  const minted =
    share?.minted === undefined ? "" : ` ${share.minted.toLocaleString()} minted so far.`;
  const description = `${name} on ValueChain.${minted} Browse the pieces, mint, buy and make offers on ValueMint.`;

  const images = share?.image === undefined ? undefined : [{ url: share.image, alt: name }];

  return {
    title,
    description,
    openGraph: { title, description, images, type: "website" },
    twitter: {
      card: share?.image === undefined ? "summary" : "summary_large_image",
      title,
      description,
      images: share?.image === undefined ? undefined : [share.image],
    },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  /**
   * The name, symbol and pieces minted, as of this page's last render (up to
   * an hour old), so the header draws with the page instead of after the
   * browser's own chain read. The browser still reads them and its answer
   * replaces these the moment it lands.
   */
  const { address } = await params;
  const share = await shareFor(address);
  const seed =
    share === undefined
      ? undefined
      : {
          ...(share.name === undefined ? {} : { name: share.name }),
          ...(share.symbol === undefined ? {} : { symbol: share.symbol }),
          ...(share.minted === undefined ? {} : { minted: String(share.minted) }),
        };
  return <CollectionView params={params} {...(seed === undefined ? {} : { seed })} />;
}
