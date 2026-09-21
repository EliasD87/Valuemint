/**
 * What the front page says, which depends on what the site can currently do.
 *
 * The hero opened with "Create, collect and trade" over "Deploy your own
 * collection, mint it, and trade it" while `CREATE_ENABLED` was false and
 * `/create` was unreachable — so the first word of the page and the first
 * clause beneath it both promised the one thing nobody could do, and the only
 * button offered was Explore collections.
 *
 * A function of the flag rather than two strings edited by hand, because the
 * hand-edited version is exactly what drifted. The flag already gates the
 * button and the page itself; keyed to it, turning creation back on restores
 * the promise in the same commit that restores the feature, and there is no
 * state in which the hero can advertise something the site will not do.
 *
 * Taking the flag as an argument rather than reading it is what makes that
 * testable: a module-level constant only ever has the value this build was
 * compiled with, so the branch that is off could never be exercised.
 */

export interface HeroCopy {
  /** The heading's first line. */
  lead: string;
  /** Its second line, the one the gradient runs through. */
  em: string;
  lede: string;
}

export function heroCopy(createEnabled: boolean): HeroCopy {
  /**
   * The same either way, and true either way.
   *
   * It names the chain rather than gesturing at it ("minted here"), which is
   * the one thing a visitor who has never heard of ValueChain needs from the
   * first line. That is also why the lede below no longer opens with it — two
   * lines apart it read as a stutter.
   */
  const em = "everything on ValueChain";

  if (createEnabled) {
    return {
      lead: "Create, collect and trade",
      em,
      lede:
        "Deploy your own collection, mint it, and trade it — with no custodian holding " +
        "anything. You own the contract outright, and every trade settles in seconds for a " +
        "fraction of a cent.",
    };
  }

  return {
    lead: "Collect and trade",
    em,
    lede:
      "Every collection in one place — yours to browse, bid on and trade, with no " +
      "custodian holding anything. Trades settle in seconds for a fraction of a cent.",
  };
}
