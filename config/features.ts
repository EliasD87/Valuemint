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
