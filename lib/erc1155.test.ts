import { describe, expect, it } from "vitest";
import { expandIdTemplate } from "./erc1155";

/**
 * EIP-1155's `{id}` substitution rule, which is specific and easy to get wrong.
 *
 * The spec requires lowercase hex, zero-padded to 64 characters, with no `0x`
 * prefix. Every plausible shortcut - decimal, unpadded hex, uppercase, keeping
 * the prefix - produces a URL that 404s, and the only symptom is a token that
 * renders without artwork, which reads as a broken collection rather than a
 * broken client.
 *
 * There is no live collection to check this against: the one ERC-1155 on
 * ValueChain with holders, Trading Beasts, points `uri()` at
 * api.tradingbeasts.xyz, and that host does not resolve. So the rule is pinned
 * here instead.
 */
describe("expandIdTemplate", () => {
  it("pads to 64 lowercase hex characters with no prefix", () => {
    expect(expandIdTemplate("https://x.example/{id}.json", 1n)).toBe(
      "https://x.example/0000000000000000000000000000000000000000000000000000000000000001.json",
    );
  });

  it("uses hex, not decimal", () => {
    const out = expandIdTemplate("{id}", 255n);
    expect(out.endsWith("ff")).toBe(true);
    expect(out.endsWith("255")).toBe(false);
  });

  it("lowercases the hex", () => {
    expect(expandIdTemplate("{id}", 0xabcdefn)).toBe("abcdef".padStart(64, "0"));
  });

  it("handles a large id without losing precision", () => {
    // Bigger than Number.MAX_SAFE_INTEGER, which is why ids are bigint here.
    const big = 123456789012345678901234567890n;
    expect(expandIdTemplate("{id}", big)).toBe(big.toString(16).padStart(64, "0"));
  });

  it("replaces every occurrence, not just the first", () => {
    const out = expandIdTemplate("{id}/{id}", 1n);
    expect(out.split("/")[0]).toBe(out.split("/")[1]);
    expect(out).not.toContain("{id}");
  });

  it("leaves a template-free URI untouched", () => {
    // Plenty of collections return a finished URL per token, the ERC-721 way.
    const plain = "ipfs://QmSomething/7.json";
    expect(expandIdTemplate(plain, 7n)).toBe(plain);
  });

  it("returns id 0 as sixty-four zeroes", () => {
    expect(expandIdTemplate("{id}", 0n)).toBe("0".repeat(64));
  });
});
