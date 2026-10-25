import { erc20Abi, erc721Abi, type ContractFunctionParameters, type Hex, type PublicClient } from "viem";
import { SEAPORT, SeaportAbi } from "@/config/seaport";
import { ItemType, type ChainAnswer, type OrderParameters, type ReadOrder } from "@/lib/seaport";

/**
 * The questions that decide whether an order can be filled, in one place for
 * the browser and the server (2026-10-25).
 *
 * The order book asks two things of every order besides Seaport's own status:
 * for a listing, who holds the token and whether that holder lets Seaport move
 * it; for a bid, the bidder's WSOSO balance and allowance. Every browser used
 * to ask all of them itself before it drew a single card on /market, and on a
 * slow node that was 6-22 seconds of an empty grid.
 *
 * Now `/api/index/orders` asks them once per cache refresh and sends the
 * answers with the book, so a page can draw at once. The browser still asks
 * for itself and its own answers replace the server's the moment they land;
 * the server's are a head start, never the last word, and nothing is bought
 * on them — the fill path checks the chain again before the wallet opens.
 *
 * Both sides build the questions here so they cannot drift apart: the answers
 * are matched by key, and a key the browser builds differently from the
 * server's would silently never match.
 */

/** ERC-1155 has no `ownerOf`; a holding is a balance. */
export const erc1155BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface CheckTarget {
  hash: Hex;
  params: OrderParameters;
  read: ReadOrder;
}

export interface FillabilityQuestions {
  /** Each distinct question once, ready for a multicall. */
  reads: ContractFunctionParameters[];
  /** The key of each entry in `reads`, at the same index. */
  keys: string[];
  /** Each order's two questions, by lower-cased hash: their places in `reads`. */
  slots: Map<string, [number, number]>;
}

/**
 * Two questions per order, each asked once however many orders share it.
 *
 * Approval is per seller and collection, not per listing, and a bidder's
 * balance is per bidder and currency, so most orders share at least one
 * question with another (504 listings came to 195 distinct approvals on
 * 2026-09-30).
 */
export function fillabilityQuestions(candidates: readonly CheckTarget[]): FillabilityQuestions {
  const reads: ContractFunctionParameters[] = [];
  const keys: string[] = [];
  const asked = new Map<string, number>();
  const ask = (key: string, read: ContractFunctionParameters) => {
    const known = asked.get(key);
    if (known !== undefined) return known;
    reads.push(read);
    keys.push(key);
    asked.set(key, reads.length - 1);
    return reads.length - 1;
  };
  const slots = new Map<string, [number, number]>();

  for (const { read: o, params, hash } of candidates) {
    const maker = o.maker.toLowerCase();
    let first: number;
    let second: number;
    if (o.kind === "listing") {
      const isMulti = params.offer[0]?.itemType === ItemType.ERC1155;
      const token = o.tokenId ?? 0n;
      const collection = o.collection.toLowerCase();
      first = isMulti
        ? ask(`balance1155:${collection}:${maker}:${token}`, {
            address: o.collection,
            abi: erc1155BalanceAbi,
            functionName: "balanceOf" as const,
            args: [o.maker, token],
          })
        : ask(`owner:${collection}:${token}`, {
            address: o.collection,
            abi: erc721Abi,
            functionName: "ownerOf" as const,
            args: [token],
          });
      second = ask(`approval:${collection}:${maker}`, {
        address: o.collection,
        abi: erc721Abi,
        functionName: "isApprovedForAll" as const,
        args: [o.maker, SEAPORT],
      });
    } else {
      /**
       * A bid is only real while the money is. A bidder who spent or unwrapped
       * their WSOSO leaves an offer a holder can accept, pay gas for, and watch
       * revert — which is worse than the offer never showing at all.
       */
      const currency = o.currency.toLowerCase();
      first = ask(`balance20:${currency}:${maker}`, {
        address: o.currency,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [o.maker],
      });
      second = ask(`allowance:${currency}:${maker}`, {
        address: o.currency,
        abi: erc20Abi,
        functionName: "allowance" as const,
        args: [o.maker, SEAPORT],
      });
    }
    slots.set(hash.toLowerCase(), [first, second]);
  }
  return { reads, keys, slots };
}

/* ----------------------------------------------------------------- wire */

/** Seaport's `getOrderStatus`: validated, cancelled, filled, size. */
export type OrderStatus = [boolean, boolean, bigint, bigint];

