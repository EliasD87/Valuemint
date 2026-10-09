import { describe, expect, it } from "vitest";
import { chosenPieces, firstPieces, togglePiece } from "./piecePick";

const IDS = [123n, 455n, 9n, 77n, 1000n];

describe("choosing pieces", () => {
  it("starts from the first N, in the order shown", () => {
    expect([...firstPieces(IDS, 2)]).toEqual(["123", "455"]);
    expect(firstPieces(IDS, 0).size).toBe(0);
    expect(firstPieces(IDS, 99).size).toBe(5);
  });

  it("adds and removes one piece at a time", () => {
    const start = firstPieces(IDS, 2);
    const without = togglePiece(start, 123n, 5);
    expect([...without]).toEqual(["455"]);
    const withNine = togglePiece(without, 9n, 5);
    expect(chosenPieces(IDS, withNine)).toEqual([455n, 9n]);
  });

  it("will not go past the most allowed", () => {
    const full = firstPieces(IDS, 3);
    expect(togglePiece(full, 1000n, 3)).toEqual(full);
    // Taking one out is always allowed.
    expect(togglePiece(full, 123n, 3).size).toBe(2);
  });

  it("never sends a piece that has left the list", () => {
    const picked = firstPieces(IDS, 3);
    // #455 was listed elsewhere in the meantime.
    expect(chosenPieces([123n, 9n, 77n], picked)).toEqual([123n, 9n]);
  });

  it("caps what it sends", () => {
    expect(chosenPieces(IDS, firstPieces(IDS, 5), 2)).toEqual([123n, 455n]);
  });

  it("does not mutate what it was given", () => {
    const start = firstPieces(IDS, 1);
    togglePiece(start, 455n, 5);
    expect(start.size).toBe(1);
  });
});
