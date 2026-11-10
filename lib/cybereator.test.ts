import { describe, expect, it } from "vitest";
import {
  CYBEREATOR_UNOPENED_GIF,
  cybereatorDocPattern,
  cybereatorStatus,
  cybereatorThumb,
  isCybereatorDoc,
} from "./cybereator";
import { bundledArtworkFor, thumbnailFor } from "@/config/covers";

/** The examples are the shapes in Cybereator's integration notes (2026-11-10). */
const UNOPENED = {
  name: "CybeReator #1",
  image: CYBEREATOR_UNOPENED_GIF,
  attributes: [{ trait_type: "Status", value: "Unopened" }],
};
const OPENED = {
  name: "CybeReator #123",
  image: "https://cybereator.oss-ap-northeast-1.aliyuncs.com/286623/0x8f26671664ad6940df88e70f77a6d24b20c79a15/images/123.png",
  attributes: [
    { trait_type: "Race", value: "X" },
    { trait_type: "Hair", value: "Bald" },
  ],
};

describe("Cybereator status", () => {
  it("reads Unopened, Opening and Rendering, and nothing once revealed", () => {
    expect(cybereatorStatus(UNOPENED)).toBe("Unopened");
    expect(cybereatorStatus({ attributes: [{ trait_type: "Status", value: "Rendering" }] })).toBe("Rendering");
    expect(cybereatorStatus(OPENED)).toBeUndefined();
    expect(cybereatorStatus(null)).toBeUndefined();
  });
});

describe("Cybereator artwork", () => {
  it("serves the sealed GIF at its new address from our own copy", () => {
    expect(bundledArtworkFor(CYBEREATOR_UNOPENED_GIF)).toBe("/boxes/cybereator.webp");
  });

  it("gives lists the 512px WebP thumbnail of a revealed piece", () => {
    /* From their CDN, whichever address the metadata gives the full picture at. */
    const thumb = "https://cyber-static.cybereator.com/286623/0x8f26671664ad6940df88e70f77a6d24b20c79a15/thumbs/123.webp";
    expect(cybereatorThumb(OPENED.image)).toBe(thumb);
    expect(cybereatorThumb(OPENED.image.replace("cybereator.oss-ap-northeast-1.aliyuncs.com", "cyber-static.cybereator.com"))).toBe(thumb);
    expect(thumbnailFor(OPENED.image)).toBe(cybereatorThumb(OPENED.image));
  });

  it("leaves every other image alone", () => {
    expect(cybereatorThumb(CYBEREATOR_UNOPENED_GIF)).toBeUndefined();
    expect(cybereatorThumb("https://example.com/images/123.png")).toBeUndefined();
    expect(bundledArtworkFor(OPENED.image)).toBeUndefined();
  });
});

describe("Cybereator documents", () => {
  it("knows cybereator.com metadata from any other URL", () => {
    expect(isCybereatorDoc("https://cybereator.com/metadata/1")).toBe(true);
    expect(isCybereatorDoc("https://cybereator.com/metadata/1/../x")).toBe(false);
    expect(isCybereatorDoc("https://mainnet-gw.sodex.dev/api/v1/nft/token/cybr/1")).toBe(false);
  });

  it("matches one token's document on either host, and never a longer id", () => {
    const twelve = cybereatorDocPattern(12n);
    expect(twelve.test('["token-metadata","https://cybereator.com/metadata/12"]')).toBe(true);
    expect(twelve.test('["token-metadata","https://mainnet-gw.sodex.dev/api/v1/nft/token/cybr/12"]')).toBe(true);
    expect(twelve.test('["token-metadata","https://cybereator.com/metadata/123"]')).toBe(false);
  });
});

describe("image addresses without a scheme", () => {
  it("adds https:// to a bare host, as cybereator.com served on 2026-11-10", async () => {
    const { withScheme, readTokenMetadata } = await import("./tokenMetadata");
    expect(withScheme("cybereator.oss-ap-northeast-1.aliyuncs.com/images/unopened-v4.png")).toBe(
      "https://cybereator.oss-ap-northeast-1.aliyuncs.com/images/unopened-v4.png",
    );
    expect(readTokenMetadata({ name: "CybeReator #1", image: "cybereator.oss-ap-northeast-1.aliyuncs.com/images/x.png" })?.image).toBe(
      "https://cybereator.oss-ap-northeast-1.aliyuncs.com/images/x.png",
    );
  });

  it("leaves schemes and relative paths alone", async () => {
    const { withScheme } = await import("./tokenMetadata");
    expect(withScheme("ipfs://bafy/1.png")).toBe("ipfs://bafy/1.png");
    expect(withScheme("https://a.b/c.png")).toBe("https://a.b/c.png");
    expect(withScheme("/boxes/x.webp")).toBe("/boxes/x.webp");
    expect(withScheme("images/1.png")).toBe("images/1.png");
    expect(withScheme("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
  });
});

describe("serving Cybereator's images from their CDN", () => {
  it("rewrites the bucket to the CDN, same path, and leaves everything else alone", async () => {
    const { cachedArtwork, bundledArtworkFor: bundled } = await import("@/config/covers");
    const path = "286623/0x8f26671664ad6940df88e70f77a6d24b20c79a15/images/123.png";
    expect(cachedArtwork(`https://cybereator.oss-ap-northeast-1.aliyuncs.com/${path}`)).toBe(
      `https://cyber-static.cybereator.com/${path}`,
    );
    expect(cachedArtwork(`https://cyber-static.cybereator.com/${path}`)).toBe(`https://cyber-static.cybereator.com/${path}`);
    /* The sealed GIF is our local copy at either address. */
    expect(bundled("https://cybereator.oss-ap-northeast-1.aliyuncs.com/images/unopened-v5.gif")).toBe("/boxes/cybereator.webp");
    expect(bundled("https://cyber-static.cybereator.com/images/unopened-v5.gif")).toBe("/boxes/cybereator.webp");
    expect(cachedArtwork("https://ipfs.filebase.io/ipfs/bafy/1.png")).toBe("https://ipfs.filebase.io/ipfs/bafy/1.png");
    expect(cachedArtwork("/boxes/cybereator.webp")).toBe("/boxes/cybereator.webp");
    expect(cachedArtwork(undefined)).toBeUndefined();
  });
});
