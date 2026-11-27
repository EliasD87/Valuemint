/**
 * Applying to create collections: the parts both ends must agree on.
 *
 * Same shape as lib/kolApply.ts. The browser builds the message, the wallet
 * signs it, and /api/creator-apply rebuilds it from the fields it received and
 * checks the signature against that, so the text is defined once, here.
 *
 * Approval is not automatic: the owner reads the applications
 * (scripts/creator-applications.mjs) and adds the wallets they accept to
 * config/creators.ts.
 */

export { normaliseHandle } from "@/lib/kolApply";

/** The table the applications go into (web/supabase/schema.sql). */
export const CREATOR_APPLY_TABLE = "creator_applications";

/** How long a signed application stays valid before it must be signed again. */
export const CREATOR_APPLY_FRESHNESS_MS = 10 * 60 * 1000;

export const NAME_MAX = 60;
export const ABOUT_MAX = 500;
export const LINK_MAX = 200;

/** Trimmed, with runs of whitespace collapsed, so both ends sign the same text. */
export function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** A link to the applicant's work: http(s) only, or `undefined` when it is not one. */
export function normaliseLink(raw: string): string | undefined {
  const s = raw.trim();
  if (s === "") return undefined;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!url.hostname.includes(".")) return undefined;
    return withScheme.length <= LINK_MAX ? withScheme : undefined;
  } catch {
    return undefined;
  }
}

export interface CreatorApplication {
  wallet: string;
  handle: string;
  collection: string;
  about: string;
  /** Empty when none was given. */
  link: string;
  issuedAt: string;
}

/** Exactly what the applicant's wallet signs. Free to sign; it sends nothing. */
export function creatorApplyMessage(a: CreatorApplication): string {
  return [
    "Apply to create collections on ValueMint",
    "",
    `Wallet: ${a.wallet}`,
    `X: @${a.handle}`,
    `Collection: ${a.collection}`,
    `About: ${a.about}`,
    `Link: ${a.link === "" ? "none" : a.link}`,
    `Issued: ${a.issuedAt}`,
    "",
    "Signing is free and sends nothing from your wallet.",
  ].join("\n");
}
