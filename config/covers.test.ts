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
});
