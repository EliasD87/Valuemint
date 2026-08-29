import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { TIERS, tierFor, nextTier } from "@/config/tiers";
import { callerKey, limiter } from "@/lib/rateLimit";
import { sodexStanding, SodexUnreachable } from "@/lib/sodex";

/**
 * A wallet's SoDEX standing, and the tier it earns.
 *
 * Server-side on purpose, for two reasons — the second matters far more than
 * the first.
 *
 *   1. SoDEX almost certainly does not send CORS headers for a browser origin.
 *   2. If the browser asked SoDEX directly and then told our contract which
 *      tier it had earned, anyone could claim Leviathan by editing one line of
 *      JavaScript. Eligibility has to be decided somewhere the claimant cannot
 *      reach, and later signed, so the contract can verify it came from us.
 *
 * This route only *reports* the tier. Nothing here mints, and the response is
 * not a claim authorisation — that is `/api/trenches/authorise`, which signs
 * the same figure this route displays.
 */

/** Per caller, per hour. Generous for a person, tight for a scraper. */
const PER_CALLER_PER_HOUR = 120;
const HOUR = 60 * 60 * 1000;

export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "That is not a valid wallet address." }, { status: 400 });
  }
  const wallet = getAddress(address);

  const gate = await limiter.take(`eligibility:${callerKey(request)}`, PER_CALLER_PER_HOUR, HOUR);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many checks from here. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  let standing;
  try {
    standing = await sodexStanding(wallet);
  } catch (error) {
    // Fail loudly rather than quietly reporting "no volume".
    return NextResponse.json(
      {
        error: "Could not reach SoDEX to check this wallet. Try again in a moment.",
        detail: error instanceof SodexUnreachable ? error.message : "unknown",
      },
      { status: 503 },
    );
  }

  const tier = standing.found ? tierFor(standing.volumeUsd) : undefined;
  const next = nextTier(tier);

  return NextResponse.json({
    address: wallet,
    found: standing.found,
    volumeUsd: standing.volumeUsd,
    pnlUsd: standing.pnlUsd,
    rank: standing.rank,
    accountId: standing.accountId,
    snapshotAt: standing.snapshotAt,
    tier: tier === undefined ? null : { n: tier.n, name: tier.name, min: tier.min },
    next:
      next === undefined
        ? null
        : {
            n: next.n,
            name: next.name,
            min: next.min,
            needed: Math.max(next.min - standing.volumeUsd, 0),
          },
    tiers: TIERS.map((t) => ({ n: t.n, name: t.name, min: t.min })),
  });
}
