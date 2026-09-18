/**
 * Turning a stranger's JSON into something safe to render.
 *
 * Every token document this app displays is fetched from a URL that a contract
 * we do not control chose to return. The marketplace lists any ERC-721 the
 * explorer has indexed, so "a contract we do not control" is most of them.
 *
 * Until this existed, all seven fetch sites did the same thing:
 *
 *     return (await res.json()) as TokenMetadata;
 *
 * `as` is a promise to the compiler, not a check. Any JSON parses — a string,
 * a number, `null`, an array, an object with `attributes` set to a word — and
 * the cast waves all of it through. The failure then happened much later, at
 * the point something dereferenced a field:
 *
 *     m?.attributes?.find(...)   // six hooks
 *     metadata.attributes.map(...)  // the token page
 *
 * `attributes: "none"` reaches both as a string, and `"none".find` is not a
 * function. That is a TypeError thrown during render, which React does not
 * recover from — it unmounts the tree and the route error boundary replaces the
 * whole page. On the market grid, the home page and the portfolio that is
 * *other people's* collections taking down a page full of everybody's.
 *
 * It is the same lesson as `unsafeReason` in `lib/seaport.ts`, one layer up:
 * what a third-party contract points at is hostile input until it has been
 * checked, and the check belongs at the single door everything comes through
 * rather than at each of the places that later trusts it.
 *
 * Nothing here throws. A document that is wrong in part keeps the parts that
 * are right, because a token with a picture and a broken traits array should
 * still show its picture.
 */

/** The shape the app renders. Everything outside it is dropped. */
export interface TokenMetadata {
  name: string;
  description: string;
  image?: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}

/** A trait entry is only usable if it can be looked up and printed. */
function readAttribute(raw: unknown): { trait_type: string; value: string | number } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;

  const entry = raw as Record<string, unknown>;
  const name = entry.trait_type;
  const value = entry.value;

  // The lookup is an exact string match on `trait_type`, so an entry without
  // one can never be found - and it would render as an empty term in the
  // traits grid.
  if (typeof name !== "string" || name === "") return undefined;

  // `value` is printed with String(), which would happily turn an object into
  // "[object Object]". Numbers and booleans are fine; anything else is not.
  if (typeof value === "string" || typeof value === "number") {
    return { trait_type: name, value };
  }
  if (typeof value === "boolean") return { trait_type: name, value: value ? "Yes" : "No" };

  return undefined;
}

/**
 * Validate a parsed JSON document into something the UI can render.
 *
 * Returns `undefined` when there is nothing usable at all, which every caller
 * already handles - it is the same state as a fetch that failed.
 */
export function readTokenMetadata(raw: unknown): TokenMetadata | undefined {
  // A bare string, a number, null, or an array at the top level. All of these
  // are valid JSON and none of them is a metadata document.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;

  const doc = raw as Record<string, unknown>;

  /**
   * Missing text is empty text, not a crash.
   *
   * `name` and `description` are declared non-optional on the interface and are
   * read without guards in places, so they are always present after this - the
   * type stops being a lie about what came back.
   */
  const name = typeof doc.name === "string" ? doc.name : "";
  const description = typeof doc.description === "string" ? doc.description : "";

  /**
   * `image` stays optional, and only a non-empty string counts.
   *
   * An empty string would resolve to `undefined` downstream anyway, but saying
   * so here means the "no artwork" branches can trust the field instead of
   * re-testing it.
   */
  const image = typeof doc.image === "string" && doc.image.trim() !== "" ? doc.image : undefined;

  /**
   * The whole reason this file exists.
   *
   * Anything that is not an array becomes an empty one, so `.find` and `.map`
   * are always safe. Entries inside it are filtered individually - one bad
   * trait does not cost a document its good ones.
   */
  const attributes = Array.isArray(doc.attributes)
    ? doc.attributes
        .map(readAttribute)
        .filter((a): a is { trait_type: string; value: string | number } => a !== undefined)
    : [];

  // A document with no name, no image and no traits describes nothing. Treated
  // as absent so callers show their "nothing was published" state rather than a
  // shell with every field blank.
  if (name === "" && image === undefined && attributes.length === 0) return undefined;

  return { name, description, image, attributes };
}

/**
 * Read one named trait.
 *
 * The match is exact and case-sensitive, which is deliberate and worth knowing:
 * "Tier" is found and "tier" is not. Six hooks had their own copy of this; they
 * all now call this one.
 */
export function traitOf(
  metadata: TokenMetadata | undefined,
  name: string,
): string | undefined {
  const hit = metadata?.attributes?.find((a) => a.trait_type === name);
  return hit === undefined ? undefined : String(hit.value);
}

/**
 * The words collections use for "how rare is this one".
 *
 * There is no standard. The ERC-721 metadata schema says `attributes` is a list
 * of `trait_type`/`value` pairs and stops there, so the name of the rarity trait
 * is whatever the collection's author typed.
 *
 * This app read `"Tier"` and nothing else, which is what its own factory emits.
 * The SoDEX treasure boxes publish `{"trait_type":"Level","value":"Common"}` —
 * so every box rendered as an identical "SoDEXTreasureBox" card with an empty
 * chip, and Common was indistinguishable from SuperRare on the one collection
 * where the tier is the entire point.
 *
 * Ordered by preference, so a collection that publishes both keeps the meaning
 * it chose first. The lookup underneath stays exact and case-sensitive: this
 * widens which *names* are recognised, never how loosely a name is matched.
 */
