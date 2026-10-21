import { describe, expect, it } from "vitest";
import { countsForNextDraw, TREASURE_DRAW } from "@/config/treasureDraw";

const BOX = "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750";

describe("countsForNextDraw", () => {
  it("counts the first box minted after the snapshot, and everything after it", () => {
    expect(countsForNextDraw(BOX, TREASURE_DRAW.firstEligibleId)).toBe(true);
    expect(countsForNextDraw(BOX, 103_211n)).toBe(true);
  });

  it("does not count the last box minted before it", () => {
    expect(countsForNextDraw(BOX, TREASURE_DRAW.firstEligibleId - 1n)).toBe(false);
    expect(countsForNextDraw(BOX, 99_756n)).toBe(false);
  });

  it("is about Treasure Boxes only, whatever the id", () => {
    expect(countsForNextDraw("0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30", 200_000n)).toBe(false);
    expect(countsForNextDraw(undefined, 200_000n)).toBe(false);
  });
});
