/**
 * Things the site can do, switched on and off in one place.
 *
 * ── TO BRING COLLECTION CREATION BACK: set CREATE_ENABLED to true. ───────
 *
 * That is the whole job. Nothing was deleted to turn it off — the wizard, the
 * pinning route, the factory ABI and the contracts all stay exactly where they
 * were, and every entry point reads this flag rather than having been removed.
 * Flipping it back restores the nav item, the footer link, the calls to action
 * on the home, collections, portfolio and manage pages, the sitemap entry, and
 * the wizard itself.
 *
 * It is a constant rather than an environment variable on purpose. An env var
 * would make this a deployment setting that is invisible in the code and easy
 * to lose track of; creation being off is a decision about the product, and a
 * decision belongs where it can be read.
 */

/**
 * Can anyone deploy a new collection through the site?
 *
 * Off for now, and coming back. While it is off, `/create` itself says so
 * rather than 404ing — somebody arriving on a bookmark or an old link deserves
 * to be told it is temporary instead of being shown a dead page.
 */
export const CREATE_ENABLED = false;

/**
 * Does the browser ask the index for token documents?
 *
 * **Off, after making things worse in production twice.** What it does when on:
 * every `tokenURI` document goes through `/api/index/documents` instead of
 * being fetched directly.
 *
 * Why it is off. The cache answers "I could not read that" for anything it
 * failed to fetch, and the caller then does the original fetch anyway — so a
 * failed row costs a wasted round trip *on top of* the work it was meant to
 * save. Two things filled it with failed rows:
 *
 *   - SoDEX answers 501 with a perfectly good body, which the route treated as
 *     a failure. Fixed, but only found because every Treasure Box went blank.
 *   - The warmer fetched 75 Genesis documents in a burst from this site's own
 *     `/api/metadata`, whose rate limiter allows 120 misses an hour. It
 *     rate-limited itself and cached 60 refusals.
 *
 * The second is the one that matters: a read-through cache that can poison
 * itself from its own warmer needs the warmer to respect the limiter, and it
 * needs failures not to be sticky. Neither was true.
 *
 * Nothing was removed to turn this off. The route, the warmer and the tests
 * all stay; the browser simply fetches documents the way it did before any of
 * it existed, which is the path that has always worked.
 */
export const DOCUMENT_CACHE_ENABLED = false;
