import { describe, expect, it } from "vitest";
import { searchResults } from "./search";

/** What a query turns into (2026-10-09). No chain, no metadata: names and numbers only. */

const BOX = { address: "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750", name: "SoDEXTreasureBox", symbol: "SOBOX" } as const;
const GENESIS = { address: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B", name: "ValueChain Genesis", symbol: "VCG" } as const;
const LAYER = { address: "0x1111111111111111111111111111111111111111", name: "Layer 1", symbol: "L1" } as const;
const ALL = [BOX, GENESIS, LAYER];

const hrefs = (q: string) => {
  const r = searchResults(ALL, q);
  return Array.isArray(r) ? r.map((x) => x.href) : r.hint;
};

describe("searchResults", () => {
  it("finds a collection by any part of its name, spaces and case aside", () => {
    expect(hrefs("treasure box")).toEqual([`/collection/${BOX.address}`]);
    expect(hrefs("genesis")).toEqual([`/collection/${GENESIS.address}`]);
  });

  it("finds one by its symbol", () => {
    expect(hrefs("vcg")).toEqual([`/collection/${GENESIS.address}`]);
  });

  it("opens a piece from a name and a number", () => {
    expect(hrefs("treasure 79565")).toEqual([`/token/${BOX.address}/79565`]);
    expect(hrefs("genesis #45")).toEqual([`/token/${GENESIS.address}/45`]);
  });

  it("reads a name with a number in it as a name first", () => {
    expect(hrefs("layer 1")).toEqual([`/collection/${LAYER.address}`]);
  });

  it("asks for a name when given only a number", () => {
    expect(hrefs("#79565")).toContain("Add the collection's name");
  });

  it("opens a known collection's address as the collection, and offers the wallet too", () => {
    expect(hrefs(GENESIS.address.toLowerCase())).toEqual([
      `/collection/${GENESIS.address}`,
      `/address/${GENESIS.address.toLowerCase()}`,
    ]);
  });

  it("offers an unknown address as a wallet first", () => {
    const addr = "0x0879A87D6D1Ea21C902946F2dAf80a7FAD77BC84";
    expect(hrefs(addr)).toEqual([`/address/${addr}`, `/collection/${addr}`]);
  });

  it("says so when an address is the wrong length, or nothing matches", () => {
    expect(hrefs("0x1234")).toContain("40 hex characters");
    expect(hrefs("zzzz")).toContain("No collection matches");
  });
});
