import type { AbiEvent, PublicClient } from "viem";

/**
 * How far behind the head to stop reading.
 *
 * `scanLogs` used to take its watermark from `eth_blockNumber` and commit it,
 * which assumed two things that are not true. The head can be reorganised away,
 * and — more likely here — the transport is a two-endpoint `fallback` whose
 * members are documented as being "within one block of each other", so the head
 * can be read from one endpoint and the logs served by the other. Either way the
 * newest block's logs go missing **permanently for the life of the page**,
 * because the watermark has already moved past them and nothing ever re-reads a
 * committed range.
 *
 * Six blocks is ~12 seconds on a 2-second chain. The cost is that a brand-new
 * listing takes one extra poll to appear; the alternative is silently losing it.
 */
export const CONFIRMATIONS = 6n;

/**
 * How many blocks to ask for at once.
 *
 * Most public RPCs cap `eth_getLogs` by range, by result count, or by both, and
 * they disagree about the limit — and, as this project has now learned twice,
 * the same endpoint disagrees with itself over time.
 *
 * History, all measured against both ValueChain endpoints rather than guessed:
 *
 *   originally      5,000  chosen to be inside every common cap. A full scan of
 *                          the marketplace was 134 requests and 41s, which is
 *                          why a token page could show "No offers yet" over a
 *                          live offer for half a minute.
 *   2026-09-13    100,000  the primary accepted 600,000 blocks in 354ms, so the
 *                          cap looked generous and this was raised to suit.
 *   2026-09-16     20,000  it does not any more. Both endpoints now take 30,000
 *                          and refuse 35,000. At 100,000 every chunk was
 *                          refused, halved four times and retried: 54 requests
 *                          for a full scan, **27 of them failures**.
 *
 * Re-measured 2026-09-16 by binary search against both endpoints: the largest
 * accepted range is ~29,793 blocks. 20,000 sits inside that with 1.5x headroom.
 *
 * Cost, measured the same day over 673,876 blocks (~16 days of ValueChain):
 * 34 requests, 8 in flight, 2.9s — about 86ms per request amortised. The same
 * scan run strictly sequentially took ~23s, which is what the fan-out below
 * removes.
 *
 * The number matters less than `ceiling` below, which is what stops the next
 * change of theirs from costing a failure on every chunk again.
 */
export const CHUNK = 20_000n;

/** Below this a range is not worth splitting further — the endpoint is refusing for another reason. */
const MIN_CHUNK = 250n;

/**
 * The largest range this endpoint has actually accepted, learned at runtime.
 *
 * Without this, halving on failure and doubling on success oscillate against
 * each other forever: the scan drops to a size that works, immediately doubles
 * back to the size that just failed, fails again, halves again. That is exactly
 * what shipped on 2026-09-13 — half of every scan's requests were failures
 * whose only purpose was to rediscover a limit the previous chunk had already
 * found.
 *
 * It is module scope on purpose: every scan on the page shares what any one of
 * them learned.
 */
let ceiling = CHUNK;

/**
 * The narrowest width this endpoint has actually refused, if any.
 *
 * Lowering `ceiling` used to be permanent for the life of the page. That is the
 * right call against an endpoint that has genuinely tightened its cap and the
 * wrong one against a transient refusal — and the two look identical at the
 * moment they happen. The consequence was that **an attacker had a lever on
 * it**: result-count refusals are driven by log density, `validate(Order[])`
 * takes an array, so a dense stretch could drop a visitor's session toward the
 * 156-block floor and leave it there for as long as the tab stayed open.
 *
 * The fix is to let the ceiling recover, but never to re-probe a width the
 * endpoint has already said no to. Recovery is bounded strictly below
 * `knownBad`, so an endpoint with a real cap is never tested against it twice —
 * which is the invariant the original design was protecting, and which
 * `logScan.test.ts` asserts — while a session that narrowed transiently still
 * climbs back toward the widest width that has actually worked.
 *
 * What this does NOT fix: a cascade where every width down to the floor is
 * refused, because then `knownBad` is small too. That needs per-range narrowing
 * rather than a per-session ceiling, since the dense range is the problem and
 * not the endpoint. Recorded as a known limit rather than papered over.
 */
let knownBad: bigint | undefined;

/** Consecutive clean requests at the current width. */
let streak = 0;
const WIDEN_AFTER = 16;

/**
 * Has `ceiling` actually been accepted by this endpoint yet?
 *
 * This gates fanning out, and it is the whole reason discovery stays cheap.
 * Eight parallel requests at a width the endpoint refuses is eight failures
 * instead of one — it would multiply the cost of finding the limit by the
 * concurrency, every time the cap moves. So the first request of a session goes
 * out alone; only once a width has come back does the scan widen to a wave.
 *
 * Reset to false whenever an entire wave fails, which is what a cap tightening
 * under us looks like. The scan then returns to probing one at a time.
 */
