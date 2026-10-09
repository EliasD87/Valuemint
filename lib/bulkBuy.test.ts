import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Hex, type Log } from "viem";
import { SEAPORT, SeaportAbi } from "@/config/seaport";
import { boughtNote, countBought, goneNote, skippedNote } from "./bulkBuy";

const A = `0x${"a1".repeat(32)}` as Hex;
const B = `0x${"b2".repeat(32)}` as Hex;
const C = `0x${"c3".repeat(32)}` as Hex;
const OFFERER = "0x1111111111111111111111111111111111111111" as const;
const BUYER = "0x2222222222222222222222222222222222222222" as const;

/** An `OrderFulfilled` log as Seaport emits it, from `address`. */
function fulfilled(orderHash: Hex, address: `0x${string}` = SEAPORT): Log {
  const topics = encodeEventTopics({
    abi: SeaportAbi,
    eventName: "OrderFulfilled",
    args: { offerer: OFFERER, zone: "0x0000000000000000000000000000000000000000" },
  });
  const data = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "address" },
      { type: "tuple[]", components: [{ type: "uint8" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }] },
      {
        type: "tuple[]",
        components: [{ type: "uint8" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
      },
    ],
    [orderHash, BUYER, [], []],
  );
  return { address, topics, data, blockNumber: 1n, blockHash: A, logIndex: 0, transactionHash: A, transactionIndex: 0, removed: false } as unknown as Log;
}

describe("countBought", () => {
  it("counts each of the buyer's orders Seaport filled", () => {
    expect(countBought([fulfilled(A), fulfilled(B)], [A, B, C])).toBe(2);
  });

  it("ignores an order it was not sent, and a log from anything but Seaport", () => {
    expect(countBought([fulfilled(C), fulfilled(A, OFFERER)], [A, B])).toBe(0);
  });

  it("counts an order once however many logs mention it", () => {
    expect(countBought([fulfilled(A), fulfilled(A)], [A])).toBe(1);
  });
});

describe("the notes", () => {
  it("say nothing when nothing went missing", () => {
    expect(goneNote(0)).toBeUndefined();
    expect(skippedNote(5, 5)).toBeUndefined();
    expect(boughtNote(5, 5)).toBeUndefined();
  });

  it("say how many someone else got, and that it cost nothing", () => {
    expect(boughtNote(5, 3)).toBe(
      "You got 3 pieces of 5. Someone else got the other 2 first, and you were not charged for them.",
    );
    expect(boughtNote(5, 4)).toContain("the other one first, and you were not charged for it.");
    expect(skippedNote(5, 3)).toBe("2 of your picks have just gone to someone else, so this buys the other 3.");
    expect(goneNote(1)).toContain("1 of your picks was just bought by someone else");
  });

  it("never use an em dash, which the owner does not want in copy", () => {
    for (const s of [goneNote(2), skippedNote(4, 1), boughtNote(3, 1)]) expect(s).not.toContain("—");
  });
});
