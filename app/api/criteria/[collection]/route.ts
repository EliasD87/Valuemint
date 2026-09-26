import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { callerKey, limiter } from "@/lib/rateLimit";
import { traitSetsOf, type TraitSet } from "@/lib/traitSets";

/**
 * Trait offers' sets, for one collection (see lib/traitSets.ts).
 *
 *   GET /api/criteria/<collection>
 *     → { supported: true, bound?, sets: [{ traitType, value, count, root, bound? }] }
 *       every trait value and the root of its set: what a bidder picks from,
 *       and what a viewer matches an offer's root against to name it.
 *       `bound` is present on a growing collection (Treasure Box): the highest
 *       token id the current sets cover, which a new offer records.
 *     → { supported: false } where the site cannot build sets it would stand by.
 *
 *   GET /api/criteria/<collection>?tokenId=N
 *     → { supported: true, memberships: [{ traitType, value, root, proof, bound? }] }
 *       the sets this token is in, with its proof for each: whether a trait
 *       offer applies to the piece, and what accepting one sends to Seaport.
 *
 *   GET /api/criteria/<collection>?members=1,2,3…  (up to 200)
 *     → { supported: true, roots: { <root>: { traitType, value } }, members: { "<id>": [<root>…] } }
 *       which sets each of many tokens is in, without proofs: what a grid of
 *       cards needs to show a trait offer's price, in one request not one per card.
 *
 *   &bounds=B1,B2…  (any form) also answers for a growing collection's sets
 *       as they were at those bounds — how an offer made before later mints is
 *       still named, and still acceptable, after its set stopped being current.
 *
 * The site holds no opinion that settles anything here. A proof that is wrong
 * fails in Seaport; a root the site does not recognise is simply not shown.
 */

export const runtime = "nodejs";

/** Cold answers compose every document in a collection; the CDN holds the rest. */
const PER_CALLER = 300;
const WINDOW_MS = 10 * 60 * 1000;

/** Each distinct bound costs a tree build; a page never needs more than a few. */
const MAX_BOUNDS = 8;

/** A page of cards; a grid asks in chunks of this. */
const MAX_MEMBERS = 200;
const MEMBERS = /^[0-9]{1,78}(,[0-9]{1,78}){0,199}$/;

const CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" };

export async function GET(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (!isAddress(collection)) {
    return NextResponse.json({ error: "That is not a collection address." }, { status: 400 });
  }

  const search = new URL(request.url).searchParams;
  const rawId = search.get("tokenId");
  if (rawId !== null && !/^[0-9]{1,78}$/.test(rawId)) {
    return NextResponse.json({ error: "tokenId must be a whole number." }, { status: 400 });
  }
  const rawBounds = search.get("bounds");
  if (rawBounds !== null && !/^[0-9]{1,20}(,[0-9]{1,20}){0,7}$/.test(rawBounds)) {
    return NextResponse.json(
      { error: `bounds must be up to ${MAX_BOUNDS} whole numbers, comma-separated.` },
      { status: 400 },
    );
  }
  const bounds = [...new Set((rawBounds ?? "").split(",").filter(Boolean))].map((b) => BigInt(b));
  const rawMembers = search.get("members");
  if (rawMembers !== null && !MEMBERS.test(rawMembers)) {
    return NextResponse.json(
      { error: `members must be up to ${MAX_MEMBERS} token ids, comma-separated.` },
      { status: 400 },
    );
  }

  const gate = await limiter.take(`criteria:${callerKey(request)}`, PER_CALLER, WINDOW_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const address = getAddress(collection);
  let current;
  const earlier: TraitSet[] = [];
  try {
    current = await traitSetsOf(address);
    /* Only a growing collection has bounds; for the rest they are ignored. */
    if (current?.bound !== undefined) {
      for (const b of bounds) {
        if (b === current.bound) continue;
        earlier.push(...((await traitSetsOf(address, b))?.sets ?? []));
      }
    }
  } catch (err) {
    console.error("[criteria] failed", err);
    return NextResponse.json({ error: "Could not read this collection's traits just now." }, { status: 503 });
  }
  if (current === undefined) return NextResponse.json({ supported: false }, { headers: CACHE });

  const bound = current.bound?.toString();
  const all = [...current.sets, ...earlier];

  if (rawMembers !== null) {
    const ids = [...new Set(rawMembers.split(","))];
    return NextResponse.json(
      {
        supported: true,
        roots: Object.fromEntries(all.map((s) => [s.tree.root, { traitType: s.traitType, value: s.value }])),
        members: Object.fromEntries(
          ids.map((id) => [id, all.filter((s) => s.tree.has(BigInt(id))).map((s) => s.tree.root)]),
        ),
      },
      { headers: CACHE },
    );
  }

  if (rawId === null) {
    return NextResponse.json(
      {
        supported: true,
        ...(bound === undefined ? {} : { bound }),
        sets: all.map((s) => ({
          traitType: s.traitType,
          value: s.value,
          count: s.tree.size,
          root: s.tree.root,
          ...(s.bound === undefined ? {} : { bound: s.bound.toString() }),
        })),
      },
      { headers: CACHE },
    );
  }

  const id = BigInt(rawId);
  return NextResponse.json(
    {
      supported: true,
      memberships: all.flatMap((s) => {
        const proof = s.tree.proof(id);
        return proof === undefined
          ? []
          : [
              {
                traitType: s.traitType,
                value: s.value,
                root: s.tree.root,
                proof,
                ...(s.bound === undefined ? {} : { bound: s.bound.toString() }),
              },
            ];
      }),
    },
    { headers: CACHE },
  );
}
