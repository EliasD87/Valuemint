import "server-only";

import { erc721Abi, type Address } from "viem";
import { KNOWN_COLLECTIONS } from "@/config/known";
import { HIDDEN_COLLECTIONS } from "@/config/hidden";
import { enumerableAbi } from "@/config/erc721";
import { indexClient } from "@/lib/indexSync";
import { select, selectAll } from "@/lib/supabase";

/**
 * Filling the document cache before anybody asks.
 *
 * The read-through cache alone was not the win it looked like. Measured on the
 * live site against 69 Cybereator documents:
 *
 *     straight to SoDEX, from the browser      69 requests    842 ms
 *     through the cache, cold                   1 request   1,850 ms
 *     through the cache, warm                   1 request     589 ms
 *
 * So the first visitor to any set of tokens was paying *more* than before, and
 * only the second onwards got anything. On a collection page that scrolls into
 * ids nobody has loaded yet, that is most visits.
 *
 * Warming turns "cold" into a state that exists once, on a schedule, with
 * nobody waiting — after which every page is the 589 ms row, always.
 *
 * ---
 *
 * **Deduplicate by URL before fetching anything.** It is not a refinement, it
 * is the difference between minutes and seconds: the Treasure Box puts the tier
 * in its URL, so thousands of tokens are four documents. Cybereator gives each
 * token its own, so the same walk costs 2,968. Both are handled by asking which
 * URLs are already stored rather than which tokens are.
 */

/** Token ids read per multicall. Large enough to be few round trips, small enough to land. */
const IDS_PER_CALL = 250;

/**
 * The most token ids to look at in one run.
 *
 * A collection can be any size, and the point of a bound is that a run finishes
 * whether or not the collection does. Progress is kept in the cache itself —
 * a URL already stored is not fetched again — so the next run picks up where
 * this one stopped without a cursor to keep in step.
 */
export const IDS_PER_RUN = 3_000;

export interface WarmTarget {
  address: Address;
  name: string;
}

/** The curated collections, minus anything hidden. */
export function warmTargets(): WarmTarget[] {
  const hidden = new Set(HIDDEN_COLLECTIONS.map((h) => h.address.toLowerCase()));
  return KNOWN_COLLECTIONS.filter((c) => !hidden.has(c.address.toLowerCase())).map((c) => ({
    address: c.address,
    name: c.name,
  }));
}

/**
 * Every distinct `tokenURI` a collection points at, for the ids it holds.
 *
 * Reads ids through `tokenByIndex` where the collection is enumerable and falls
 * back to 1..supply where it is not — the same two shapes the rest of the app
 * already deals with. A revert on either is an answer, not an error: it means
 * that id is not there.
 */
export async function collectionUrls(
  address: Address,
  limit = IDS_PER_RUN,
): Promise<{ urls: string[]; supply: number; scanned: number }> {
  const client = indexClient();

  let supply = 0n;
  try {
    supply = await client.readContract({
      address,
      abi: enumerableAbi,
      functionName: "totalSupply",
    });
  } catch {
    return { urls: [], supply: 0, scanned: 0 };
  }

  const count = supply > BigInt(limit) ? limit : Number(supply);
  if (count === 0) return { urls: [], supply: Number(supply), scanned: 0 };

  /**
   * Ids first, because a collection's ids are not necessarily 1..n. Treasure
   * Box ids run into the tens of thousands over a supply of a few hundred, so
   * guessing them would read mostly reverts.
   */
  const ids: bigint[] = [];
  for (let i = 0; i < count; i += IDS_PER_CALL) {
    const slice = Array.from(
      { length: Math.min(IDS_PER_CALL, count - i) },
      (_, k) => BigInt(i + k),
    );
    const read = await client.multicall({
      contracts: slice.map((index) => ({
        address,
        abi: enumerableAbi,
        functionName: "tokenByIndex" as const,
        args: [index],
      })),
      allowFailure: true,
    });
    for (const r of read) {
      if (r.status === "success") ids.push(r.result as bigint);
    }
  }

  /** Not enumerable. Fall back to the plain range, which is right far more often than not. */
  if (ids.length === 0) {
    for (let i = 1; i <= count; i++) ids.push(BigInt(i));
  }

  const urls = new Set<string>();
  for (let i = 0; i < ids.length; i += IDS_PER_CALL) {
    const slice = ids.slice(i, i + IDS_PER_CALL);
    const read = await client.multicall({
      contracts: slice.map((id) => ({
        address,
        abi: erc721Abi,
        functionName: "tokenURI" as const,
        args: [id],
      })),
      allowFailure: true,
    });
    for (const r of read) {
      if (r.status !== "success") continue;
      const uri = r.result as string;
      if (typeof uri === "string" && uri !== "") urls.add(uri);
    }
  }

  return { urls: [...urls], supply: Number(supply), scanned: ids.length };
}

/**
 * Which of these the cache does not already hold.
 *
 * Asked in slices because the filter travels in a URL and these are long. A URL
 * already stored is skipped whatever its status: a refusal is retried by the
 * read path on its own schedule, and a warm run should not spend its budget
 * hammering a host that just said no.
 */
export async function unknownUrls(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];

  /**
   * One query where the collection shares a URL prefix, which they all do.
   *
   * Asking sixty at a time meant 36 round trips for Cybereator's 2,152, and
   * those round trips — not the fetching — were most of a 29-second run. Every
   * collection here points at one path with the token on the end, so a prefix
   * match asks the same question once.
   */
  const prefix = commonPrefix(urls);

  if (prefix.length >= 20) {
    const held = new Set(
      (
        await selectAll<{ url: string }>(
          `documents?select=url&url=like.${encodeURIComponent(`${prefix}*`)}`,
        )
      ).map((r) => r.url),
    );
    return urls.filter((u) => !held.has(u));
  }

  /** No shared prefix worth using. Ask in slices, but all at once. */
  const CHUNK = 60;
  const slices: string[][] = [];
  for (let i = 0; i < urls.length; i += CHUNK) slices.push(urls.slice(i, i + CHUNK));

  const results = await Promise.all(
    slices.map((slice) =>
      select<{ url: string }>(
        `documents?select=url&url=in.(${encodeURIComponent(
          slice.map((u) => `"${u.replaceAll('"', '\\"')}"`).join(","),
        )})`,
      ),
    ),
  );

  const held = new Set(results.flat().map((r) => r.url));
  return urls.filter((u) => !held.has(u));
}

/** The longest start every one of these shares. */
function commonPrefix(urls: string[]): string {
  const first = urls[0] ?? "";
  let end = first.length;
  for (const u of urls) {
    let i = 0;
    while (i < end && i < u.length && u[i] === first[i]) i++;
    end = i;
    if (end === 0) break;
  }
  return first.slice(0, end);
}
