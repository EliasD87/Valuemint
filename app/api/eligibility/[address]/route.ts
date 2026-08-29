import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { TIERS, tierFor, nextTier } from "@/config/tiers";
import { callerKey, limiter } from "@/lib/rateLimit";

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
 * not a claim authorisation — that needs a signature over the address and tier,
 * which is added with the claim contract.
 */

const SODEX =
  process.env.SODEX_LEADERBOARD_URL ?? "https://net-data.sodex.dev/api/v1/leaderboard/rank";

/** Per caller, per hour. Generous for a person, tight for a scraper. */
const PER_CALLER_PER_HOUR = 120;
const HOUR = 60 * 60 * 1000;

/**
 * SoDEX publishes a `snapshot_ts`, so the figures move in steps rather than
 * continuously. Caching for a few minutes spares their API a request per page
 * view without ever showing a stale tier for long.
 */
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; body: unknown }>();

interface SodexResponse {
  data?: {
    found?: boolean;
    snapshot_ts?: number;
    item?: {
      wallet_address?: string;
      account_id?: number;
      pnl_usd?: string;
      volume_usd?: string;
      rank?: number;
    };
  };
}

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

  const key = wallet.toLowerCase();
  const hit = cache.get(key);
  if (hit !== undefined && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json(hit.body);
  }

  let payload: SodexResponse;
  try {
    const url = `${SODEX}?window_type=ALL_TIME&sort_by=volume&wallet_address=${wallet}`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`SoDEX returned ${res.status}`);
    payload = (await res.json()) as SodexResponse;
  } catch (error) {
    // Fail loudly rather than quietly reporting "no volume". Telling a genuine
    // trader they have never traded, because a lookup timed out, is worse than
    // telling them the check is temporarily down.
    return NextResponse.json(
      {
        error: "Could not reach SoDEX to check this wallet. Try again in a moment.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }

  const item = payload.data?.item;
  const volumeUsd = Number(item?.volume_usd ?? "0");
  const found = payload.data?.found === true && Number.isFinite(volumeUsd) && volumeUsd > 0;

  const tier = found ? tierFor(volumeUsd) : undefined;
  const next = nextTier(tier);

  const body = {
    address: wallet,
    found,
    volumeUsd: found ? volumeUsd : 0,
    pnlUsd: found ? Number(item?.pnl_usd ?? "0") : 0,
    rank: found ? (item?.rank ?? null) : null,
    accountId: found ? (item?.account_id ?? null) : null,
    snapshotAt: payload.data?.snapshot_ts ?? null,
    tier: tier === undefined ? null : { n: tier.n, name: tier.name, min: tier.min },
    next:
      next === undefined
        ? null
        : { n: next.n, name: next.name, min: next.min, needed: Math.max(next.min - volumeUsd, 0) },
    tiers: TIERS.map((t) => ({ n: t.n, name: t.name, min: t.min })),
  };

  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
