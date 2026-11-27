import { NextResponse } from "next/server";
import { getAddress, isAddress, recoverMessageAddress } from "viem";
import {
  ABOUT_MAX,
  CREATOR_APPLY_FRESHNESS_MS,
  CREATOR_APPLY_TABLE,
  NAME_MAX,
  cleanText,
  creatorApplyMessage,
  normaliseHandle,
  normaliseLink,
} from "@/lib/creatorApply";
import { callerKey, limiter } from "@/lib/rateLimit";
import { indexConfigured, SupabaseError, upsert } from "@/lib/supabase";

/**
 * Applications to create collections (the form on /create for wallets that
 * are not approved yet).
 *
 * The same pattern as /api/kol-apply: each application is signed by the
 * wallet it names, one row per wallet, and applying again updates the row.
 * Nothing here approves anyone. The owner reviews the table and adds accepted
 * wallets to config/creators.ts.
 */

const HOUR = 60 * 60 * 1000;
const PER_CALLER_PER_HOUR = 30;
const PER_WALLET_PER_HOUR = 4;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  if (!indexConfigured()) return bad("Applications are not open just now. Try again later.", 503);

  const caller = await limiter.take(`creator-apply:${callerKey(request)}`, PER_CALLER_PER_HOUR, HOUR);
  if (!caller.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again a little later." },
      { status: 429, headers: { "Retry-After": String(caller.retryAfter) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad("Expected JSON.");
  }

  const { wallet, issuedAt, signature } = body;
  if (typeof wallet !== "string" || !isAddress(wallet)) return bad("That is not a valid wallet address.");
  const handle = typeof body.handle === "string" ? normaliseHandle(body.handle) : undefined;
  if (handle === undefined) return bad("That is not a valid X handle.");
  const collection = typeof body.collection === "string" ? cleanText(body.collection) : "";
  if (collection === "" || collection.length > NAME_MAX) return bad("Give your collection a name.");
  const about = typeof body.about === "string" ? cleanText(body.about) : "";
  if (about === "" || about.length > ABOUT_MAX) return bad("Tell us about your collection.");
  const rawLink = typeof body.link === "string" ? body.link.trim() : "";
  const link = rawLink === "" ? "" : normaliseLink(rawLink);
  if (link === undefined) return bad("That link is not a web address.");
  if (typeof issuedAt !== "string" || Number.isNaN(Date.parse(issuedAt))) return bad("The application has no valid time.");
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130,}$/.test(signature)) return bad("That signature is malformed.");

  const drift = Date.now() - Date.parse(issuedAt);
  if (drift > CREATOR_APPLY_FRESHNESS_MS) return bad("That signature has expired. Apply again.", 401);
  if (drift < -60_000) return bad("That signature is timestamped in the future. Check your clock.", 401);

  const address = getAddress(wallet);
  let signer: string;
  try {
    signer = await recoverMessageAddress({
      message: creatorApplyMessage({ wallet: address, handle, collection, about, link, issuedAt }),
      signature: signature as `0x${string}`,
    });
  } catch {
    return bad("That signature could not be read.", 401);
  }
  if (signer.toLowerCase() !== address.toLowerCase()) {
    return bad("That signature was not made by this wallet.", 401);
  }

  const perWallet = await limiter.take(`creator-apply:${address.toLowerCase()}`, PER_WALLET_PER_HOUR, HOUR);
  if (!perWallet.ok) {
    return NextResponse.json(
      { error: "This wallet has applied several times already. Try again later." },
      { status: 429, headers: { "Retry-After": String(perWallet.retryAfter) } },
    );
  }

  try {
    await upsert(
      CREATOR_APPLY_TABLE,
      [
        {
          wallet: address.toLowerCase(),
          x_handle: handle,
          collection_name: collection,
          about,
          link: link === "" ? null : link,
          signed_at: issuedAt,
          signature,
          updated_at: new Date().toISOString(),
        },
      ],
      "wallet",
    );
  } catch (e) {
    console.error("[creator-apply]", e instanceof SupabaseError ? `${e.status} ${e.detail}` : e);
    return bad("Could not save your application just now. Try again in a moment.", 503);
  }

  return NextResponse.json({ ok: true, handle });
}
