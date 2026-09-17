import "server-only";
import { limiter } from "@/lib/rateLimit";
import {
  createPublicClient,
  fallback,
  http,
  formatEther,
  getAddress,
  isAddress,
  recoverMessageAddress,
} from "viem";
import { RPC_HTTP, valuechain } from "@/config/chain";
import { CLAIM_HEADERS, contentDigest, uploadMessage } from "@/lib/uploadClaim";

/**
 * Who is allowed to spend the pinning account.
 *
 * /api/pin writes to a paid Pinata account using a credential only this server
 * holds. Without a gate, anyone who knows the URL can loop the endpoint and
 * burn the whole storage allowance on content that then cannot easily be
 * un-pinned. Request-size caps do not help: they bound one request, not the
 * number of requests.
 *
 * Three things have to be true before a byte is pinned:
 *
 *   1. The caller controls a wallet.       - signature, recovered here
 *   2. That wallet has something to lose.  - on-chain balance floor
 *   3. They have not just done this.       - rate limit, in the route
 *
 * (1) alone is close to worthless, because generating wallets is free. (2) is
 * what actually costs an attacker money: every throwaway address needs funding
 * on a chain where SOSO has to be bridged or bought. It costs a real creator
 * nothing, since a collection cannot be deployed without gas in the first
 * place.
 */

/**
 * How much SOSO the signer must hold.
 *
 * Deploying a collection costs on the order of 0.00003 SOSO at this chain's
 * gas price, so this floor is ~30x what a genuine creator must already have,
 * and is about funding an address at all rather than the amount. Override with
 * PIN_MIN_BALANCE_SOSO if abuse patterns change.
 */
const MIN_BALANCE_WEI = (() => {
  const raw = process.env.PIN_MIN_BALANCE_SOSO;
  if (raw === undefined || raw.trim() === "") return 1_000_000_000_000_000n; // 0.001 SOSO
  try {
    const [whole, frac = ""] = raw.trim().split(".");
    return BigInt(whole || "0") * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
  } catch {
    return 1_000_000_000_000_000n;
  }
})();

/** How long a signature stays valid. Long enough to pick files, short enough to matter. */
const FRESHNESS_MS = 5 * 60 * 1000;

/**
 * Fallback here too. This client decides whether an uploader holds enough SOSO
 * to be allowed to pin, so one unreachable endpoint would not merely slow
 * creation down - it would refuse every upload on the site.
 */
const client = createPublicClient({
  chain: valuechain,
  transport: fallback(
    RPC_HTTP.map((url) => http(url, { timeout: 12_000 })),
    { rank: false },
  ),
});

/**
 * Signatures already spent — in the shared store, not in this lambda's memory.
 *
 * Freshness alone leaves a five-minute window in which a captured signature can
 * be replayed against the identical upload. This closes it.
 *
 * It used to be a module-level `Map`, which is exactly the failure already
 * measured, documented and fixed one file over for the rate limiter: on Vercel
 * every instance has its own memory, so "already spent" meant "already spent
 * *here*", and any instance that had not seen the signature would accept it.
 * The same reasoning was available and the same conclusion was not drawn.
 *
 * `limiter.take(key, 1, window)` is exactly a burn: the first caller is allowed,
 * everyone else inside the window is not. Reusing it means no new
 * infrastructure, and it inherits the limiter's own degraded fallback to memory
 * when Redis is unreachable — available rather than perfectly strict, which for
 * a replay guard behind a signature check is the right way round.
 */
async function burn(signature: string): Promise<boolean> {
  const decision = await limiter.take(`upload-sig:${signature.toLowerCase()}`, 1, FRESHNESS_MS);
  return decision.ok;
}

export { CLAIM_HEADERS };

export interface Claim {
  address: string;
  signature: string;
  issuedAt: string;
}

/**
 * Everything that can be judged from headers alone.
 *
 * Kept separate from `authoriseUpload` so the route can reject an unsigned or
 * stale request *before* parsing the body. Buffering 60 MB of multipart for a
 * caller who never presented a signature is itself the denial-of-service worth
 * avoiding.
 */
