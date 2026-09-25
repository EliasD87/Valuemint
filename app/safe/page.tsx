"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useWriteContract } from "@/hooks/useChainWrite";
import { useTxOutcome } from "@/hooks/useTxOutcome";
import {
  decodeAbiParameters,
  keccak256,
  parseGwei,
  stringToBytes,
  type AbiParameter,
  type Hex,
} from "viem";
import { valuechain } from "@/config/chain";
import { deployment } from "@/config/contracts";
import { TxResult } from "@/components/TxResult";
import { shortAddress } from "@/lib/format";
import "./safe.css";
import { ConnectButton } from "@/components/ConnectButton";

/**
 * The owner console for the project's multisig.
 *
 * It exists because Safe's hosted app does not support ValueChain — their
 * config lists 54 chains and 286623 is not among them — so there is nowhere for
 * an owner to go and press "approve". The alternative was for each signer to
 * hand their private key to a script on one machine, which would put every key
 * in one place and undo the whole reason for having a multisig.
 *
 * So this page does the one thing that cannot be done from a terminal on
 * somebody else's behalf: it lets an owner approve from their own wallet, on
 * their own device, with the key never leaving it.
 *
 * Deliberately not linked from anywhere. It is not secret — every approval is a
 * public transaction and only a real owner's counts — but it is of no interest
 * to anyone buying an NFT.
 */

/**
 * The Safe's address is not baked in.
 *
 * Everything this page displays is already public — a marketplace's `owner()`
 * returns the Safe, `getOwners()` is a public view, and every approval is a
 * public transaction. But "discoverable by reading the chain" and "printed on
 * the project's own domain under a heading naming it as the thing that controls
 * the project" are different amounts of exposure, and the second one is a
 * targeting aid for whoever wants to phish an owner.
 *
 * So the address arrives in the URL (`/safe?safe=0x…`). Anyone who already
 * knows it loses nothing; the page itself tells a stranger nothing at all, and
 * there is no longer a crawlable document linking three wallets to this brand.
 */
const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * ValueChain's suggested gas price stalls anything past a plain transfer — a
 * 313k-gas transaction sat unmined for 400 blocks at it. Wallets follow that
 * suggestion, so the price is set explicitly here rather than left to them.
 */
const GAS_PRICE = parseGwei("0.05");

