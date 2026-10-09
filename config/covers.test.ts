import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledArtworkFor } from "@/config/covers";

const COMMON = "bafybeibltyk5zokqdookfnccsfcoebl3qzp4gkx45bhtgrllm2t23kp67u";

describe("bundledArtworkFor", () => {
  it("finds a Treasure Box picture however the metadata spells it", () => {
    for (const spelling of [
      `ipfs://${COMMON}`,
      `ipfs://ipfs/${COMMON}`,
      `https://gateway.pinata.cloud/ipfs/${COMMON}`,
      `https://ipfs.io/ipfs/${COMMON}/`,
    ]) {
      expect(bundledArtworkFor(spelling)).toBe("/boxes/sobox/common.webp");
    }
  });

  it("leaves every other picture alone", () => {
    expect(bundledArtworkFor(undefined)).toBeUndefined();
    expect(bundledArtworkFor("https://gateway.pinata.cloud/ipfs/bafybeisomethingelse")).toBeUndefined();
    // A file inside a known CID is a different picture, not this one.
    expect(bundledArtworkFor(`ipfs://${COMMON}/2.png`)).toBeUndefined();
    expect(bundledArtworkFor(`https://gateway.pinata.cloud/ipfs/${COMMON}/2.png`)).toBeUndefined();
  });

  it("answers from the box's metadata URI before its document arrives", () => {
    const uri = "https://mainnet-gw.sodex.dev/api/v1/nft/token/sobox/3";
    expect(bundledArtworkFor(undefined, uri)).toBe("/boxes/sobox/superrare.webp");
    // Once the document is in, its image decides, not the URI.
    expect(bundledArtworkFor("https://gateway.pinata.cloud/ipfs/bafybeisomethingelse", uri)).toBeUndefined();
    expect(bundledArtworkFor(undefined, "https://mainnet-gw.sodex.dev/api/v1/nft/token/cybr/7")).toBeUndefined();
  });

  it("only points at files that ship with the site", () => {
    for (const level of ["common", "uncommon", "rare", "superrare"]) {
      expect(existsSync(join(process.cwd(), "public/boxes/sobox", `${level}.webp`))).toBe(true);
    }
  });

  it("serves Wickborn's five minted GIFs from our own files, by their Filebase address", () => {
    const designs: Record<string, string> = {
      QmXFQmpCF9UwhVx3QxP1E5xBD2Np3ktJEQfTwLvWm4GUh7: "the-dealer",
      QmTkyK6WUPSZUL2ejqFoKMzdAP93mqp2pybUXKJztMwAZM: "margin-call",
      QmQ4NbyjgsjPCU8fZeYiYLxws3rcj1tW9Hs55Qb44gXQZK: "jade-ledger",
      QmRDuLqGZUobVkNV2GBW1G7wWdYdVSAmsfvrqK74ikoMJE: "golden-cross",
      QmUFdDAYnxA9fE9G7B4hyPzEyY7VRHJrbhrREqnZaceCiM: "ghost-liquidity",
    };
    for (const [cid, slug] of Object.entries(designs)) {
      const local = `/art/wickborn/${slug}.gif`;
      expect(bundledArtworkFor(`https://ipfs.filebase.io/ipfs/${cid}`)).toBe(local);
      expect(bundledArtworkFor(`ipfs://${cid}/`)).toBe(local);
      expect(existsSync(join(process.cwd(), "public", local))).toBe(true);
    }
  });
});
