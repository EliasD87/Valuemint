import "server-only";

/**
 * The SoDEX leaderboard lookup, shared by the two routes that need it.
 *
 * `/api/eligibility` reports a tier; `/api/trenches/authorise` signs for one.
 * They must agree, and the only way to guarantee that is for both to read the
 * volume through here. A second copy of this logic that drifted by one
 * threshold would let the UI promise a tier the signature then refused.
 */

/**
 * The host is `mainnet-data`, not `net-data` — the short form is NXDOMAIN, and
 * that typo made every check fail with "could not reach SoDEX" for a while.
 */
const SODEX =
  process.env.SODEX_LEADERBOARD_URL ??
  "https://mainnet-data.sodex.dev/api/v1/leaderboard/rank";

/**
 * SoDEX publishes a `snapshot_ts`, so the figures move in steps rather than
 * continuously. Caching for a few minutes spares their API a request per page
 * view without ever showing a stale tier for long.
 */
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: SodexStanding }>();

interface SodexResponse {
  /** 0 on success. A non-zero code arrives with HTTP 200, so `res.ok` is not enough. */
  code?: number;
  message?: string;
  data?: {
    found?: boolean;
    /** Epoch **milliseconds**, not seconds. */
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

export interface SodexStanding {
  found: boolean;
  volumeUsd: number;
  pnlUsd: number;
  rank: number | null;
  accountId: number | null;
  /** Epoch milliseconds. */
  snapshotAt: number | null;
}

/** Thrown when SoDEX could not be read. Never conflated with "no volume". */
export class SodexUnreachable extends Error {}

/**
 * A wallet's all-time standing.
 *
 * @throws {SodexUnreachable} if the lookup fails for any reason. Callers must
 *         not treat a failure as zero volume — telling a genuine trader they
 *         have never traded, because a request timed out, is worse than telling
 *         them the check is temporarily down.
 */
export async function sodexStanding(wallet: `0x${string}`): Promise<SodexStanding> {
  const key = wallet.toLowerCase();
  const hit = cache.get(key);
  if (hit !== undefined && Date.now() - hit.at < CACHE_TTL) return hit.value;

  let payload: SodexResponse;
  try {
    const url = `${SODEX}?window_type=ALL_TIME&sort_by=volume&wallet_address=${wallet}`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`SoDEX returned ${res.status}`);
    payload = (await res.json()) as SodexResponse;
    // A failed lookup still comes back as HTTP 200 with a non-zero code, so
    // checking the status alone would read an upstream error as "no volume".
    if (payload.code !== undefined && payload.code !== 0) {
      throw new Error(`SoDEX code ${payload.code}${payload.message ? `: ${payload.message}` : ""}`);
    }
  } catch (error) {
    throw new SodexUnreachable(error instanceof Error ? error.message : "unknown");
  }

  const item = payload.data?.item;
  const volumeUsd = Number(item?.volume_usd ?? "0");
  const found = payload.data?.found === true && Number.isFinite(volumeUsd) && volumeUsd > 0;

  const value: SodexStanding = {
    found,
    volumeUsd: found ? volumeUsd : 0,
    pnlUsd: found ? Number(item?.pnl_usd ?? "0") : 0,
    rank: found ? (item?.rank ?? null) : null,
    accountId: found ? (item?.account_id ?? null) : null,
    snapshotAt: payload.data?.snapshot_ts ?? null,
  };

  cache.set(key, { at: Date.now(), value });
  return value;
}
