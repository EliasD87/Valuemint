import { describe, expect, it } from "vitest";
import { KOL_POSTS } from "@/config/kolPosts";
import { KOLS } from "@/config/kols";

/**
 * The wall quotes real people under their own names, so every entry must
 * belong to a portrait on the roster, and nobody is quoted twice.
 */
describe("KOL_POSTS", () => {
  it.each(KOL_POSTS.map((p, i) => [i, p] as const))("entry %i belongs to a KOL on the roster", (_, p) => {
    expect(KOLS.find((k) => k.n === p.kol), `no portrait #${p.kol}`).toBeDefined();
    expect(p.text.trim()).not.toBe("");
    expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("quotes each KOL once", () => {
    const ids = KOL_POSTS.map((p) => p.kol);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