export function precheckClaim(request: Request): { ok: true; claim: Claim } | { ok: false; status: number; error: string } {
  const address = request.headers.get(CLAIM_HEADERS.address);
  const signature = request.headers.get(CLAIM_HEADERS.signature);
  const issuedAt = request.headers.get(CLAIM_HEADERS.issuedAt);

  if (address === null || signature === null || issuedAt === null) {
    return { ok: false, status: 401, error: "This upload was not signed. Connect your wallet and try again." };
  }
  if (!isAddress(address)) {
    return { ok: false, status: 400, error: "That is not a valid wallet address." };
  }
  if (!/^0x[0-9a-fA-F]{130,}$/.test(signature)) {
    return { ok: false, status: 400, error: "That signature is malformed." };
  }

  const issued = Date.parse(issuedAt);
  if (Number.isNaN(issued)) {
    return { ok: false, status: 400, error: "That signature has no valid timestamp." };
  }
  const drift = Date.now() - issued;
  if (drift > FRESHNESS_MS) {
    return { ok: false, status: 401, error: "That signature has expired. Try the upload again." };
  }
  if (drift < -60_000) {
    return { ok: false, status: 401, error: "That signature is timestamped in the future. Check your clock." };
  }

  return { ok: true, claim: { address, signature, issuedAt } };
}

export type AuthResult =
  | { ok: true; address: `0x${string}` }
  | { ok: false; status: number; error: string };

export async function authoriseUpload(input: {
  address: string | null;
  signature: string | null;
  issuedAt: string | null;
  collectionName: string;
  configJson: string;
  /** Name plus a SHA-256 of the file's actual bytes. */
  files: Array<{ name: string; hash: string }>;
}): Promise<AuthResult> {
  const { address, signature, issuedAt } = input;

  if (address === null || signature === null || issuedAt === null) {
    return { ok: false, status: 401, error: "This upload was not signed. Reconnect your wallet and try again." };
  }
  if (!isAddress(address)) {
    return { ok: false, status: 400, error: "That is not a valid wallet address." };
  }
  if (!/^0x[0-9a-fA-F]+$/.test(signature) || signature.length < 130) {
    return { ok: false, status: 400, error: "That signature is malformed." };
  }

  // --- freshness ------------------------------------------------------------
  const issued = Date.parse(issuedAt);
  if (Number.isNaN(issued)) {
    return { ok: false, status: 400, error: "That signature has no valid timestamp." };
  }
  const drift = Date.now() - issued;
  if (drift > FRESHNESS_MS) {
    return { ok: false, status: 401, error: "That signature has expired. Try the upload again." };
  }
  // A signature from the future means a wrong clock or a forged timestamp
  // reaching for a longer life; a small allowance covers honest clock skew.
  if (drift < -60_000) {
    return { ok: false, status: 401, error: "That signature is timestamped in the future. Check your clock." };
  }

  // --- the signature covers exactly these files -----------------------------
  const digest = await contentDigest(input.configJson, input.files);
  const message = uploadMessage({
    address: getAddress(address),
    collectionName: input.collectionName,
    issuedAt,
    digest,
  });

  let recovered: `0x${string}`;
  try {
    recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
  } catch {
    return { ok: false, status: 401, error: "That signature could not be read." };
  }

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    // Either the signer is not who they claim, or the upload was altered after
    // signing - the digest is part of the message, so both look the same here.
    return { ok: false, status: 401, error: "That signature does not match this upload." };
  }

  // --- stake ----------------------------------------------------------------
  let balance: bigint;
  try {
    balance = await client.getBalance({ address: getAddress(address) });
  } catch {
    // Fail closed. An unreachable RPC must not become a way to skip the check.
    return {
      ok: false,
      status: 503,
      error: "Could not reach ValueChain to verify your wallet just now. Try again in a moment.",
    };
  }

  if (balance < MIN_BALANCE_WEI) {
    return {
      ok: false,
      status: 403,
      error:
        `This wallet needs at least ${formatEther(MIN_BALANCE_WEI)} SOSO to upload artwork. ` +
        `You will need SOSO for gas to deploy the collection anyway.`,
    };
  }

  /**
   * Burned last, once every other check has passed.
   *
   * This used to run before the on-chain balance read, which meant a transient
   * RPC failure — a 503 the caller had nothing to do with — consumed their
   * one-time signature. They could not retry without signing again, and the
   * error said only that the chain was unreachable, so the second attempt
   * failed as "already used" and looked like a different bug entirely.
   *
   * Burning last narrows the window where a signature is spent without an
   * upload happening to the pinning step itself, which is the part that
   * actually costs something.
   */
  if (!(await burn(signature))) {
    return { ok: false, status: 401, error: "That signature has already been used." };
  }

  return { ok: true, address: getAddress(address) };
}