const TIER_TRAITS = ["Tier", "Level", "Rarity", "Rank", "Grade"] as const;

/**
 * The rarity of a token, whatever its collection decided to call it.
 *
 * Returns `undefined` when the collection publishes no such trait, which is
 * most of them - a card with no tier simply shows no chip.
 */
export function tierOf(metadata: TokenMetadata | undefined): string | undefined {
  for (const name of TIER_TRAITS) {
    const value = traitOf(metadata, name);
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

/**
 * A tier as a CSS class suffix.
 *
 * `\`chip-${tier.toLowerCase()}\`` is fine for "Common" and breaks the moment a
 * collection writes "Super Rare": the space ends the class and the browser sees
 * `chip-super` plus a stray `rare` class, which is how a chip ends up wearing
 * the wrong colour rather than none. Anything that is not a letter or a digit
 * is dropped, so "SuperRare", "Super Rare" and "super-rare" all land on
 * `chip-superrare`.
 *
 * Returns `undefined` when there is no tier, so the caller renders no chip at
 * all rather than a `chip-undefined`.
 */
export function tierClass(tier: string | undefined): string | undefined {
  if (tier === undefined) return undefined;
  const slug = tier.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug === "" ? undefined : slug;
}

/**
 * Fetch a token document, and do not let a status code throw away a good one.
 *
 * Every fetch site used to be `if (!res.ok) throw` / `if (res.ok) use it`, which
 * is the obvious thing to write and wrong for a marketplace that reads other
 * people's servers.
 *
 * SoDEX serves the treasure boxes' metadata from
 * `mainnet-gw.sodex.dev/api/v1/nft/token/sobox/<tier>` and answers **HTTP 501
 * Not Implemented** with a complete, correct JSON document in the body —
 * name, description, image and the tier. Confirmed on all four tiers, CORS
 * open. Because 501 is not `ok`, the app discarded every one of them, and
 * thousands of boxes rendered nameless and pictureless while the data sat in a
 * response we had already paid for.
 *
 * We do not control that server and cannot make it return 200. We can stop
 * caring what it says on the envelope.
 *
 * This is safe because the body still has to survive `readTokenMetadata`: an
 * error page, an HTML 404 or `{"error":"..."}` has no name, no image and no
 * traits, so it comes back `undefined` exactly as a failed fetch would. The
 * status is a hint, never the decision.
 *
 * A network failure is still a failure - this throws, so React Query retries
 * rather than caching nothing as though it were an answer.
 */
/**
 * A refused fetch, carrying the status that refused it.
 *
 * The status is the difference between "this one token is missing" and "this
 * host is down", and callers cannot tell those apart from a message. A 404 is
 * one token's business; a 503 is every token's, and the second is worth
 * stopping for — SoDEX's metadata gateway returned 503 for all three of its
 * collections after the ValueChain upgrade, and sixty cards each asked it
 * separately.
 */
export class MetadataHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Metadata unavailable (HTTP ${status})`);
    this.name = "MetadataHttpError";
    this.status = status;
  }
}

export async function fetchTokenMetadata(
  url: string,
  timeoutMs = 20_000,
): Promise<TokenMetadata | undefined> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    // Not JSON at all. If the status also said no, report it as a failure so
    // the caller can retry; otherwise there is simply nothing here.
    if (!res.ok) throw new MetadataHttpError(res.status);
    return undefined;
  }

  return readTokenMetadata(parsed);
}

/**
 * Fetch many token documents, asking for each distinct URL exactly once.
 *
 * Collections that share a document between tokens are not an edge case here,
 * they are the main event. The SoDEX treasure boxes put the *tier* in the URL —
 * `.../sobox/0` through `.../sobox/3` — so a wallet holding 626 boxes points at
 * two distinct documents, and one holding 3,000 still points at four. Measured
 * on 30 consecutive box ids: 2 distinct URLs.
 *
 * Without deduping, a whale's portfolio issued one request per token: 626
 * requests for 2 documents, and 3,000 for 4. That is the difference between a
 * page that opens and a page that hammers someone else's API until it stops
 * answering.
 *
 * It is not universal — TestCybereator gives every token its own URL, and 30
 * ids there are 30 documents — so this changes nothing for collections that
 * genuinely differ per token. It costs one Map either way.
 *
 * The concurrency limit still applies, to the distinct URLs rather than to the
 * tokens, so a collection with a thousand real documents is still fetched
 * politely rather than all at once.
 */
export async function fetchManyTokenMetadata(
  urls: Array<string | undefined>,
  limit: number,
  timeoutMs = 20_000,
): Promise<Array<TokenMetadata | undefined>> {
  /** One promise per distinct URL, shared by every slot that asked for it. */
  const byUrl = new Map<string, Promise<TokenMetadata | undefined>>();

  const distinct = [...new Set(urls.filter((u): u is string => u !== undefined && u !== ""))];

  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, distinct.length) }, async () => {
      while (cursor < distinct.length) {
        const url = distinct[cursor++];
        if (url === undefined) continue;
        // Store the settled value, not a rejecting promise: one unreachable
        // document must not reject the whole batch.
        const settled = fetchTokenMetadata(url, timeoutMs).catch(() => undefined);
        byUrl.set(url, settled);
        await settled;
      }
    }),
  );

  return Promise.all(
    urls.map(async (u) => (u === undefined || u === "" ? undefined : byUrl.get(u))),
  );
}
