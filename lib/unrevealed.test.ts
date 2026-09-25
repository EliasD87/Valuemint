import { describe, expect, it } from "vitest";
import { isUnrevealed, revealDay, revealLong, revealPending, revealShort } from "@/lib/unrevealed";

const doc = (attributes: Array<{ trait_type: string; value: string | number }>) =>
  ({ name: "x", attributes }) as never;

describe("isUnrevealed", () => {
  it("is true for the document /api/metadata serves for a held-back token", () => {
    expect(isUnrevealed(doc([{ trait_type: "Status", value: "Unrevealed" }]))).toBe(true);
  });

  it("is false once a design is published", () => {
    expect(
      isUnrevealed(
        doc([
          { trait_type: "Design", value: "ORIGIN" },
          { trait_type: "Tier", value: "Legendary" },
        ]),
      ),
    ).toBe(false);
  });

  /**
   * The guard that matters. A third-party contract publishes whatever traits it
   * likes and names no design — that is not a held-back token, and telling its
   * holder their piece is awaiting a reveal would be a lie about somebody
   * else's collection. Every call site pairs this with `heldBackFor`.
   */
  it("is true for any document with traits but no Design — the caller must also check the collection", () => {
    expect(isUnrevealed(doc([{ trait_type: "Background", value: "Blue" }]))).toBe(true);
  });

  it("is false when there are no attributes at all", () => {
    expect(isUnrevealed(doc([]))).toBe(false);
    expect(isUnrevealed(undefined)).toBe(false);
  });

  it("ignores casing", () => {
    expect(isUnrevealed(doc([{ trait_type: "design", value: "ORIGIN" }]))).toBe(false);
  });
});

describe("reveal wording", () => {
  /**
   * Order is the READER'S, not ours: a US visitor gets "Oct 2" and a British
   * one "2 Oct", because the date is formatted in their own locale. So these
   * assert the parts and never the order — an assertion on "2 Oct" passes on
   * one machine and fails on the next, which is a test about the test runner
   * rather than about this code.
   */
  it("is short enough for a card cell", () => {
    const short = revealShort({ revealBy: "2026-10-02" });
    expect(short).toContain("Oct");
    expect(short).toContain("2");
    expect(short.length).toBeLessThanOrEqual(7);
  });

  it("reads as a sentence on the token page", () => {
    const long = revealLong({ revealBy: "2026-10-02" });
    expect(long.startsWith("on ")).toBe(true);
    expect(long).toContain("October");
    expect(long).toContain("2");
  });

  /**
   * The date is a plain `YYYY-MM-DD` and has to land on that day for everybody.
   *
   * Parsed without the explicit UTC it would be midnight LOCAL, which for any
   * reader west of Greenwich renders the day BEFORE — a reveal date wrong by
   * one day for a whole hemisphere. These check both ends of a year, where the
   * drift would also change the month.
   */
  it("does not drift a day across time zones", () => {
    expect(revealShort({ revealBy: "2026-01-01" })).toContain("Jan");
    expect(revealShort({ revealBy: "2026-01-01" })).toContain("1");
    expect(revealShort({ revealBy: "2026-12-31" })).toContain("Dec");
    expect(revealShort({ revealBy: "2026-12-31" })).toContain("31");
  });

  it("falls back to the open-ended promise when no date is set", () => {
    expect(revealShort({})).toBe("At mint-out");
    expect(revealLong({})).toBe("when the last one is minted");
  });

  it("gives the bare day for a sentence that supplies its own preposition", () => {
    const day = revealDay({ revealBy: "2026-10-02" });
    expect(day).toContain("October");
    expect(day?.startsWith("on ")).toBe(false);
    expect(revealLong({ revealBy: "2026-10-02" })).toBe(`on ${day}`);
    expect(revealDay({})).toBeUndefined();
  });
});

describe("revealPending", () => {
  const held = { revealBy: "2026-10-02" };

  it("is pending before the day and through all of it, in UTC", () => {
    expect(revealPending(held, new Date("2026-09-25T12:00:00Z"))).toBe(true);
    expect(revealPending(held, new Date("2026-10-02T00:00:00Z"))).toBe(true);
    expect(revealPending(held, new Date("2026-10-02T23:59:59Z"))).toBe(true);
  });

  it("retires from the next day", () => {
    expect(revealPending(held, new Date("2026-10-03T00:00:00Z"))).toBe(false);
  });

  it("is always pending without a date — mint-out cannot be timed from here", () => {
    expect(revealPending({}, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});
