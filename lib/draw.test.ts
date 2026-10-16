import { describe, expect, it } from "vitest";
import { keccak256, toHex } from "viem";
import {
  drawWinners,
  numberOfPlace,
  numbersOf,
  numberTickets,
  ownerOfTicket,
  placeOfNumber,
  ticketFor,
  validateEntries,
  type DrawEntry,
} from "./draw";
import { ticketsFor } from "@/config/draws";

const wallet = (i: number) => `0x${(i + 1).toString(16).padStart(40, "0")}`;
/** One wallet per ticket count, numbered as the real list is. */
const list = (counts: number[]): DrawEntry[] =>
  numberTickets(counts.map((tickets, i) => ({ wallet: wallet(i), depths: [tickets], tickets })));
const seed = (n: number) => keccak256(toHex(n));

describe("ticketsFor", () => {
  it("counts each qualifying piece as its depth", () => {
    expect(ticketsFor([5, 6, 7, 8, 9], 5)).toBe(35);
    expect(ticketsFor([5], 5)).toBe(5);
    expect(ticketsFor([5, 5, 5], 5)).toBe(15);
  });
  it("ignores pieces below the line", () => {
    expect(ticketsFor([1, 2, 3, 4], 5)).toBe(0);
    expect(ticketsFor([1, 2, 3, 4, 5, 6], 5)).toBe(11);
  });
});

describe("numberTickets", () => {
  it("numbers ranges from 1 in address order, touching, without gaps", () => {
    const es = numberTickets([
      { wallet: "0xbb00000000000000000000000000000000000000", depths: [6], tickets: 6 },
      { wallet: "0xAA00000000000000000000000000000000000000", depths: [5, 9], tickets: 14 },
      { wallet: "0xcc00000000000000000000000000000000000000", depths: [], tickets: 0 },
    ]);
    expect(es.map((e) => [e.wallet.slice(0, 4), e.from, e.to])).toEqual([
      ["0xAA", 1, 14],
      ["0xbb", 15, 20],
    ]);
    expect(validateEntries(es)).toBe(20);
  });
});

describe("ownerOfTicket", () => {
  const es = list([5, 9, 6]);
  it("maps every ticket to the wallet whose range holds it", () => {
    expect(ownerOfTicket(es, 1)!.tickets).toBe(5);
    expect(ownerOfTicket(es, 5)!.tickets).toBe(5);
    expect(ownerOfTicket(es, 6)!.tickets).toBe(9);
    expect(ownerOfTicket(es, 14)!.tickets).toBe(9);
    expect(ownerOfTicket(es, 15)!.tickets).toBe(6);
    expect(ownerOfTicket(es, 20)!.tickets).toBe(6);
  });
  it("finds nothing outside the ranges", () => {
    expect(ownerOfTicket(es, 0)).toBeUndefined();
    expect(ownerOfTicket(es, 21)).toBeUndefined();
  });
});

describe("validateEntries", () => {
  it("refuses gaps, wrong counts and a wallet listed twice", () => {
    const gap = list([5, 6]);
    gap[1] = { ...gap[1]!, from: 7, to: 12 };
    expect(() => validateEntries(gap)).toThrow();
    const count = list([5, 6]);
    count[1] = { ...count[1]!, tickets: 7 };
    expect(() => validateEntries(count)).toThrow();
    const twice = list([5, 6]);
    twice[1] = { ...twice[1]!, wallet: twice[0]!.wallet.toUpperCase().replace("0X", "0x") };
    expect(() => validateEntries(twice)).toThrow();
  });
});

describe("drawWinners", () => {
  it("is the same every time for the same seed", () => {
    const es = list([5, 6, 7, 8, 9, 5, 5, 6, 6, 7, 9, 5, 6, 5]);
    expect(drawWinners(es, seed(1), 10)).toEqual(drawWinners(es, seed(1), 10));
  });

  it("never gives one wallet two prizes", () => {
    const es = list([35, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    for (let s = 0; s < 200; s++) {
      const w = drawWinners(es, seed(s), 10).map((x) => x.wallet);
      expect(new Set(w).size).toBe(10);
    }
  });

  it("gives every wallet a prize when there are no more wallets than prizes", () => {
    const es = list([5, 9, 6]);
    expect(drawWinners(es, seed(3), 10).map((w) => w.wallet).sort()).toEqual(es.map((e) => e.wallet).sort());
  });

  it("each winning ticket really belongs to the wallet named", () => {
    const es = list([5, 6, 7, 8, 9, 5, 6]);
    for (const w of drawWinners(es, seed(9), 5)) {
      expect(ownerOfTicket(es, w.ticket)!.wallet).toBe(w.wallet);
      expect(w.ticket).toBe(ticketFor(seed(9), w.place - 1, w.attempt, 46));
    }
  });

  it("a wallet with more tickets wins proportionally more often", () => {
    // A full Inferno-to-Riptide set (35 tickets) against a single Inferno (5), one prize.
    const es = list([35, 5]);
    let big = 0;
    const N = 4000;
    for (let s = 0; s < N; s++) if (drawWinners(es, seed(s), 1)[0]!.tickets === 35) big++;
    expect(big / N).toBeGreaterThan(35 / 40 - 0.03);
    expect(big / N).toBeLessThan(35 / 40 + 0.03);
  });
});

describe("shuffle (ticket numbers)", () => {
  it("is a bijection on 1..total, and its inverse undoes it", () => {
    for (const total of [1, 2, 3, 7, 16, 17, 100, 1000, 3830]) {
      const s = seed(total);
      const seen = new Set<number>();
      for (let p = 1; p <= total; p++) {
        const n = numberOfPlace(p, total, s);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(total);
        expect(placeOfNumber(n, total, s)).toBe(p);
        seen.add(n);
      }
      expect(seen.size).toBe(total);
    }
  });

  it("scatters a wallet's run instead of keeping it in one block", () => {
    const es = list([33, 500, 500]);
    const nums = numbersOf(es[0]!, 1033, seed(9));
    expect(nums).toHaveLength(33);
    expect(nums[nums.length - 1]! - nums[0]!).toBeGreaterThan(500);
  });

  it("draws by number, and each winning number belongs to its winner", () => {
    const es = list([14, 5, 21, 6, 8]);
    const ns = seed(42);
    const ws = drawWinners(es, seed(7), 3, ns);
    expect(new Set(ws.map((w) => w.wallet)).size).toBe(3);
    for (const w of ws) {
      expect(ownerOfTicket(es, w.ticket, ns)!.wallet).toBe(w.wallet);
      expect(numbersOf(ownerOfTicket(es, w.ticket, ns)!, 54, ns)).toContain(w.ticket);
    }
  });
});