let proven = false;

/**
 * How many ranges to request at once, once a width is known good.
 *
 * The scan used to be strictly sequential, so its cost grew with the age of the
 * chain: at ValueChain's ~41,700 blocks a day and 20,000 blocks a request, three
 * months of history is ~188 round trips one after another, about 38 seconds
 * before a first-time visitor sees a market. Eight at a time turns that into ~24
 * waves. Combined with the floor in lib/seaport.ts, the order book scan is
 * bounded rather than growing.
 *
 * Eight rather than more because these are somebody else's public endpoints and
 * every visitor runs this. The limit that bites next is theirs, not ours.
 */
const CONCURRENCY = 8;

interface Cached {
  /** Highest block already scanned, inclusive. */
  through: bigint;
  logs: unknown[];
}

/**
 * Everything already scanned, per query, for the life of the page.
 *
 * This is what turns the scan from O(chain) into O(new blocks). The previous
 * implementation asked for `fromBlock: <fixed>, toBlock: "latest"` on every
 * poll, so the range grew forever and the same millions of blocks were re-read
 * every thirty seconds. That does not degrade gradually — it works until the
 * range crosses the endpoint's cap, and then the feed is simply empty.
 */
const cache = new Map<string, Cached>();

/**
 * Scans currently in flight, keyed identically to the cache.
 *
 * Without this, two callers of the same query both miss the cache and both walk
 * the range. On a cold load `useSeaportOrders` and `useActivity` start their
 * `OrderValidated` scans simultaneously, so that range was fetched twice — and
 * worse, once a cache entry existed both appended into the **same array
 * object**, so a second concurrent scan could duplicate every log it read.
 * `useSeaportOrders` dedupes by order hash and survived that; `useActivity`
 * does not dedupe and would have rendered each row twice.
 *
 * Sharing the promise fixes both at once: one walk, one array, both callers get
 * the same result.
 */
const inFlight = new Map<string, Promise<Array<{ args: unknown; blockNumber: bigint }>>>();

function keyOf(params: ScanParams): string {
  return JSON.stringify({
    a: params.address,
    // The full signature, not `event.name`. Two different events with the same
    // name on one address would otherwise share a cache entry and serve each
    // other's logs. Nothing in this app does that today; it costs nothing to
    // make impossible.
    e: signatureOf(params.event),
    g: params.args ?? null,
    f: params.fromBlock.toString(),
  });
}

/** `Transfer(address,address,uint256)` — enough to tell two same-named events apart. */
function signatureOf(event: AbiEvent): string {
  const inputs = (event.inputs ?? []).map((i) => i.type).join(",");
  return `${event.name}(${inputs})`;
}

export interface ScanParams {
  address: `0x${string}`;
  event: AbiEvent;
  args?: Record<string, unknown>;
  fromBlock: bigint;
}

/**
 * Fetch logs in bounded chunks, remembering what has already been read.
 *
 * The first call for a query walks the whole range once. Every call after it
 * asks only for blocks mined since — which on a 2-second chain is a few hundred
 * at most, however old the contract gets.
 *
 * Concurrent callers of the same query share one walk; see `inFlight`.
 */
export async function scanLogs(
  client: PublicClient,
  params: ScanParams,
): Promise<Array<{ args: unknown; blockNumber: bigint }>> {
  const key = keyOf(params);

  const running = inFlight.get(key);
  if (running !== undefined) return running;

  const walk = scanUncoalesced(client, params, key).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, walk);
  return walk;
}

