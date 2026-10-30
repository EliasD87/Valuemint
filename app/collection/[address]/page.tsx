import type { Metadata } from "next";
import { cache } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { CollectionView, type CollectionSeed } from "./CollectionView";
import { collectionShare } from "@/lib/shareMeta";
import { activityForPage } from "@/lib/indexActivity";
import { activityQueryKey } from "@/lib/activityWire";
import { floorFor, indexedHead, volumesFrom, type CollectionFiguresSeed } from "@/lib/collectionFigures";
import { fetchOwnerCount, fetchTopHolders } from "@/lib/topHolders";

/**
 * Server shell so this route can export metadata — see the note in the token
 * route for why the split exists.
 *
 * The cover comes from the collection's first minted piece, which is the only
 * image a bare ERC-721 can be asked for without knowing anything about how the
 * collection was made.
 */
/**
 * Rendered on first request, then served from the edge and rebuilt in the
 * background at most once a minute (was an hour, 2026-10-30). The page now
 * carries its floor, volumes, holders and history, which an hour would make
 * visibly wrong; a minute is less than the browser takes to refresh them anyway.
 */
export const revalidate = 60;

/** The same tolerance the browser applies before it trusts the index. */
const MAX_LAG_MS = 180_000;

/**
 * How long a render waits on any one source before going without it. Each
 * figure it skips is one the browser fetches for itself, exactly as before.
 */
const BUDGET_MS = 3_000;
const FLOOR_BUDGET_MS = 5_000;

function within<T>(promise: Promise<T>, ms: number = BUDGET_MS): Promise<T | undefined> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

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
  const { address } = await params;
  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(address);
  const lower = address.toLowerCase() as `0x${string}`;

  /**
   * Everything the page would otherwise fetch after it loaded, read here in
   * parallel and each bounded by `BUDGET_MS`: the header (name, symbol,
   * minted), the stats bar (floor, listed, volumes, owners), the activity
   * panel and the top holders. The browser still reads all of it and its
   * answers replace these as they land.
   *
   * Only for a contract that answered as a collection: an address that is not
   * one gets the plain page and asks nothing more of the index or explorer.
   */
  const share = await shareFor(address);
  const known = isAddress && share !== undefined;
  const [activity, sales, floor, head, owners, holders] = known
    ? await Promise.all([
        within(activityForPage({ collection: lower }, MAX_LAG_MS)),
        within(activityForPage({ collection: lower, salesOnly: true }, MAX_LAG_MS)),
        /** Longer: it checks every listing against the chain, as the browser would. */
        within(floorFor(lower), FLOOR_BUDGET_MS),
        within(indexedHead()),
        within(fetchOwnerCount(lower)),
        within(fetchTopHolders(lower)),
      ])
    : [];

  const figures: CollectionFiguresSeed = {
    ...(floor ?? {}),
    ...(sales !== undefined && head !== undefined ? volumesFrom(sales, head) : {}),
  };

  const client = new QueryClient();
  if (activity !== undefined) client.setQueryData(activityQueryKey({ collection: lower }), activity);
  if (sales !== undefined) client.setQueryData(activityQueryKey({ collection: lower, salesOnly: true }), sales);
  if (owners !== undefined && owners !== null) client.setQueryData(["owner-count", lower], owners);
  if (holders !== undefined) client.setQueryData(["top-holders", lower], holders);

  const seed: CollectionSeed | undefined =
    share === undefined
      ? undefined
      : {
          ...(share.name === undefined ? {} : { name: share.name }),
          ...(share.symbol === undefined ? {} : { symbol: share.symbol }),
          ...(share.minted === undefined ? {} : { minted: String(share.minted) }),
          ...(Object.keys(figures).length === 0 ? {} : { figures }),
        };

  return (
    <HydrationBoundary state={dehydrate(client)}>
      <CollectionView params={params} {...(seed === undefined ? {} : { seed })} />
    </HydrationBoundary>
  );
}
