import { describe, expect, it } from "vitest";
import { bundledArtworkFor, soleArtworkFor } from "@/config/covers";

const CYBEREATOR = "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30";
const SEALED = "ipfs://bafybeiexxwgg46ucafzx4fpesmobil45cwrspb34pefegnpzz5qux762p4";

/**
 * Cybereator reveals from 10 November 2026: each holder's piece gets its own
 * artwork at the same token URI. Showing one shared picture for the whole
 * collection would hide every reveal, so only the sealed picture may be
 * swapped for our copy.
 */
describe("Cybereator artwork across the reveal", () => {
  it("does not force one picture onto the whole collection", () => {
    expect(soleArtworkFor(CYBEREATOR)).toBeUndefined();
  });

  it("still serves our fast copy for a sealed piece", () => {
    expect(bundledArtworkFor(SEALED)).toBe("/boxes/cybereator.webp");
    expect(bundledArtworkFor("https://ipfs.filebase.io/ipfs/bafybeiexxwgg46ucafzx4fpesmobil45cwrspb34pefegnpzz5qux762p4")).toBe(
      "/boxes/cybereator.webp",
    );
  });

  it("leaves a revealed piece's own artwork alone", () => {
    expect(bundledArtworkFor("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).toBeUndefined();
  });
});
