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
    if (!res.ok) throw new Error(`Metadata unavailable (HTTP ${res.status})`);
    return undefined;
  }

  return readTokenMetadata(parsed);
}
