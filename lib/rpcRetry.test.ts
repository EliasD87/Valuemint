import { describe, expect, it } from "vitest";
import { ContractFunctionRevertedError, RpcRequestError } from "viem";
import { isRevert, isTransientRpcError, withRpcRetry } from "./rpcRetry";

/** The exact failure the criteria route logged on 2026-10-13. */
const missingTrie = () =>
  new RpcRequestError({
    body: { method: "eth_getStorageAt" },
    url: "https://rpc.valuechain.xyz",
    error: {
      code: -32014,
      message:
        "missing trie node ea920c32a364b92c6b4528b4792a22d23d333992e8da2c316473fc186a580ed0 (path ) state 0xea920c32a364b92c6b4528b4792a22d23d333992e8da2c316473fc186a580ed0 is not available",
    },
  });

const reverted = () =>
  new ContractFunctionRevertedError({ abi: [], functionName: "baseURI", message: "execution reverted" });

describe("isTransientRpcError", () => {
  it("treats a node missing state as transient", () => {
    expect(isTransientRpcError(missingTrie())).toBe(true);
  });

  it("treats it as transient when wrapped, as readContract wraps it", () => {
    const wrapped = new Error("RPC Request failed.", { cause: missingTrie() });
    expect(isTransientRpcError(Object.assign(wrapped, { details: missingTrie().details }))).toBe(true);
  });

  it("treats an exhausted upstream pool as transient", () => {
    expect(isTransientRpcError(new Error("all upstream attempts failed (2 upstream missing data)"))).toBe(true);
  });

  it("never retries a revert: the contract answered", () => {
    expect(isRevert(reverted())).toBe(true);
    expect(isTransientRpcError(reverted())).toBe(false);
    expect(isTransientRpcError(new Error("execution reverted"))).toBe(false);
  });

  it("does not retry ordinary programming errors", () => {
    expect(isTransientRpcError(new TypeError("x is undefined"))).toBe(false);
  });
});

describe("withRpcRetry", () => {
  it("asks again after a node failure and returns the answer", async () => {
    let calls = 0;
    const out = await withRpcRetry(
      async () => {
        calls++;
        if (calls < 3) throw missingTrie();
        return "ok";
      },
      { delays: [0, 0] },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("passes the attempt number, so a caller can vary the request", async () => {
    const seen: number[] = [];
    await withRpcRetry(
      async (attempt) => {
        seen.push(attempt);
        if (attempt === 0) throw missingTrie();
        return 1;
      },
      { delays: [0] },
    );
    expect(seen).toEqual([0, 1]);
  });

  it("gives up after the last delay and throws the node's error", async () => {
    let calls = 0;
    await expect(
      withRpcRetry(
        async () => {
          calls++;
          throw missingTrie();
        },
        { delays: [0, 0] },
      ),
    ).rejects.toBeInstanceOf(RpcRequestError);
    expect(calls).toBe(3);
  });

  it("does not retry a revert", async () => {
    let calls = 0;
    await expect(
      withRpcRetry(
        async () => {
          calls++;
          throw reverted();
        },
        { delays: [0, 0] },
      ),
    ).rejects.toBeInstanceOf(ContractFunctionRevertedError);
    expect(calls).toBe(1);
  });
});
