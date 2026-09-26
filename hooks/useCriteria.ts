"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { boundOfSalt } from "@/lib/criteria";

/**
 * Trait offers' sets, from `/api/criteria` (see lib/traitSets.ts).
 *
 * The site never trusts an offer's own claim about what it covers — an order
 * carries only a Merkle root. These are what turn a root back into "Tier:
 * Legendary", and what tell a holder whether their piece is in the set.
 */

export interface TraitSetSummary {
  traitType: string;
  value: string;
  count: number;
  root: Hex;
  /** On a growing collection, the highest token id the set covers. */
  bound?: string;
}

export interface Membership {
  traitType: string;
  value: string;
  root: Hex;
  proof: Hex[];
  bound?: string;
}

interface SetsResponse {
  supported: boolean;
  bound?: string;
  sets?: TraitSetSummary[];
}

interface MembershipResponse {
  supported: boolean;
  memberships?: Membership[];
}

/** Roots compare as lower-case hex; an order carries them as bigints. */
export const rootKey = (root: bigint | Hex) =>
  (typeof root === "bigint" ? `0x${root.toString(16).padStart(64, "0")}` : root).toLowerCase();

/** A trait's name, as screens show it: "Tier: Legendary". */
export const traitLabel = (s: { traitType: string; value: string }) => `${s.traitType}: ${s.value}`;

/**
 * The bounds a set of trait offers were made at (`saltWithBound`), for asking
 * the server about sets that have since stopped being current. Highest first,
 * at most the eight the endpoint answers — the newest offers are the ones
 * still standing.
 */
export function boundsOf(offers: ReadonlyArray<{ params: { salt: bigint } }>): bigint[] {
  const seen = new Set<bigint>();
  for (const o of offers) {
    const b = boundOfSalt(o.params.salt);
    if (b !== undefined) seen.add(b);
  }
  return [...seen].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0)).slice(0, 8);
}

const boundsParam = (bounds: readonly bigint[] | undefined) =>
  bounds === undefined || bounds.length === 0 ? "" : bounds.map((b) => b.toString()).join(",");

/**
 * Every trait set in a collection. `supported: false` where the site cannot
 * build sets it would stand by.
 *
 * `sets` is what a new offer may pick from: the current ones. `byRoot` also
 * holds the sets at `bounds` — earlier snapshots of a growing collection —
 * so an offer made before later mints is still recognised and named.
 */
export function useCriteriaSets(collection: `0x${string}` | undefined, bounds?: readonly bigint[]) {
  const b = boundsParam(bounds);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["criteria-sets", collection?.toLowerCase(), b],
    enabled: collection !== undefined,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SetsResponse> => {
      const res = await fetch(`/api/criteria/${collection}${b === "" ? "" : `?bounds=${b}`}`);
      if (!res.ok) throw new Error(`criteria ${res.status}`);
      return (await res.json()) as SetsResponse;
    },
  });

  const all = data?.sets ?? [];
  return {
    supported: data?.supported === true,
    /** On a growing collection, the bound a new offer records; undefined otherwise. */
    bound: data?.bound === undefined ? undefined : BigInt(data.bound),
    sets: all.filter((s) => s.bound === data?.bound),
    byRoot: new Map(all.map((s) => [rootKey(s.root), s])),
    isLoading,
    isError,
  };
}

/** The sets one piece is in, each with the proof accepting a trait offer needs. */
export async function fetchTokenCriteria(
  collection: `0x${string}`,
  tokenId: bigint,
  bounds?: readonly bigint[],
): Promise<Membership[]> {
  const b = boundsParam(bounds);
  const res = await fetch(`/api/criteria/${collection}?tokenId=${tokenId.toString()}${b === "" ? "" : `&bounds=${b}`}`);
  if (!res.ok) throw new Error(`criteria ${res.status}`);
  const body = (await res.json()) as MembershipResponse;
  return body.memberships ?? [];
}

/** One key for one piece's memberships, shared by every screen that asks. */
export const tokenCriteriaKey = (collection: string, tokenId: bigint, bounds?: readonly bigint[]) => [
  "criteria-token",
  collection.toLowerCase(),
  tokenId.toString(),
  boundsParam(bounds),
];

export function useTokenCriteria(
  collection: `0x${string}` | undefined,
  tokenId: bigint | undefined,
  bounds?: readonly bigint[],
) {
  const { data, isLoading } = useQuery({
    queryKey: tokenCriteriaKey(collection ?? "", tokenId ?? 0n, bounds),
    enabled: collection !== undefined && tokenId !== undefined,
    staleTime: 5 * 60_000,
    queryFn: () => fetchTokenCriteria(collection!, tokenId!, bounds),
  });
  const memberships = data ?? [];
  return { memberships, byRoot: new Map(memberships.map((m) => [rootKey(m.root), m])), isLoading };
}

// ------------------------------------------------------------ cards, batched

interface MembersResponse {
  supported: boolean;
  roots?: Record<string, { traitType: string; value: string }>;
  members?: Record<string, Hex[]>;
}

/** Which trait sets one piece is in, by root, with each set's name. */
export type MemberRoots = Map<string, { traitType: string; value: string }>;

interface Batch {
  collection: `0x${string}`;
  bounds: string;
  waiters: Map<string, Array<{ resolve: (r: MemberRoots) => void; reject: (e: unknown) => void }>>;
}

const batches = new Map<string, Batch>();
const MEMBERS_PER_REQUEST = 200;

async function flush(key: string) {
  const batch = batches.get(key);
  batches.delete(key);
  if (batch === undefined) return;

  const ids = [...batch.waiters.keys()];
  for (let i = 0; i < ids.length; i += MEMBERS_PER_REQUEST) {
    const chunk = ids.slice(i, i + MEMBERS_PER_REQUEST);
    try {
      const res = await fetch(
        `/api/criteria/${batch.collection}?members=${chunk.join(",")}${batch.bounds === "" ? "" : `&bounds=${batch.bounds}`}`,
      );
      if (!res.ok) throw new Error(`criteria ${res.status}`);
      const body = (await res.json()) as MembersResponse;
      for (const id of chunk) {
        const roots: MemberRoots = new Map();
        for (const root of body.members?.[id] ?? []) {
          const name = body.roots?.[root];
          if (name !== undefined) roots.set(rootKey(root), name);
        }
        for (const w of batch.waiters.get(id) ?? []) w.resolve(roots);
      }
    } catch (err) {
      for (const id of chunk) for (const w of batch.waiters.get(id) ?? []) w.reject(err);
    }
  }
}

/**
 * The sets one piece is in, for a card.
 *
 * Every card on a page asks within the same moment, so the questions are
 * held for a tick and sent together — a grid of forty cards is one request,
 * not forty against a per-caller rate limit.
 */
export function fetchMemberRoots(
  collection: `0x${string}`,
  tokenId: bigint,
  bounds?: readonly bigint[],
): Promise<MemberRoots> {
  const b = boundsParam(bounds);
  const key = `${collection.toLowerCase()}|${b}`;
  let batch = batches.get(key);
  if (batch === undefined) {
    batch = { collection, bounds: b, waiters: new Map() };
    batches.set(key, batch);
    setTimeout(() => void flush(key), 15);
  }
  const id = tokenId.toString();
  return new Promise((resolve, reject) => {
    const list = batch!.waiters.get(id) ?? [];
    list.push({ resolve, reject });
    batch!.waiters.set(id, list);
  });
}
