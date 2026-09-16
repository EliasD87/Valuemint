"use client";

import { useMemo, useState } from "react";
import { useAccount, useConnect, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { parseGwei } from "viem";
import { valuechain } from "@/config/chain";
import { deployment } from "@/config/contracts";
import { TxResult } from "@/components/TxResult";
import { shortAddress } from "@/lib/format";
import "./safe.css";

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

const SAFE = "0xf228647Ca250244c5CE622FC5230B30d399575d5" as const;
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
const KNOWN_CALLS: Record<string, string> = {
  "0x79ba5097": "acceptOwnership() — take ownership of the target contract",
  "0x8456cb59": "pause() — halt all trading",
  "0x3f4ba83a": "unpause() — resume trading",
  "0x3ccfd60b": "withdraw() — sweep the target's balance",
  "0xf2fde38b": "transferOwnership(address) — hand ownership to someone else",
};

const TARGETS: Record<string, string> = {
  [deployment.marketplace.toLowerCase()]: "Marketplace v3 (live)",
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
  const { connect, connectors, isPending: connecting } = useConnect();

  const [to, setTo] = useState("0xb1153Aa3dbADD59e3e6aa61452f2DAa90b99A859");
  const [data, setData] = useState("0x79ba5097");

  const base = { address: SAFE, abi: safeAbi } as const;
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
    query: { enabled: validTo && validData && safeNonce !== undefined },
  });

  const what = KNOWN_CALLS[data.trim().slice(0, 10).toLowerCase()] ?? "an unrecognised call — check the calldata";
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
        Your key never leaves your wallet. Two of the three owners must approve before anything
        happens.
      </p>

      <div className="safe-grid">
        <div className="safe-card card">
          <p className="eyebrow">The Safe</p>
          <dl className="safe-facts">
            <div><dt>Address</dt><dd className="mono">{shortAddress(SAFE, 6)}</dd></div>
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
            <p className="dim">{what}</p>
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
            <p className="safe-fine">Fill in a valid address and calldata to see the hash.</p>
          )}

          {!isConnected ? (
            <button
              className="btn btn-primary btn-block"
              disabled={connecting}
              onClick={() => {
                const injected = connectors.find((c) => c.id === "injected");
                if (injected !== undefined) connect({ connector: injected });
              }}
            >
              {connecting ? "Check your wallet…" : "Connect wallet to approve"}
            </button>
          ) : (
            <ApproveRow
              owners={owners}
              threshold={threshold}
              txHash={txHash}
              to={to.trim()}
              data={data.trim()}
              onDone={() => void refetchNonce()}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ApproveRow({
  owners, threshold, txHash, to, data, onDone,
}: {
  owners: readonly `0x${string}`[] | undefined;
  threshold: bigint | undefined;
  txHash: `0x${string}` | undefined;
  to: string;
  data: string;
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
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: sent });
  const busy = signing || confirming;

  // One read per owner, so the page shows who is still missing rather than only a count.
  const a0 = useReadContract({
    address: SAFE, abi: safeAbi, functionName: "approvedHashes",
    args: owners?.[0] !== undefined && txHash !== undefined ? [owners[0], txHash] : undefined,
    query: { enabled: owners?.[0] !== undefined && txHash !== undefined, refetchInterval: 6000 },
  });
  const a1 = useReadContract({
    address: SAFE, abi: safeAbi, functionName: "approvedHashes",
    args: owners?.[1] !== undefined && txHash !== undefined ? [owners[1], txHash] : undefined,
    query: { enabled: owners?.[1] !== undefined && txHash !== undefined, refetchInterval: 6000 },
  });
  const a2 = useReadContract({
    address: SAFE, abi: safeAbi, functionName: "approvedHashes",
    args: owners?.[2] !== undefined && txHash !== undefined ? [owners[2], txHash] : undefined,
    query: { enabled: owners?.[2] !== undefined && txHash !== undefined, refetchInterval: 6000 },
  });

  const approvers = useMemo(() => {
    const out: `0x${string}`[] = [];
    [a0, a1, a2].forEach((r, i) => {
      const o = owners?.[i];
      if (o !== undefined && typeof r.data === "bigint" && r.data > 0n) out.push(o);
    });
    return out;
  }, [a0.data, a1.data, a2.data, owners]);

  const isOwner = owners?.some((o) => o.toLowerCase() === address?.toLowerCase()) ?? false;
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

      {!isOwner ? (
        <p className="safe-warn">
          This wallet isn&rsquo;t one of the three owners, so the Safe would refuse its approval.
          Switch to an owner wallet.
        </p>
      ) : alreadyApproved && !enough ? (
        <p className="safe-fine">
          You&rsquo;ve approved this. Waiting on one more owner before it can run.
        </p>
      ) : null}

      {isOwner && !alreadyApproved ? (
        <button
          className="btn btn-primary btn-block"
          disabled={busy || txHash === undefined}
          onClick={() =>
            writeContract({
              chainId: valuechain.id,
              address: SAFE,
              abi: safeAbi,
              functionName: "approveHash",
              args: [txHash!],
              gasPrice: GAS_PRICE,
            })
          }
        >
          {busy ? "Confirm in your wallet…" : "Approve"}
        </button>
      ) : null}

      {enough ? (
        <button
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() =>
            writeContract({
              chainId: valuechain.id,
              address: SAFE,
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
