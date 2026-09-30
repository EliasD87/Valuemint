/**
 * Applying to the KOL collection: the parts both ends must agree on.
 *
 * The browser builds the message, the wallet signs it, and /api/kol-apply
 * rebuilds it from the fields it received and checks the signature against
 * that. So the text is defined once, here, or a harmless-looking copy edit on
 * one side turns every application into "that signature does not match".
 */

/** The table the applications go into (web/supabase/schema.sql). */
export const APPLY_TABLE = "kol_applications";

/** How long a signed application stays valid before it must be signed again. */
export const APPLY_FRESHNESS_MS = 10 * 60 * 1000;

/**
 * An X handle, from whatever the applicant typed: "@name", "name", or a
 * profile link. X handles are 1-15 letters, digits and underscores. Returns
 * the bare handle, or `undefined` when it cannot be one.
 */
export function normaliseHandle(raw: string): string | undefined {
  let s = raw.trim();
  const link = s.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#\s]+)/i);
  if (link?.[1] !== undefined) s = link[1];
  s = s.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : undefined;
}

/** Exactly what the applicant's wallet signs. Free to sign; it sends nothing. */
export function applyMessage(input: { wallet: string; handle: string; issuedAt: string }): string {
  return [
    "Apply to join the ValueMint KOL collection",
    "",
    `Wallet: ${input.wallet}`,
    `X: @${input.handle}`,
    `Issued: ${input.issuedAt}`,
    "",
    "Signing is free and sends nothing from your wallet.",
  ].join("\n");
}
