import { describe, expect, it } from "vitest";
import { wsosoNeeds } from "@/lib/wsosoNeeds";

const soso = (n: string) => BigInt(n) * 10n ** 18n;

describe("wsosoNeeds", () => {
  it("asks a first-time bidder to wrap the bid", () => {
    const n = wsosoNeeds({ needed: soso("10"), alsoCover: 0n, held: 0n, approved: 0n });
    expect(n.needsWrap).toBe(true);
    expect(n.shortfall).toBe(soso("10"));
    expect(n.totalNeeded).toBe(soso("10"));
  });

  /**
   * THE BUG THIS FILE EXISTS FOR.
   *
   * A bidder holding 10 WSOSO with one 10 WSOSO bid already live, placing a
   * second at 10. The balance check used to ask only "do you hold 10", which
   * they do — so nothing was wrapped, and two live bids shared one bid's worth
   * of money. The first to be accepted settled; the second reverted.
   */
  it("makes a second bid wrap again, even though the balance covers one", () => {
    const n = wsosoNeeds({
      needed: soso("10"),
      alsoCover: soso("10"),
      held: soso("10"),
      approved: soso("10"),
    });
    expect(n.totalNeeded).toBe(soso("20"));
    expect(n.needsWrap).toBe(true);
    expect(n.shortfall).toBe(soso("10"));
  });

  it("covers every standing bid at once, not the largest of them", () => {
    const n = wsosoNeeds({
      needed: soso("5"),
      alsoCover: soso("10") + soso("7"),
      held: soso("10"),
      approved: 0n,
    });
    expect(n.totalNeeded).toBe(soso("22"));
    expect(n.shortfall).toBe(soso("12"));
  });

  it("asks for nothing when the balance already covers everything", () => {
    const n = wsosoNeeds({
      needed: soso("5"),
      alsoCover: soso("10"),
      held: soso("15"),
      approved: soso("15"),
    });
    expect(n.needsWrap).toBe(false);
    expect(n.needsAllowance).toBe(false);
    expect(n.shortfall).toBe(0n);
  });

  /** Holding enough is not the same as having approved it; both gate a bid. */
  it("separates holding the money from having approved it", () => {
    const funded = wsosoNeeds({
      needed: soso("10"),
      alsoCover: 0n,
      held: soso("10"),
      approved: 0n,
    });
    expect(funded.needsWrap).toBe(false);
    expect(funded.needsAllowance).toBe(true);

    const approvedOnly = wsosoNeeds({
      needed: soso("10"),
      alsoCover: 0n,
      held: 0n,
      approved: soso("10"),
    });
    expect(approvedOnly.needsWrap).toBe(true);
    expect(approvedOnly.needsAllowance).toBe(false);
  });

  /**
   * A bidder with bids standing and nothing being typed still has to be covered
   * — otherwise clearing the amount box would report "all good" over bids that
   * cannot settle.
   */
  it("still reports a shortfall when no new bid is being placed", () => {
    const n = wsosoNeeds({ needed: 0n, alsoCover: soso("10"), held: soso("4"), approved: 0n });
    expect(n.needsWrap).toBe(true);
    expect(n.shortfall).toBe(soso("6"));
  });

  it("asks for nothing at all when there is nothing to cover", () => {
    const n = wsosoNeeds({ needed: 0n, alsoCover: 0n, held: 0n, approved: 0n });
    expect(n.needsWrap).toBe(false);
    expect(n.needsAllowance).toBe(false);
    expect(n.shortfall).toBe(0n);
  });

  /** Wei, not ether — an off-by-one here is a bid that cannot settle. */
  it("is exact at the boundary", () => {
    const exact = wsosoNeeds({ needed: 10n, alsoCover: 0n, held: 10n, approved: 10n });
    expect(exact.needsWrap).toBe(false);

    const oneShort = wsosoNeeds({ needed: 10n, alsoCover: 0n, held: 9n, approved: 10n });
    expect(oneShort.needsWrap).toBe(true);
    expect(oneShort.shortfall).toBe(1n);
  });
});
