import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { floorForTier } from "./floors";
import type { TierFloor } from "@/hooks/useFloors";

/**
 * The bug this replaces produced a number, not an error.
 *
 * A portfolio showed a Super Rare with the cheapest Common's asking price,
 * labelled as its floor. Nothing was missing, nothing looked broken, and the
 * figure was confidently wrong in the direction that matters most — it tells an
 * owner their best piece is worth a fraction of what it is.
 *
 * Both shapes of the failure are below, because they had different causes: one
 * was the fallback firing, the other was the tier list arriving empty because a
 * *display* rule had hidden it.
 */

const row = (tier: string, soso: string, count = 1): TierFloor => ({
  tier,
  price: parseEther(soso),
  count,
});

const LADDER = [
  row("Common", "9"),
  row("Uncommon", "20"),
  row("Rare", "50"),
  row("SuperRare", "120"),
];

const COLLECTION_FLOOR = parseEther("9");

describe("floorForTier", () => {
  it("quotes a tier its own floor", () => {
    expect(floorForTier("Rare", LADDER, COLLECTION_FLOOR)).toBe(parseEther("50"));
    expect(floorForTier("SuperRare", LADDER, COLLECTION_FLOOR)).toBe(parseEther("120"));
  });

  /**
   * Shape one. The tier exists in the collection and nothing in it is listed.
   * The old rule fell through to the collection floor, which is the minimum
   * across every tier — so the fallback fired exactly when it was most wrong.
   */
  it("says nothing rather than quoting another tier, when yours has none listed", () => {
    const onlyCommonListed = [row("Common", "9")];

    expect(floorForTier("SuperRare", onlyCommonListed, COLLECTION_FLOOR)).toBeUndefined();
    expect(floorForTier("SuperRare", onlyCommonListed, COLLECTION_FLOOR)).not.toBe(
      COLLECTION_FLOOR,
    );
  });

  /**
   * Shape two, and the subtler one. `tierFloorsFor` hides a breakdown of fewer
   * than two rows because one row under the collection floor is noise — so a
   * collection with four tiers and one of them listed reported no tiers at all,
   * and every piece in it fell through. Passing the unfiltered rows is the fix;
   * this asserts the rule behaves correctly once it has them.
   */
  it("prices from a single listed tier, which the display rule used to hide", () => {
    const onlyUncommonListed = [row("Uncommon", "20")];

    expect(floorForTier("Uncommon", onlyUncommonListed, parseEther("20"))).toBe(parseEther("20"));
    expect(floorForTier("Common", onlyUncommonListed, parseEther("20"))).toBeUndefined();
  });

  it("says nothing when the collection has no listings at all", () => {
    expect(floorForTier("Common", [], undefined)).toBeUndefined();
  });

  /**
   * The one case that still falls through, and should. An untiered piece has no
   * narrower comparable than the collection itself.
   */
  it("gives an untiered piece the collection floor", () => {
    expect(floorForTier(undefined, [], COLLECTION_FLOOR)).toBe(COLLECTION_FLOOR);
    expect(floorForTier(undefined, LADDER, COLLECTION_FLOOR)).toBe(COLLECTION_FLOOR);
  });

  it("gives an untiered piece nothing when the collection has nothing listed", () => {
    expect(floorForTier(undefined, [], undefined)).toBeUndefined();
  });

  /** Tier labels come from metadata and are matched exactly, as they are everywhere else. */
  it("does not match a tier by a different name", () => {
    expect(floorForTier("Super Rare", LADDER, COLLECTION_FLOOR)).toBeUndefined();
    expect(floorForTier("superrare", LADDER, COLLECTION_FLOOR)).toBeUndefined();
  });

  /**
   * The whole ladder, against the exact collection this was reported on.
   *
   * Treasure Box has four tiers and frequently one of them for sale. Every
   * piece except the listed tier must come back undefined; not one of them may
   * come back holding 9 SOSO.
   */
  it("never quotes the cheapest tier against a dearer one", () => {
    const onlyCommon = [row("Common", "9")];

    for (const tier of ["Uncommon", "Rare", "SuperRare"]) {
      expect(floorForTier(tier, onlyCommon, COLLECTION_FLOOR), tier).toBeUndefined();
    }
    expect(floorForTier("Common", onlyCommon, COLLECTION_FLOOR)).toBe(parseEther("9"));
  });
});
