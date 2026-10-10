import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { KOLS, kolCard } from "./kols";

/**
 * The /kols cards draw these from our own CDN (2026-10-09). A KOL added to the
 * roster without running `metadata/scripts/localise-kols.mjs` would be a
 * broken picture on the page, so the files are checked rather than assumed.
 */
describe("kolCard", () => {
  it("has a card portrait on disk for every KOL", () => {
    const missing = KOLS.filter((k) => !existsSync(join(process.cwd(), "public", kolCard(k))));
    expect(missing.map((k) => `${k.n} ${k.name}`)).toEqual([]);
  });

  it("lives under /art, which is cached for a year", () => {
    for (const k of KOLS) expect(kolCard(k).startsWith("/art/kols/")).toBe(true);
  });
});