async function scanUncoalesced(
  client: PublicClient,
  params: ScanParams,
  key: string,
): Promise<Array<{ args: unknown; blockNumber: bigint }>> {
  const head = await client.getBlockNumber();

  /**
   * Stop short of the head. A range that ends at `head` can be served by an
   * endpoint that has not seen `head` yet, and the watermark would then commit
   * over blocks nobody read. `head` below `CONFIRMATIONS` (a fresh chain, or a
   * test) means there is nothing settled to read yet.
   */
  const latest = head > CONFIRMATIONS ? head - CONFIRMATIONS : 0n;

  const entry = cache.get(key);

  let cursor = entry === undefined ? params.fromBlock : entry.through + 1n;

  /**
   * A copy, not the cached array.
   *
   * `collected` used to be a reference to `entry.logs`, so anything appended
   * during a failed or concurrent walk mutated the cache in place — leaving
   * duplicated or partially-committed logs behind a watermark that had not
   * moved. The cache is now only ever replaced wholesale, at a point where the
   * watermark and the contents agree.
   */
  const collected: unknown[] = entry === undefined ? [] : [...entry.logs];

  // Nothing new. Costs one `eth_blockNumber` instead of a full rescan.
  if (cursor > latest) {
    return collected as Array<{ args: unknown; blockNumber: bigint }>;
  }

  const fetchRange = (from: bigint, to: bigint) =>
    client.getLogs({
      address: params.address,
      event: params.event,
      args: params.args as never,
      fromBlock: from,
      toBlock: to,
    });

  /**
   * Narrow after a refusal, and remember it for the rest of the session.
   *
   * Returns false once the range is so small that the endpoint is clearly
   * refusing for some other reason and halving again would just loop.
   */
  const narrow = (): boolean => {
    streak = 0;
    // Remember the width that was refused, so recovery never tries it again.
    if (knownBad === undefined || ceiling < knownBad) knownBad = ceiling;
    if (ceiling <= MIN_CHUNK) return false;
    ceiling = ceiling / 2n;
    proven = false;
    return true;
  };

  /**
   * Count clean requests, and widen once a width has clearly held.
   *
   * The doubled width must stay strictly below anything already refused, so an
   * endpoint with a genuine cap is probed for it exactly once per session.
   */
  const succeeded = (requests: number): void => {
    streak += requests;
    if (streak < WIDEN_AFTER || ceiling >= CHUNK) return;

    const wider = ceiling * 2n > CHUNK ? CHUNK : ceiling * 2n;
    if (knownBad !== undefined && wider >= knownBad) return;

    ceiling = wider;
    streak = 0;
    // Re-prove the new width one request at a time rather than fanning out
    // eight requests at a size that has not been accepted yet.
    proven = false;
  };

  while (cursor <= latest) {
    /**
     * Probe first. Until a width has actually come back from this endpoint, go
     * one request at a time — a wave at a refused width costs eight failures
     * to learn what one teaches.
     */
    if (!proven) {
      const to = cursor + ceiling - 1n > latest ? latest : cursor + ceiling - 1n;
      try {
        collected.push(...(await fetchRange(cursor, to)));
        cursor = to + 1n;
        proven = true;
        succeeded(1);
      } catch (err) {
        if (narrow()) continue;
        /**
         * Persist what was read before giving up. A partial feed is worth more
         * than none, and the next poll resumes from here rather than starting
         * over.
         */
        cache.set(key, { through: cursor - 1n, logs: collected });
        throw err;
      }
      continue;
    }

    // A width that works is known. Fan out.
    const ranges: Array<[bigint, bigint]> = [];
    for (let from = cursor; from <= latest && ranges.length < CONCURRENCY; from += ceiling) {
      ranges.push([from, from + ceiling - 1n > latest ? latest : from + ceiling - 1n]);
    }

    const results = await Promise.allSettled(ranges.map(([from, to]) => fetchRange(from, to)));

    /**
     * Only the unbroken run from the start of the wave can be committed.
     *
     * The cache holds a single watermark — "everything up to here has been
     * read" — so a gap in the middle cannot be recorded. Accepting ranges past
     * a failure would advance that watermark over blocks nobody fetched, and
     * those logs would be missing for the life of the page with nothing to say
     * so. Anything after the first failure is simply re-requested next loop.
     */
    let advanced = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status !== "fulfilled") break;
      collected.push(...result.value);
      cursor = ranges[i]![1] + 1n;
      advanced += 1;
    }

    if (advanced > 0) {
      // A partial failure still means this width is now suspect. Narrow, but
      // keep the ground already gained.
      if (results.some((r) => r.status === "rejected")) narrow();
      else succeeded(advanced);
      continue;
    }

    // The whole wave failed: the endpoint has tightened under us.
    const failure = results.find((r) => r.status === "rejected");
    if (narrow()) continue;
    cache.set(key, { through: cursor - 1n, logs: collected });
    throw failure !== undefined && failure.status === "rejected"
      ? failure.reason
      : new Error("eth_getLogs failed");
  }

  cache.set(key, { through: latest, logs: collected });
  return collected as Array<{ args: unknown; blockNumber: bigint }>;
}

/**
 * Drop cached ranges — used after an action that should show up immediately.
 *
 * The learned ceiling goes with them. It is an observation about an endpoint,
 * not about a query, but it is module state either way, and a test that leaves
 * it lowered would silently change the next test's behaviour.
 */
export function resetLogCache(): void {
  cache.clear();
  inFlight.clear();
  ceiling = CHUNK;
  knownBad = undefined;
  streak = 0;
  proven = false;
}
