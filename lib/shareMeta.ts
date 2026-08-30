import "server-only";
import { createPublicClient, erc721Abi, fallback, http } from "viem";
import { RPC_HTTP, valuechain } from "@/config/chain";
import { resolveMediaUrl } from "@/lib/format";
import { metadataFetchAllowed } from "@/lib/media";

/**
 * Server-side reads for link previews.
 *
 * A token or collection link pasted into X, Discord or Telegram is the main way
 * an NFT travels, and every one of ours rendered as a bare URL with no picture:
 * the detail pages are client components, so they cannot export
 * `generateMetadata`, and the only metadata on the whole site was the root
 * layout's. A scraper never runs the JavaScript that would have filled it in.
 *
 * So the facts a preview needs are fetched here, on the server, from the chain
 * and the same pinned metadata the page will show.
 *
 * Everything is best-effort. A preview is a nicety and must never be the reason
 * a page fails to render, so every path returns `undefined` rather than
 * throwing, and each is bounded by a short timeout — a scraper that waits is a
 * scraper that gives up.
 */

const client = createPublicClient({
  chain: valuechain,
  transport: fallback(
    RPC_HTTP.map((url) => http(url, { timeout: 6_000 })),
    { rank: false },
  ),
});

/** Long enough for a warm gateway, short enough that a cold one is abandoned. */
const GATEWAY_TIMEOUT_MS = 6_000;

export interface TokenShare {
  name?: string;
  description?: string;
  image?: string;
  collectionName?: string;
}

export interface CollectionShare {
  name?: string;
  symbol?: string;
  image?: string;
  minted?: number;
}

const isAddress = (v: string): v is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(v);

async function readJson(url: string): Promise<Record<string, unknown> | undefined> {
  /**
   * The host is checked before anything is fetched.
   *
   * `tokenURI` is read from a contract address the caller chose, so this URL is
   * attacker-controlled by construction. Without this gate the server would
   * fetch an instance metadata endpoint, an internal service, or anything else
   * reachable from wherever it runs — and because `name` and `description` end
   * up in meta tags, whatever came back would be returned to the caller. That is
   * reflected SSRF, not blind.
   */
  if (!metadataFetchAllowed(url)) return undefined;

  try {
    const res = await fetch(url, {
      // A permitted host must not be able to bounce the request to an
      // unpermitted one; checking the first URL is worthless if redirects are
      // followed silently.
      redirect: "error",
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      // Pinned content is immutable, so this can be cached hard. It is also
      // what stops every scraper hit becoming a gateway fetch.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return undefined;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export async function tokenShare(
  collection: string,
  id: string,
): Promise<TokenShare | undefined> {
  if (!isAddress(collection)) return undefined;
  let tokenId: bigint;
  try {
    tokenId = BigInt(id);
  } catch {
    return undefined;
  }

  try {
    const [uri, collectionName] = await Promise.all([
      client.readContract({
        address: collection,
        abi: erc721Abi,
        functionName: "tokenURI",
        args: [tokenId],
      }),
      client
        .readContract({ address: collection, abi: erc721Abi, functionName: "name" })
        .catch(() => undefined),
    ]);

    const url = resolveMediaUrl(uri as string);
    const meta = url === undefined ? undefined : await readJson(url);

    return {
      name: typeof meta?.name === "string" ? meta.name : undefined,
      description: typeof meta?.description === "string" ? meta.description : undefined,
      image: resolveMediaUrl(typeof meta?.image === "string" ? meta.image : undefined),
      collectionName: typeof collectionName === "string" ? collectionName : undefined,
    };
  } catch {
    // An address that is not an ERC-721, a token that does not exist, an
    // unreachable node — all the same answer: no preview, page still renders.
    return undefined;
  }
}

export async function collectionShare(
  collection: string,
): Promise<CollectionShare | undefined> {
  if (!isAddress(collection)) return undefined;

  try {
    const [name, symbol, supply] = await Promise.all([
      client
        .readContract({ address: collection, abi: erc721Abi, functionName: "name" })
        .catch(() => undefined),
      client
        .readContract({ address: collection, abi: erc721Abi, functionName: "symbol" })
        .catch(() => undefined),
      client
        .readContract({ address: collection, abi: erc721Abi, functionName: "totalSupply" })
        .catch(() => undefined),
    ]);

    if (name === undefined && symbol === undefined) return undefined;

    /**
     * The cover is the collection's first piece. Reading one token is enough to
     * make the link show artwork, and a collection with nothing minted has no
     * artwork to show anyway.
     */
    let image: string | undefined;
    try {
      const first = await client.readContract({
        address: collection,
        abi: erc721Abi,
        functionName: "tokenByIndex",
        args: [0n],
      });
      const uri = await client.readContract({
        address: collection,
        abi: erc721Abi,
        functionName: "tokenURI",
        args: [first as bigint],
      });
      const url = resolveMediaUrl(uri as string);
      const meta = url === undefined ? undefined : await readJson(url);
      image = resolveMediaUrl(typeof meta?.image === "string" ? meta.image : undefined);
    } catch {
      // Not enumerable, or nothing minted. The preview simply has no picture.
    }

    return {
      name: typeof name === "string" ? name : undefined,
      symbol: typeof symbol === "string" ? symbol : undefined,
      minted: typeof supply === "bigint" ? Number(supply) : undefined,
      image,
    };
  } catch {
    return undefined;
  }
}
