import { describe, expect, it } from "vitest";
import { proxiedDocUrl, proxyableDoc } from "./docProxy";

/**
 * `/api/doc` fetches on the server whatever this allows, so the allow-list is
 * the whole of its defence against being used to reach anything else.
 */
describe("proxyableDoc", () => {
  it("allows SoDEX's gateway and the IPFS gateways over https", () => {
    expect(proxyableDoc("https://mainnet-gw.sodex.dev/api/v1/nft/token/cybr/337")).toBe(true);
    expect(proxyableDoc("https://ipfs.filebase.io/ipfs/QmX/1.json")).toBe(true);
  });

  it("refuses everything else", () => {
    for (const url of [
      "http://mainnet-gw.sodex.dev/api/v1/nft/token/cybr/337",
      "https://mainnet-gw.sodex.dev.evil.example/x",
      "https://evil.example/mainnet-gw.sodex.dev",
      "https://user:pass@mainnet-gw.sodex.dev/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "ipfs://QmX",
      "data:application/json,{}",
      "not a url",
    ]) {
      expect(proxyableDoc(url), url).toBe(false);
    }
  });

  it("builds a relative route address only for allowed documents", () => {
    expect(proxiedDocUrl("https://mainnet-gw.sodex.dev/a?b=c")).toBe(
      "/api/doc?url=https%3A%2F%2Fmainnet-gw.sodex.dev%2Fa%3Fb%3Dc",
    );
    expect(proxiedDocUrl("https://evil.example/x")).toBeUndefined();
  });
});
