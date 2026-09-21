import { describe, expect, it } from "vitest";
import { heroCopy } from "@/config/heroCopy";
import { CREATE_ENABLED } from "@/config/features";

/**
 * The front page must not promise a feature that is switched off.
 *
 * It did. `CREATE_ENABLED` went false, `/create` stopped being reachable and
 * its button disappeared from the hero — but the heading still opened with
 * the word "Create" and the lede still opened with "Deploy your own
 * collection", so the first thing anybody read was the one thing they could
 * not do, above a single button that went somewhere else entirely.
 *
 * Nothing failed when that happened, which is the point of testing it. Copy
 * has no types and no compiler; the only thing that can hold it to the flag
 * is an assertion that reads both of them.
 *
 * `heroCopy` takes the flag rather than reading it precisely so the branch
 * that is currently OFF can still be exercised here. A module-level constant
 * would only ever carry the value this build was compiled with, and the
 * untested branch is the one that ships wrong.
 */

/** Words that only make sense when somebody can actually create a collection. */
const PROMISES_CREATION = /\b(create|deploy|mint it|own the contract)\b/i;

describe("heroCopy", () => {
  it("says nothing about creating while creation is off", () => {
    const copy = heroCopy(false);
    const all = `${copy.lead} ${copy.em} ${copy.lede}`;

    expect(all).not.toMatch(PROMISES_CREATION);
  });

  it("offers it again the moment the flag comes back", () => {
    const copy = heroCopy(true);
    const all = `${copy.lead} ${copy.em} ${copy.lede}`;

    expect(copy.lead).toBe("Create, collect and trade");
    expect(all).toMatch(PROMISES_CREATION);
  });

  it("names the chain on the second line either way", () => {
    /** The line the gradient runs through, and the one a stranger reads first. */
    expect(heroCopy(true).em).toBe("everything on ValueChain");
    expect(heroCopy(false).em).toBe("everything on ValueChain");
  });

  it("does not say ValueChain twice in two lines", () => {
    for (const enabled of [true, false]) {
      const copy = heroCopy(enabled);
      const both = `${copy.em} ${copy.lede}`;
      expect(both.match(/ValueChain/g) ?? []).toHaveLength(1);
    }
  });

  it("keeps the two claims worth making, whatever the flag", () => {
    for (const enabled of [true, false]) {
      const { lede } = heroCopy(enabled);
      /** Self-custody, and what settlement actually costs. */
      expect(lede).toMatch(/no custodian/i);
      expect(lede).toMatch(/fraction of a cent/i);
    }
  });

  /**
   * The guard on the build that is actually shipping. The cases above prove
   * each branch in isolation; this one proves the right branch was chosen.
   */
  it("matches this build's own flag", () => {
    const shipped = heroCopy(CREATE_ENABLED);
    if (CREATE_ENABLED) {
      expect(shipped.lead).toBe("Create, collect and trade");
    } else {
      expect(shipped.lead).toBe("Collect and trade");
      expect(`${shipped.lead} ${shipped.lede}`).not.toMatch(PROMISES_CREATION);
    }
  });
});
