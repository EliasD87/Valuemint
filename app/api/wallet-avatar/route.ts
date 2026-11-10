import { NextResponse } from "next/server";
import { deployment } from "@/config/contracts";
import { CYBEREATOR, CYBEREATOR_IMAGE_HOST, CYBEREATOR_OPENER } from "@/lib/cybereator";
import { CYBEREATOR_LEVELS } from "@/lib/cybereatorRarity";
import { galleryLevel, parseGallery, type GalleryPiece } from "@/lib/cybereatorSets";
import type { WalletAvatar } from "@/lib/walletAvatar";

/**
 * The picture beside a connected wallet in the header (owner, 2026-11-10).
 *
 * `GET /api/wallet-avatar?address=0x…` → a `WalletAvatar`: the wallet's
 * rarest revealed Cybereator, or "sealed" when it holds only sealed ones, or
 * "none". The header draws its own fallbacks for the last two.
 *
 * Built to cost almost nothing per visitor:
 *   - one explorer request for the wallet's Cybereators (its holder filter
 *     answers exactly that), which is the only per-wallet read;
 *   - cybereator.com's gallery for which of them are revealed and how rare,
 *     through Next's data cache, so it is read about once a minute in total;
 *   - the answer cached at the edge per address for five minutes.
 * The explorer's own images are the sealed ones still, so only its ids are
 * used; the picture is the team's 512px thumbnail, the one list pages use.
 */

export const runtime = "nodejs";

const GALLERY = "https://cybereator.com/api/gallery";

/** Two pages of 50 is every Cybereator for all but the very largest holders. */
const PAGES = 2;

const KEEP = "public, s-maxage=300, stale-while-revalidate=3600";
/* Sealed pieces are opening all day; ask again sooner. */
const SOON = "public, s-maxage=60, stale-while-revalidate=300";

interface Instances {
  items?: Array<{ id?: string }>;
  next_page_params?: Record<string, string | number> | null;
}

async function heldIds(address: string): Promise<string[]> {
  const ids: string[] = [];
  let params: Record<string, string | number> | null | undefined = { holder_address_hash: address };
  for (let page = 0; page < PAGES && params; page++) {
    const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${deployment.explorer}/api/v2/tokens/${CYBEREATOR}/instances?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`explorer answered ${res.status}`);
    const json = (await res.json()) as Instances;
    for (const item of json.items ?? []) if (typeof item.id === "string" && /^[0-9]+$/.test(item.id)) ids.push(item.id);
    params = json.next_page_params;
  }
  return ids;
}

async function gallery(): Promise<GalleryPiece[]> {
  const res = await fetch(GALLERY, { next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`gallery answered ${res.status}`);
  return parseGallery(await res.json());
}

function answer(body: WalletAvatar | { error: string }, cache: string, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": cache } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return answer({ error: "Not an address." }, "no-store", 400);

  try {
    const held = await heldIds(address.toLowerCase());
    if (held.length === 0) return answer({ kind: "none" }, KEEP);

    const byId = new Map((await gallery()).map((p) => [p.id.toString(), p]));
    let best: { piece: GalleryPiece; rank: number } | undefined;
    for (const id of held) {
      const piece = byId.get(id);
      if (piece === undefined) continue;
      const level = galleryLevel(piece);
      const rank = level === undefined ? -1 : CYBEREATOR_LEVELS.indexOf(level);
      /* Rarest first; between equals, the one opened earliest. */
      if (best === undefined || rank > best.rank || (rank === best.rank && piece.openIndex < best.piece.openIndex)) {
        best = { piece, rank };
      }
    }
    if (best === undefined) return answer({ kind: "sealed" }, SOON);

    const id = best.piece.id.toString();
    return answer(
      {
        kind: "revealed",
        id,
        image: `https://${CYBEREATOR_IMAGE_HOST}/286623/${CYBEREATOR_OPENER}/thumbs/${id}.webp`,
        ...(best.rank < 0 ? {} : { level: CYBEREATOR_LEVELS[best.rank] }),
      },
      KEEP,
    );
  } catch (err) {
    /* The header falls back to its own drawing; say nothing worse than "none", briefly. */
    console.warn("[wallet-avatar]", err instanceof Error ? err.message : err);
    return answer({ kind: "none" }, "public, s-maxage=30");
  }
}
