import { NextResponse } from "next/server";
import { getAddress, isAddress, recoverMessageAddress } from "viem";
import { APPLY_FRESHNESS_MS, APPLY_TABLE, applyMessage, normaliseHandle } from "@/lib/kolApply";
import { callerKey, limiter } from "@/lib/rateLimit";
import { indexConfigured, SupabaseError, upsert } from "@/lib/supabase";

/**
 * Applications to join the KOL collection.
 *
 * Each one is signed by the wallet it names, so the wallet on file is one the
 * applicant actually controls: no typos, no someone else's address. One row per
 * wallet; applying again from the same wallet updates the handle rather than
 * adding a second row. The X handle itself cannot be proven here, which is why
 * the owner reviews every application before anyone is added.
 *
 * Stored in the site's Supabase project, the table created by
 * supabase/schema.sql; only this server can write it (row level security on,
 * no policies, service key server-side only).
 */

const HOUR = 60 * 60 * 1000;
/**
 * Per connection, generous on purpose. People share addresses: a mobile
 * carrier, an office, an event's Wi-Fi. At 8 the owner's own testing locked the
 * form for an hour. The per-wallet limit below is what stops one applicant
 * repeating themselves; this one only stops a flood.
 */
const PER_CALLER_PER_HOUR = 30;
const PER_WALLET_PER_HOUR = 4;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  if (!indexConfigured()) return bad("Applications are not open just now. Try again later.", 503);

  const caller = await limiter.take(`kol-apply:${callerKey(request)}`, PER_CALLER_PER_HOUR, HOUR);
  if (!caller.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again a little later." },
      { status: 429, headers: { "Retry-After": String(caller.retryAfter) } },
    );
  }

  let body: { wallet?: unknown; handle?: unknown; issuedAt?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("Expected JSON.");
  }

  const { wallet, issuedAt, signature } = body;
  if (typeof wallet !== "string" || !isAddress(wallet)) return bad("That is not a valid wallet address.");
  const handle = typeof body.handle === "string" ? normaliseHandle(body.handle) : undefined;
  if (handle === undefined) return bad("That is not a valid X handle.");
  if (typeof issuedAt !== "string" || Number.isNaN(Date.parse(issuedAt))) return bad("The application has no valid time.");
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130,}$/.test(signature)) return bad("That signature is malformed.");

  const drift = Date.now() - Date.parse(issuedAt);
  if (drift > APPLY_FRESHNESS_MS) return bad("That signature has expired. Apply again.", 401);
  if (drift < -60_000) return bad("That signature is timestamped in the future. Check your clock.", 401);

  const address = getAddress(wallet);
  let signer: string;
  try {
    signer = await recoverMessageAddress({
      message: applyMessage({ wallet: address, handle, issuedAt }),
      signature: signature as `0x${string}`,
    });
  } catch {
    return bad("That signature could not be read.", 401);
  }
  if (signer.toLowerCase() !== address.toLowerCase()) {
    return bad("That signature was not made by this wallet.", 401);
  }

  const perWallet = await limiter.take(`kol-apply:${address.toLowerCase()}`, PER_WALLET_PER_HOUR, HOUR);
  if (!perWallet.ok) {
    return NextResponse.json(
      { error: "This wallet has applied several times already. Try again later." },
      { status: 429, headers: { "Retry-After": String(perWallet.retryAfter) } },
    );
  }

  try {
    await upsert(
      APPLY_TABLE,
      [
        {
          wallet: address.toLowerCase(),
          x_handle: handle,
          signed_at: issuedAt,
          signature,
          updated_at: new Date().toISOString(),
        },
      ],
      "wallet",
    );
  } catch (e) {
    console.error("[kol-apply]", e instanceof SupabaseError ? `${e.status} ${e.detail}` : e);
    return bad("Could not save your application just now. Try again in a moment.", 503);
  }

  return NextResponse.json({ ok: true, handle });
}
