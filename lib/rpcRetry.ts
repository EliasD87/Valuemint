import { BaseError, ContractFunctionRevertedError, HttpRequestError, TimeoutError } from "viem";

/**
 * Telling an RPC node's trouble apart from an answer.
 *
 * `rpc.valuechain.xyz` balances requests over several nodes. On 2026-10-13 the
 * criteria route went from ~4% to 100% errors because a read at "latest"
 * reached nodes whose newest block's state was not stored yet:
 *
 *   missing trie node … state 0x… is not available   (code -32014,
 *   ErrUpstreamsExhausted: "2 upstream missing data")
 *
 * That is not the contract saying anything, and asking again a moment later,
 * or of another node, succeeds. A revert IS an answer (the function does not
 * exist, the token is not minted) and asking again changes nothing.
 */

const TRANSIENT =
  /missing trie node|is not available|ErrUpstreams|upstream|header not found|unknown block|-32014|timed? ?out|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|rate limit|too many requests/i;

const text = (err: unknown): string => {
  if (err === null || err === undefined) return "";
  if (typeof err !== "object") return String(err);
  const e = err as { message?: unknown; details?: unknown; code?: unknown; shortMessage?: unknown };
  return [e.shortMessage, e.message, e.details, e.code].filter((x) => x !== undefined).join(" ");
};

/** The contract refused: a real answer, never worth retrying. */
export function isRevert(err: unknown): boolean {
  if (err instanceof BaseError && err.walk((e) => e instanceof ContractFunctionRevertedError) !== null) return true;
  return /execution reverted/i.test(text(err));
}

/** The node or the network failed, not the contract: worth asking again. */
export function isTransientRpcError(err: unknown): boolean {
  if (isRevert(err)) return false;
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError) !== null) return true;
    let found = false;
    err.walk((e) => {
      if (TRANSIENT.test(text(e))) found = true;
      return false;
    });
    if (found) return true;
  }
  return TRANSIENT.test(text(err));
}

/**
 * Run `fn`, asking again after a pause when the failure is the node's, not the
 * contract's. `attempt` (0, 1, 2…) lets a caller vary what it asks for.
 */
export async function withRpcRetry<T>(
  fn: (attempt: number) => Promise<T>,
  { delays = [400, 1200] as readonly number[] } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= delays.length || !isTransientRpcError(err)) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}