const safeAbi = [
  { inputs: [], name: "getOwners", outputs: [{ type: "address[]" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getThreshold", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "nonce", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  {
    inputs: [{ type: "address" }, { type: "bytes32" }],
    name: "approvedHashes",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" }, { name: "_nonce", type: "uint256" },
    ],
    name: "getTransactionHash",
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [{ type: "bytes32" }], name: "approveHash", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" }, { name: "signatures", type: "bytes" },
    ],
    name: "execTransaction",
    outputs: [{ type: "bool" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

/**
 * What the pending transaction actually does, in words.
 *
 * An owner approving a bare 32-byte hash is blind-signing. The page recomputes
 * that hash from these parameters through the Safe's own `getTransactionHash`,
 * so the number on screen is only trustworthy *because* it was derived from the
 * description above it.
 */
/**
 * keccak256 of the accepted Safe address, lower-cased.
 *
 * A hash rather than the address itself so this static document still names no
 * wallet — see the note in the mount effect below.
 */
const PINNED_SAFE = "0xfc8d033038f406cca952c230b194dc7eca212f94bb6bb0841af7787532a2ec63";

/**
 * What each call does — and, where it takes one, what it does it *to*.
 *
 * This used to be a flat selector -> sentence table, which meant the one call
 * on it that carries an argument was described as "transferOwnership(address) —
 * hand ownership to someone else" with the someone left out. The address is the
 * entire decision. An owner reading that sentence, checking the recomputed hash
 * against it and signing has confirmed nothing at all: the same sentence sits
 * above handing the factory to the Safe and above handing it to a stranger.
 *
 * So arguments are decoded from the calldata the hash was computed over, and
 * shown. Anything that does not decode says so rather than falling back to the
 * reassuring half of the truth.
 */
interface KnownCall {
  /** The call with no arguments to show. */
  label: string;
  /** ABI types, when the call takes arguments that must be read before signing. */
  params?: readonly { readonly type: string }[];
  render?: (args: readonly unknown[]) => string;
}

const KNOWN_CALLS: Record<string, KnownCall> = {
  "0x79ba5097": { label: "acceptOwnership() — take ownership of the target contract" },
  "0x8456cb59": { label: "pause() — halt all trading" },
  "0x3f4ba83a": { label: "unpause() — resume trading" },
  "0x3ccfd60b": { label: "withdraw() — sweep the target's balance to its fee recipient" },
  "0xf2fde38b": {
    label: "transferOwnership(address)",
    params: [{ type: "address" }] as const,
    render: ([to]) =>
      `transferOwnership(${String(to)}) — hands ownership to that address, permanently. Read it character by character before approving.`,
  },
  "0x704b6c02": {
    label: "setAuthoriser(address)",
    params: [{ type: "address" }] as const,
    render: ([who]) => `setAuthoriser(${String(who)}) — makes that address the one whose signature mints.`,
  },
  "0xe74b981b": {
    label: "setFeeRecipient(address)",
    params: [{ type: "address" }] as const,
    render: ([who]) => `setFeeRecipient(${String(who)}) — sends all future fees to that address.`,
  },
};

/**
 * The sentence shown above the hash an owner is about to approve.
 *
 * Every failure mode is spelled out rather than softened, because the whole
 * safety argument of this page is that the description and the hash describe
 * the same call.
 */
function describeCall(raw: string): { text: string; safe: boolean } {
  const data = raw.trim().toLowerCase();
  if (!/^0x([0-9a-f]{2})*$/.test(data)) {
    return { text: "That is not valid calldata.", safe: false };
  }
  if (data.length < 10) {
    return { text: "Too short to name a function — check the calldata.", safe: false };
  }

  const selector = data.slice(0, 10);
  const known = KNOWN_CALLS[selector];
  if (known === undefined) {
    return { text: `an unrecognised call (${selector}) — check the calldata`, safe: false };
  }

  const argBytes = `0x${data.slice(10)}` as Hex;

  if (known.params === undefined) {
    // Trailing bytes after a no-argument selector are ignored on chain but are
    // not nothing: they are in the hash, and they are a sign the calldata was
    // not built by whoever wrote the description.
    if (data.length > 10) {
      return {
        text: `${known.label} — but there are ${(data.length - 10) / 2} unexpected bytes after the selector. Do not approve this.`,
        safe: false,
      };
    }
    return { text: known.label, safe: true };
  }

  try {
    const args = decodeAbiParameters(known.params as readonly AbiParameter[], argBytes);
    return { text: known.render?.(args) ?? known.label, safe: true };
  } catch {
    return {
      text: `${known.label} — the arguments could not be read from this calldata. Do not approve it.`,
      safe: false,
    };
  }
}

const TARGETS: Record<string, string> = {
  // Paused by this very console on 2026-09-16. Calling it "live" to the person
  // approving the next transaction against it is exactly backwards.
  [deployment.marketplace.toLowerCase()]: "Marketplace v3 (superseded, paused)",
  "0xb1153aa3dbadd59e3e6aa61452f2daa90b99a859": "Legacy factory — the rehearsal target",
  [deployment.factory.toLowerCase()]: "Collection factory",
};

/** Safe's blob for hashes approved on chain, owners ascending. */
function approvedHashSignatures(owners: readonly string[]): `0x${string}` {
  const sorted = [...owners].sort((a, b) =>
    BigInt(a.toLowerCase()) < BigInt(b.toLowerCase()) ? -1 : 1,
  );
  return ("0x" +
    sorted.map((o) => o.toLowerCase().replace("0x", "").padStart(64, "0") + "0".repeat(64) + "01").join("")
  ) as `0x${string}`;
}

export default function SafeConsole() {
  const { address, isConnected } = useAccount();

  // Read once on mount rather than through a router hook, so the page is a
  // plain static document with nothing about this Safe in the bundle.
  const [safeAddress, setSafeAddress] = useState<`0x${string}` | undefined>(undefined);
  const [rejected, setRejected] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("safe") ?? "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(p)) return;

    /**
     * Well-formed is not the same as ours.
     *
     * Everything below is an assertion the named contract makes about itself:
     * `getOwners` draws the owner chips, `approvedHashes` decides who has
     * signed, and `getTransactionHash` produces the very number an owner is
     * asked to approve. That last one is the page's whole safety argument — the
     * hash is trustworthy *because* it was recomputed from the described call.
     * Aimed at a contract an attacker wrote, the recomputation is theirs: they
     * return the three real owner addresses so the chips look right, and the
     * human-readable description sits above a hash that means nothing.
     *
     * So the address is checked against a pinned value. It is checked as a
     * **hash** rather than a constant, which keeps the property the query
     * parameter was added for: this document still names no wallet, so it
     * discloses nothing to anyone who opens it. Someone who already knows the
     * address can confirm it; nobody can read it off.
     */
    if (keccak256(stringToBytes(p.toLowerCase())) !== PINNED_SAFE) {
      setRejected(true);
      return;
    }
    setSafeAddress(p as `0x${string}`);
  }, []);

  const [to, setTo] = useState("");
  const [data, setData] = useState("0x79ba5097");

  const base = { address: safeAddress, abi: safeAbi, query: { enabled: safeAddress !== undefined } } as const;
  const { data: owners } = useReadContract({ ...base, functionName: "getOwners" });
  const { data: threshold } = useReadContract({ ...base, functionName: "getThreshold" });
  const { data: safeNonce, refetch: refetchNonce } = useReadContract({ ...base, functionName: "nonce" });

  const ready = owners !== undefined && threshold !== undefined && safeNonce !== undefined;
  const validTo = /^0x[0-9a-fA-F]{40}$/.test(to.trim());
  const validData = /^0x([0-9a-fA-F]{2})*$/.test(data.trim());

  const { data: txHash } = useReadContract({
    ...base,
    functionName: "getTransactionHash",
    args: validTo && validData && safeNonce !== undefined
      ? [to.trim() as `0x${string}`, 0n, data.trim() as `0x${string}`, 0, 0n, 0n, 0n, ZERO, ZERO, safeNonce]
      : undefined,
    query: { enabled: safeAddress !== undefined && validTo && validData && safeNonce !== undefined },
  });

  const call = describeCall(data);
  const targetName = TARGETS[to.trim().toLowerCase()] ?? "an unrecognised contract";

  return (
    <section className="page section safe-page">
      <div className="head">
        <div>
          <p className="eyebrow">Multisig</p>
          <h2>Approve a Safe transaction</h2>
        </div>
      </div>

      <p className="safe-intro">
        Safe&rsquo;s own app doesn&rsquo;t support ValueChain, so this is where owners approve.
        Your key never leaves your wallet, and the threshold must be met before anything happens.
      </p>

      {rejected ? (
        <p className="safe-warn">
          That address is not the Safe this console knows, so nothing below will be shown for it.
          If you believe it should be, check the address rather than approving anything here.
        </p>
      ) : safeAddress === undefined ? (
        <p className="safe-warn">
          No Safe named. Open this page with <span className="mono">?safe=0x…</span> on the end —
          the address isn&rsquo;t stored here, so the page tells nobody anything on its own.
        </p>
      ) : null}

      <div className="safe-grid">
        <div className="safe-card card">
          <p className="eyebrow">The Safe</p>
          <dl className="safe-facts">
            <div><dt>Address</dt><dd className="mono">{safeAddress === undefined ? "—" : safeAddress}</dd></div>
            <div><dt>Rule</dt><dd>{ready ? `${threshold} of ${owners.length}` : "…"}</dd></div>
            <div><dt>Next nonce</dt><dd className="mono">{ready ? String(safeNonce) : "…"}</dd></div>
          </dl>
          <ul className="safe-owners">
            {(owners ?? []).map((o) => (
              <li key={o} className={address?.toLowerCase() === o.toLowerCase() ? "is-you" : undefined}>
                <span className="mono">{shortAddress(o, 4)}</span>
                {address?.toLowerCase() === o.toLowerCase() ? <b>you</b> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="safe-card card">
          <p className="eyebrow">What you would be approving</p>

          <label className="field">
            <span>Contract to call</span>
            <input className="input mono" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} />
          </label>
          <label className="field">
            <span>Calldata</span>
            <input className="input mono" value={data} onChange={(e) => setData(e.target.value)} spellCheck={false} />
          </label>

          <div className="safe-reads">
            <p><b>{targetName}</b></p>
            <p className={call.safe ? "dim" : "safe-warn"}>{call.text}</p>
          </div>

          {txHash !== undefined ? (
            <>
              <p className="safe-hash-label">Safe transaction hash</p>
              <p className="safe-hash mono">{txHash}</p>
              <p className="safe-fine">
                Computed by the Safe itself from the two fields above. If this doesn&rsquo;t match
                the hash you were given, something differs — don&rsquo;t approve it.
              </p>
            </>
          ) : (
            <p className="safe-fine">
              {safeAddress === undefined
                ? "No Safe loaded, so the hash cannot be computed. Open this page with ?safe=0x… on the end."
                : "Fill in a valid address and calldata to see the hash."}
            </p>
          )}

          {!isConnected ? (
            <ConnectButton className="btn btn-primary btn-block">
              Connect wallet to approve
            </ConnectButton>
          ) : (
            <ApproveRow
              safeAddress={safeAddress}
              owners={owners}
              threshold={threshold}
              txHash={txHash}
              to={to.trim()}
              data={data.trim()}
              callIsSafe={call.safe}
              onDone={() => void refetchNonce()}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ApproveRow({
  safeAddress, owners, threshold, txHash, to, data, callIsSafe, onDone,
}: {
  safeAddress: `0x${string}` | undefined;
  owners: readonly `0x${string}`[] | undefined;
  threshold: bigint | undefined;
  txHash: `0x${string}` | undefined;
  to: string;
  data: string;
  /**
   * Whether `describeCall` could account for every byte of the calldata.
   *
   * The page already computed this and already printed "Do not approve this"
   * above an unrecognised selector, calldata with trailing bytes, or arguments
   * that would not decode — and then left the Approve button enabled anyway.
   * A console whose entire purpose is to make signing unambiguous must not
   * offer the action it has just told you not to take.
   */
  callIsSafe: boolean;
  onDone: () => void;
}) {
  const { address } = useAccount();

  /**
   * The write lives here rather than in the parent so the buttons, their busy
   * state and their result are one object. Threading wagmi's write function
   * through a prop also loses the chain's literal id from its type, which is
   * the guard that stops a transaction being sent to the wrong network.
   */
  const { writeContract, data: sent, isPending: signing, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useTxOutcome({ hash: sent });
  const busy = signing || confirming;

  // One read per owner, so the page shows who is still missing rather than only a count.
  const a0 = useReadContract({
    address: safeAddress, abi: safeAbi, functionName: "approvedHashes",
    args: owners?.[0] !== undefined && txHash !== undefined ? [owners[0], txHash] : undefined,
    query: { enabled: safeAddress !== undefined && owners?.[0] !== undefined && txHash !== undefined, refetchInterval: 6000 },
  });
  const a1 = useReadContract({
    address: safeAddress, abi: safeAbi, functionName: "approvedHashes",
    args: owners?.[1] !== undefined && txHash !== undefined ? [owners[1], txHash] : undefined,
    query: { enabled: safeAddress !== undefined && owners?.[1] !== undefined && txHash !== undefined, refetchInterval: 6000 },
  });
  const a2 = useReadContract({
    address: safeAddress, abi: safeAbi, functionName: "approvedHashes",
    args: owners?.[2] !== undefined && txHash !== undefined ? [owners[2], txHash] : undefined,
    query: { enabled: safeAddress !== undefined && owners?.[2] !== undefined && txHash !== undefined, refetchInterval: 6000 },
  });

  const approvers = useMemo(() => {
    const out: `0x${string}`[] = [];
    [a0, a1, a2].forEach((r, i) => {
      const o = owners?.[i];
      if (o !== undefined && typeof r.data === "bigint" && r.data > 0n) out.push(o);
    });
    return out;
  }, [a0.data, a1.data, a2.data, owners]);

  /**
   * Unknown is not the same as no.
   *
   * This used to be `?? false`, so before the owner list resolved — or whenever
   * no Safe was loaded at all — the page told a genuine owner their wallet was
   * not one of the three. Wrong, and wrong in the most alarming possible place:
   * a console whose entire job is to make signing unambiguous.
   */
  const ownersKnown = owners !== undefined && owners.length > 0;
  const isOwner = ownersKnown && owners.some((o) => o.toLowerCase() === address?.toLowerCase());
  const alreadyApproved = approvers.some((o) => o.toLowerCase() === address?.toLowerCase());
  const enough = threshold !== undefined && BigInt(approvers.length) >= threshold;

  return (
    <>
      <div className="safe-approvals">
        {(owners ?? []).map((o) => {
          const has = approvers.some((a) => a.toLowerCase() === o.toLowerCase());
          return (
            <span key={o} className={`safe-chip ${has ? "is-signed" : ""}`}>
              {has ? "signed" : "waiting"} · {shortAddress(o, 4)}
            </span>
          );
        })}
      </div>

      {!ownersKnown ? (
        <p className="safe-fine">Reading the Safe&rsquo;s owners…</p>
      ) : !isOwner ? (
        <p className="safe-warn">
          This wallet isn&rsquo;t one of the {owners.length} owners, so the Safe would refuse its
          approval. Switch to an owner wallet.
        </p>
      ) : alreadyApproved && !enough ? (
        <p className="safe-fine">
          You&rsquo;ve approved this. Waiting on one more owner before it can run.
        </p>
      ) : null}

      {isOwner && !alreadyApproved ? (
        <button
          className="btn btn-primary btn-block"
          disabled={busy || txHash === undefined || !callIsSafe}
          onClick={() =>
            writeContract({
              chainId: valuechain.id,
              address: safeAddress!,
              abi: safeAbi,
              functionName: "approveHash",
              args: [txHash!],
              gasPrice: GAS_PRICE,
            })
          }
        >
          {busy ? "Confirm in your wallet…" : !callIsSafe ? "Calldata not understood" : "Approve"}
        </button>
      ) : null}

      {!callIsSafe ? (
        <p className="safe-warn">
          Approving is disabled because this calldata could not be fully accounted for.
          Fix it, or verify it independently, before signing anything.
        </p>
      ) : null}

      {enough ? (
        <button
          className="btn btn-primary btn-block"
          disabled={busy || !callIsSafe}
          onClick={() =>
            writeContract({
              chainId: valuechain.id,
              address: safeAddress!,
              abi: safeAbi,
              functionName: "execTransaction",
              args: [
                to as `0x${string}`, 0n, data as `0x${string}`, 0, 0n, 0n, 0n, ZERO, ZERO,
                approvedHashSignatures(approvers.slice(0, Number(threshold))),
              ],
              gasPrice: GAS_PRICE,
            })
          }
        >
          {busy ? "Confirm in your wallet…" : "Execute — enough approvals"}
        </button>
      ) : null}

      <TxResult
        hash={sent}
        confirming={confirming}
        success={isSuccess}
        error={error}
        successLabel="Done"
      />
    </>
  );
}