/**
 * The server's answers as JSON. Bigints travel as decimal strings; a question
 * the chain refused travels as `null`, so it reads as refused rather than as
 * never asked.
 */
export interface WireChecks {
  /** When the server asked, so a reader can tell how old the head start is. */
  at: string;
  status: Record<string, [boolean, boolean, string, string]>;
  reads: Record<string, string | boolean | null>;
}

/** The server's answers, decoded back into what the order book reads. */
export interface ServerChecks {
  at: number;
  status: Map<string, OrderStatus>;
  reads: Map<string, ChainAnswer>;
}

/** Which questions answer with a number; the rest are an address or a yes/no. */
const NUMERIC = ["balance1155:", "balance20:", "allowance:"];

function encodeAnswer(answer: { status: string; result?: unknown } | undefined): string | boolean | null {
  if (answer?.status !== "success") return null;
  const value = answer.result;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean" || typeof value === "string") return value;
  return null;
}

/**
 * Decoded strictly by the key's own kind, never by guessing from the value:
 * a balance must come back a bigint, an owner an address, an approval a
 * boolean. Anything else is a refused answer, which `resolveFillable` treats
 * as not fillable.
 */
function decodeAnswer(key: string, value: unknown): ChainAnswer {
  if (value === null || value === undefined) return { status: "failure" };
  if (NUMERIC.some((p) => key.startsWith(p))) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return { status: "failure" };
    return { status: "success", result: BigInt(value) };
  }
  if (key.startsWith("owner:")) {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return { status: "failure" };
    return { status: "success", result: value };
  }
  if (key.startsWith("approval:")) {
    if (typeof value !== "boolean") return { status: "failure" };
    return { status: "success", result: value };
  }
  return { status: "failure" };
}

export function decodeChecks(wire: WireChecks | undefined | null): ServerChecks | undefined {
  if (wire === undefined || wire === null || typeof wire !== "object") return undefined;
  const at = Date.parse(wire.at);
  if (!Number.isFinite(at)) return undefined;

  const status = new Map<string, OrderStatus>();
  for (const [hash, s] of Object.entries(wire.status ?? {})) {
    if (!Array.isArray(s) || s.length !== 4) continue;
    const [validated, cancelled, filled, size] = s;
    if (typeof validated !== "boolean" || typeof cancelled !== "boolean") continue;
    if (!/^\d+$/.test(String(filled)) || !/^\d+$/.test(String(size))) continue;
    status.set(hash.toLowerCase(), [validated, cancelled, BigInt(filled), BigInt(size)]);
  }

  const reads = new Map<string, ChainAnswer>();
  for (const [key, value] of Object.entries(wire.reads ?? {})) reads.set(key, decodeAnswer(key, value));

  return { at, status, reads };
}

/* --------------------------------------------------------------- server */

/**
 * Ask the chain about every order, as the browser would: Seaport's status
 * and the two fillability questions, in as few `eth_call`s as fit.
 *
 * `batchSize` is calldata bytes per call. viem's default of 1,024 splits a
 * book of a thousand orders into hundreds of calls; at 32 KB it is a handful,
 * each well inside a node's gas cap for a read.
 */
export async function checkOrders(client: PublicClient, candidates: readonly CheckTarget[]): Promise<WireChecks> {
  const at = new Date().toISOString();
  const questions = fillabilityQuestions(candidates);

  const [statuses, answers] = await Promise.all([
    client.multicall({
      allowFailure: true,
      batchSize: 32_768,
      contracts: candidates.map((c) => ({
        address: SEAPORT,
        abi: SeaportAbi,
        functionName: "getOrderStatus" as const,
        args: [c.hash],
      })),
    }),
    client.multicall({ allowFailure: true, batchSize: 32_768, contracts: questions.reads }),
  ]);

  const status: WireChecks["status"] = {};
  candidates.forEach((c, i) => {
    const entry = statuses[i];
    if (entry?.status !== "success") return;
    const [validated, cancelled, filled, size] = entry.result as unknown as OrderStatus;
    status[c.hash.toLowerCase()] = [validated, cancelled, filled.toString(), size.toString()];
  });

  const reads: WireChecks["reads"] = {};
  questions.keys.forEach((key, i) => {
    reads[key] = encodeAnswer(answers[i] as { status: string; result?: unknown } | undefined);
  });

  return { at, status, reads };
}
