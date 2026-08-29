"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { valuechain } from "@/config/chain";
import { formatCount, formatSoso } from "@/lib/format";
import "@/styles/mint.css";

/**
 * Minting for any collection, not a particular one.
 *
 * Everything shown is read from the collection at `address`: price, remaining
 * allocation, per-wallet cap and whether minting is open at all. A collection
 * made by somebody else through the factory behaves exactly like the first one,
 * because nothing here is special-cased to it.
 */
export function MintPanel({ address: collection }: { address: `0x${string}` }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: balance } = useBalance({ address, query: { enabled: address !== undefined } });

  const base = { address: collection, abi: ValueChainCollectionAbi } as const;

  const { data, refetch } = useReadContracts({
    contracts: [
      { ...base, functionName: "mintPrice" },
      { ...base, functionName: "publicMintEnabled" },
      { ...base, functionName: "publicMintRemaining" },
      { ...base, functionName: "maxPerWallet" },
      { ...base, functionName: "publicMinted" },
      { ...base, functionName: "publicMintLimit" },
      { ...base, functionName: "remainingForWallet", args: [address ?? "0x0"] },
    ],
    query: { refetchInterval: 12_000 },
  });

  const at = <T,>(i: number): T | undefined =>
    data?.[i]?.status === "success" ? (data[i].result as T) : undefined;

  const price = at<bigint>(0) ?? 0n;
  const open = at<boolean>(1);
  const remaining = Number(at<bigint>(2) ?? 0n);
  const perWallet = Number(at<bigint>(3) ?? 0n);
  const publicMinted = at<bigint>(4);
  const publicLimit = at<bigint>(5);
  const yourRemaining = address === undefined ? perWallet : Number(at<bigint>(6) ?? 0n);

  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) void refetch();
  }, [isSuccess, refetch]);

  const wrongChain = isConnected && chainId !== valuechain.id;
  const canAfford = balance === undefined || balance.value >= price;
  const busy = signing || confirming;

  const mint = () => {
    reset();
    writeContract({ ...base, functionName: "mint", args: [address!], value: price });
  };

  // A collection whose owner never opened minting has nothing to offer here, and
  // saying so plainly beats a disabled button with no explanation.
  const [dismissed, setDismissed] = useState(false);
  if (open === false && dismissed) return null;

  const pct =
    publicLimit !== undefined && publicLimit > 0n
      ? Number(((publicMinted ?? 0n) * 100n) / publicLimit)
      : 0;

  return (
    <aside className="mint-panel card">
      <div className="mint-panel-head">
        <span className="dim">{open === true ? "Mint price" : "Public minting"}</span>
        <span className="mint-total mono">
          {open === true ? `${formatSoso(price)} SOSO` : "Closed"}
        </span>
      </div>

      {open === true ? (
        <>
          {publicLimit !== undefined && publicLimit > 0n ? (
            <div className="mint-progress">
              <div className="mint-bar">
                <span style={{ width: `${pct}%` }} />
              </div>
              <span className="mono dim">
                {formatCount(publicMinted)} / {formatCount(publicLimit)}
              </span>
            </div>
          ) : null}

          <div className="mint-action">
            {!isConnected ? (
              <button
                className="btn btn-primary btn-lg btn-block"
                disabled={connecting}
                onClick={() => {
                  const injected = connectors.find((c) => c.id === "injected");
                  if (injected !== undefined) connect({ connector: injected });
                }}
              >
                {connecting ? "Check your wallet…" : "Connect wallet to mint"}
              </button>
            ) : wrongChain ? (
              <button
                className="btn btn-primary btn-lg btn-block"
                disabled={switching}
                onClick={() => switchChain({ chainId: valuechain.id })}
              >
                {switching ? "Switching…" : "Switch to ValueChain"}
              </button>
            ) : remaining === 0 ? (
              <button className="btn btn-lg btn-block" disabled>
                Sold out
              </button>
            ) : yourRemaining === 0 && perWallet > 0 ? (
              <button className="btn btn-lg btn-block" disabled>
                You&rsquo;ve minted your limit
              </button>
            ) : !canAfford ? (
              <button className="btn btn-lg btn-block" disabled>
                Not enough SOSO
              </button>
            ) : (
              <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={mint}>
                {signing ? "Confirm in wallet…" : confirming ? "Minting…" : `Mint for ${formatSoso(price)} SOSO`}
              </button>
            )}
          </div>

          <dl className="mint-meta">
            <div>
              <dt>Available</dt>
              <dd className="mono">{formatCount(remaining)}</dd>
            </div>
            <div>
              <dt>Per wallet</dt>
              <dd className="mono">{perWallet === 0 ? "No limit" : perWallet}</dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <p className="mint-fineprint">
            The owner of this collection hasn&rsquo;t opened public minting. Its existing pieces can
            still be bought and sold below.
          </p>
          <button className="btn btn-sm" onClick={() => setDismissed(true)}>
            Hide
          </button>
        </>
      )}

      {isSuccess ? (
        <div className="mint-note mint-note-good">
          <strong>Minted.</strong>
          <a
            href={`${deployment.explorer}/tx/${hash}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            View transaction
          </a>
        </div>
      ) : null}

      {error !== null ? (
        <div className="mint-note mint-note-bad">
          {/rejected|denied|User denied/i.test(error.message)
            ? "You cancelled the transaction."
            : error.message.slice(0, 160)}
        </div>
      ) : null}
    </aside>
  );
}
