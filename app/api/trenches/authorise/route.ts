import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { tierFor } from "@/config/tiers";
import { callerKey, limiter } from "@/lib/rateLimit";
import { sodexStanding, SodexUnreachable } from "@/lib/sodex";
import { signClaim, signerConfigured } from "@/lib/trenchesSigner";

/**
 * Issues the signature that lets a wallet claim its depths.
 *
 * This is the only privileged endpoint in the Trenches feature: whatever it
 * signs, the contract mints. So the eligibility figure is re-read from SoDEX
 * *here*, and never taken from the request. A body that could name its own tier
 * would be a free Leviathan for anyone who could type curl.
 *
 * Note what is deliberately *not* checked: whether the wallet has already
 * claimed. That is the contract's job — `claimed[wallet][tier]` is the only
 * record that cannot be raced or replayed — and duplicating it here would add a
 * second source of truth that could disagree with the chain.
 *
 * The address is taken from the path rather than a signed message, which is
 * safe because the signature this returns is bound to that address: obtaining
 * someone else's authorisation gains nothing, since only they can spend it.
 */

/**
 * Tighter than the eligibility check, which is a read. Each call here costs a
 * SoDEX lookup and an ECDSA signature, and no honest claimant needs many.
 */
const PER_CALLER_PER_HOUR = 30;
const HOUR = 60 * 60 * 1000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const address = (body as { address?: unknown } | null)?.address;
  if (typeof address !== "string" || !isAddress(address)) {
    return NextResponse.json({ error: "That is not a valid wallet address." }, { status: 400 });
  }
  const wallet = getAddress(address);

  if (!signerConfigured()) {
    return NextResponse.json(
      { error: "Claiming has not opened yet." },
      { status: 503 },
    );
  }

  const gate = await limiter.take(`authorise:${callerKey(request)}`, PER_CALLER_PER_HOUR, HOUR);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many requests from here. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  let standing;
  try {
    standing = await sodexStanding(wallet);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not reach SoDEX to check this wallet. Try again in a moment.",
        detail: error instanceof SodexUnreachable ? error.message : "unknown",
      },
      { status: 503 },
    );
  }

  const tier = standing.found ? tierFor(standing.volumeUsd) : undefined;
  if (tier === undefined) {
    return NextResponse.json(
      { error: "This wallet has no SoDEX trading volume, so there is nothing to claim yet." },
      { status: 403 },
    );
  }

  let authorisation;
  try {
    authorisation = await signClaim(wallet, tier.n);
  } catch {
    // The message would name the missing environment variable. That is a
    // deployment detail, not something a caller should be told.
    return NextResponse.json({ error: "Claiming is not available right now." }, { status: 503 });
  }

  return NextResponse.json(
    {
      wallet: authorisation.wallet,
      maxTier: authorisation.maxTier,
      deadline: authorisation.deadline,
      signature: authorisation.signature,
      volumeUsd: standing.volumeUsd,
      tier: { n: tier.n, name: tier.name },
    },
    // A signature is issued for one wallet at one moment; nothing may cache it.
    { headers: { "Cache-Control": "no-store" } },
  );
}
