import type { Metadata } from "next";
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

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const share = await collectionShare(address);

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
  return <CollectionView params={params} />;
}
