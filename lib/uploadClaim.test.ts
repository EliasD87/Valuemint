import { describe, expect, it } from "vitest";
import { contentDigest, fileHash } from "./uploadClaim";

/**
 * The digest is a security control: it is what binds a wallet signature to one
 * specific upload, so a captured signature cannot be replayed against different
 * files.
 *
 * It did not have that property until recently. It hashed `name:size` pairs, so
 * any file with a matching name and byte length satisfied it — and a same-sized
 * image is trivial to produce. The tests below are written around that failure.
 */

const bytes = (s: string) => new TextEncoder().encode(s);

describe("fileHash", () => {
  it("is stable for identical bytes", async () => {
    expect(await fileHash(bytes("hello"))).toBe(await fileHash(bytes("hello")));
  });

  it("changes when a single byte changes", async () => {
    expect(await fileHash(bytes("hello"))).not.toBe(await fileHash(bytes("hellp")));
  });

  it("accepts an ArrayBuffer and a Uint8Array identically", async () => {
    const u8 = bytes("same either way");
    expect(await fileHash(u8)).toBe(await fileHash(u8.slice().buffer));
  });

  it("hashes only the view, not the whole backing buffer", async () => {
    // A Uint8Array can be a window onto a larger buffer. Hashing the buffer
    // rather than the view would fold in bytes that are not part of the file.
    const backing = bytes("PREFIX-payload-SUFFIX");
    const view = new Uint8Array(backing.buffer, 7, 7); // "payload"
    expect(await fileHash(view)).toBe(await fileHash(bytes("payload")));
  });
});

describe("contentDigest", () => {
  const config = '{"collectionName":"Test","seed":"abc"}';

  it("is stable for the same config and files", async () => {
    const files = [
      { name: "a.png", hash: await fileHash(bytes("A")) },
      { name: "b.png", hash: await fileHash(bytes("B")) },
    ];
    expect(await contentDigest(config, files)).toBe(await contentDigest(config, files));
  });

  it("does not depend on file order", async () => {
    // FormData ordering is not guaranteed across the wire, so the two sides
    // would otherwise disagree for reasons unrelated to the content.
    const a = { name: "a.png", hash: await fileHash(bytes("A")) };
    const b = { name: "b.png", hash: await fileHash(bytes("B")) };
    expect(await contentDigest(config, [a, b])).toBe(await contentDigest(config, [b, a]));
  });

  it("changes when the config changes", async () => {
    const files = [{ name: "a.png", hash: await fileHash(bytes("A")) }];
    expect(await contentDigest(config, files)).not.toBe(
      await contentDigest('{"collectionName":"Other","seed":"abc"}', files),
    );
  });

  /**
   * The bug this replaced. Both files are named `a.png` and are exactly one
   * byte long; under the old `name:size` scheme these produced an identical
   * digest, so one signature authorised either.
   */
  it("distinguishes same-name, same-size files with different content", async () => {
    const original = [{ name: "a.png", hash: await fileHash(bytes("A")) }];
    const swapped = [{ name: "a.png", hash: await fileHash(bytes("Z")) }];
    expect(await contentDigest(config, original)).not.toBe(await contentDigest(config, swapped));
  });

  it("distinguishes a renamed file", async () => {
    const h = await fileHash(bytes("A"));
    expect(await contentDigest(config, [{ name: "a.png", hash: h }])).not.toBe(
      await contentDigest(config, [{ name: "b.png", hash: h }]),
    );
  });

  it("distinguishes a file being added", async () => {
    const a = { name: "a.png", hash: await fileHash(bytes("A")) };
    const b = { name: "b.png", hash: await fileHash(bytes("B")) };
    expect(await contentDigest(config, [a])).not.toBe(await contentDigest(config, [a, b]));
  });
});
