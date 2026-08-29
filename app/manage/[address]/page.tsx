"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import {
  useAccount,
  useBalance,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ValueChainCollectionAbi, deployment } from "@/config/contracts";
import { formatCount, formatSoso, shortAddress } from "@/lib/format";
import "@/styles/manage.css";

/**
 * The owner's console for one collection.
 *
 * Everything here is an owner-only function on the contract. Nothing is proxied
 * through a backend: each control writes directly to the collection the connected
 * wallet owns, which is why a wallet that is not the owner sees the state but no
 * controls rather than buttons that would revert.
 */
export default function ManageCollection({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = use(params);
  const { address: viewer } = useAccount();

  const valid = /^0x[0-9a-fA-F]{40}$/.test(raw);
  const collection = valid ? (raw as `0x${string}`) : undefined;
  const base = { address: collection, abi: ValueChainCollectionAbi } as const;

  const { data, refetch } = useReadContracts({
    contracts: [
      { ...base, functionName: "name" },
      { ...base, functionName: "symbol" },
      { ...base, functionName: "owner" },
      { ...base, functionName: "totalSupply" },
      { ...base, functionName: "maxSupply" },
      { ...base, functionName: "mintPrice" },
      { ...base, functionName: "publicMintEnabled" },
      { ...base, functionName: "publicMintLimit" },
      { ...base, functionName: "publicMinted" },
      { ...base, functionName: "maxPerWallet" },
      { ...base, functionName: "baseURI" },
    ],
    query: { enabled: collection !== undefined, refetchInterval: 12_000 },
  });

  const at = <T,>(i: number): T | undefined =>
    data?.[i]?.status === "success" ? (data[i].result as T) : undefined;

  const name = at<string>(0);
  const symbol = at<string>(1);
  const owner = at<`0x${string}`>(2);
  const totalSupply = at<bigint>(3);
  const maxSupply = at<bigint>(4);
  const mintPrice = at<bigint>(5);
  const open = at<boolean>(6);
  const publicLimit = at<bigint>(7);
  const publicMinted = at<bigint>(8);
  const perWallet = at<bigint>(9);
  const currentBase = at<string>(10);

  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const busy = signing || confirming;

  useEffect(() => {
    if (isSuccess) void refetch();
  }, [isSuccess, refetch]);

  const [baseUri, setBaseUri] = useState("");
  // The metadata guard protects mintors, but it must not lock an owner out of
  // their own collection - so it warns and asks, rather than refusing.
  const [openAnyway, setOpenAnyway] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [batchTo, setBatchTo] = useState("");
  const [batchCount, setBatchCount] = useState("10");

  const isOwner =
    owner !== undefined && viewer !== undefined && owner.toLowerCase() === viewer.toLowerCase();

  // The reserve is whatever the public can never claim, less what the owner already took.
  const reserve =
    maxSupply !== undefined && publicLimit !== undefined ? maxSupply - publicLimit : undefined;
  const ownerHolds =
    totalSupply !== undefined && publicMinted !== undefined ? totalSupply - publicMinted : undefined;
  const reserveLeft =
    reserve !== undefined && ownerHolds !== undefined ? reserve - ownerHolds : undefined;

  const call = (functionName: string, args: unknown[]) => {
    reset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeContract({ ...base, functionName, args } as any);
  };

  if (!valid) {
    return (
      <section className="page section">
        <h2>That isn&rsquo;t a contract address.</h2>
      </section>
    );
  }

  if (owner !== undefined && !isOwner) {
    return (
      <section className="page section manage-denied">
        <p className="eyebrow">Manage</p>
        <h2>You don&rsquo;t own this collection.</h2>
        <p className="muted">
          It belongs to {shortAddress(owner, 6)}. Only its owner can change how it mints — that is
          enforced by the contract, not by this page.
        </p>
        <div className="wrap-row mt-sm">
          <Link className="btn btn-primary" href={`/collection/${raw}`}>
            View the collection
          </Link>
          <Link className="btn" href="/manage">
            Your collections
          </Link>
        </div>
      </section>
    );
  }

  // Collections made before the factory gained a public getter cannot answer
  // this, so `undefined` means "cannot tell" rather than "missing".
  const metadataUnknown = currentBase === undefined;
  const metadataMissing = currentBase === "";

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Manage</p>
          <h2>{name ?? "Loading…"}</h2>
        </div>
        <Link className="head-link" href={`/collection/${raw}`}>
          View public page &rarr;
        </Link>
      </div>

      <div className="manage-stats">
        <Stat label="Symbol" value={symbol ?? "—"} />
        <Stat label="Minted" value={`${formatCount(totalSupply)} / ${formatCount(maxSupply)}`} />
        <Stat label="Public taken" value={`${formatCount(publicMinted)} / ${formatCount(publicLimit)}`} />
        <Stat label="Your reserve left" value={formatCount(reserveLeft)} />
        <Stat label="Mint price" value={`${formatSoso(mintPrice)} SOSO`} />
        <Stat label="Per wallet" value={perWallet === 0n ? "No cap" : formatCount(perWallet)} />
      </div>

      {error !== null ? (
        <p className="manage-error">
          {/rejected|denied|User denied/i.test(error.message)
            ? "You cancelled the transaction."
            : error.message.slice(0, 220)}
        </p>
      ) : null}

      <div className="manage-grid">
        {/* --- the switch that matters most --------------------------- */}
        <Card
          title="Public minting"
          body={
            open === true
              ? "Anyone can mint from this collection right now."
              : "Closed. Nobody but you can mint."
          }
        >
          {metadataMissing && open !== true ? (
            <>
              <p className="manage-warn">
                No artwork set. Anyone who mints receives a blank NFT, and it stays blank in their
                wallet until you add artwork below.
              </p>
              <label className="manage-check">
                <input
                  type="checkbox"
                  checked={openAnyway}
                  onChange={(e) => setOpenAnyway(e.target.checked)}
                />
                <span>Open minting without artwork</span>
              </label>
            </>
          ) : null}

          <button
            className={open === true ? "btn btn-block" : "btn btn-primary btn-block"}
            disabled={busy || (metadataMissing && open !== true && !openAnyway)}
            onClick={() => call("setPublicMintEnabled", [open !== true])}
          >
            {busy ? "Working…" : open === true ? "Close minting" : "Open minting"}
          </button>
        </Card>

        {/* --- metadata ------------------------------------------------ */}
        <Card
          title="Artwork"
          body="Where every piece in this collection gets its picture and name from."
        >
          <p className="manage-current mono">{metadataUnknown ? "Cannot be read on this collection" : metadataMissing ? "No artwork set" : currentBase}</p>
          <div className="field">
            <input
              className="input"
              placeholder="https://…/ or ipfs://…/"
              value={baseUri}
              onChange={(e) => setBaseUri(e.target.value)}
              spellCheck={false}
            />
            <span className="field-hint">
              Paste an address that hosts your metadata. Must end with a slash.
            </span>
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={busy || baseUri.trim() === "" || !baseUri.trim().endsWith("/")}
            onClick={() => call("setBaseURI", [baseUri.trim()])}
          >
            Update artwork
          </button>
        </Card>

        {/* --- price --------------------------------------------------- */}
        <Card title="Mint price" body="What the public pays per token. Takes effect immediately.">
          <div className="field">
            <input
              className="input"
              inputMode="decimal"
              placeholder={formatSoso(mintPrice)}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
            <span className="field-hint">In SOSO.</span>
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={busy || newPrice.trim() === "" || Number.isNaN(Number(newPrice))}
            onClick={() => call("setMintPrice", [parseEther(newPrice)])}
          >
            Update price
          </button>
        </Card>

        {/* --- reserve ------------------------------------------------- */}
        <Card
          title="Mint your reserve"
          body={
            reserveLeft !== undefined && reserveLeft > 0n
              ? `${formatCount(reserveLeft)} tokens are reserved for you and cost nothing but gas.`
              : "You have taken your whole reserve."
          }
        >
          <div className="manage-pair">
            <div className="field">
              <input
                className="input"
                placeholder={viewer ?? "0x…"}
                value={batchTo}
                onChange={(e) => setBatchTo(e.target.value)}
                spellCheck={false}
              />
              <span className="field-hint">Recipient. Blank sends to you.</span>
            </div>
            <div className="field">
              <input
                className="input"
                inputMode="numeric"
                value={batchCount}
                onChange={(e) => setBatchCount(e.target.value)}
              />
              <span className="field-hint">How many. Keep to 25 or fewer.</span>
            </div>
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={
              busy ||
              reserveLeft === undefined ||
              reserveLeft <= 0n ||
              Number(batchCount) < 1 ||
              Number(batchCount) > 25
            }
            onClick={() =>
              call("mintBatch", [
                batchTo.trim() === "" ? viewer : batchTo.trim(),
                Array.from({ length: Number(batchCount) }, () => ""),
              ])
            }
          >
            Mint {batchCount || "0"} to wallet
          </button>
        </Card>

        {/* --- proceeds ------------------------------------------------ */}
        <Card
          title="Proceeds"
          body="Mint payments accumulate in the contract until you sweep them."
        >
          <Proceeds collection={collection!} />
          <button
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={() => call("withdraw", [viewer])}
          >
            Withdraw to my wallet
          </button>
        </Card>

        <Card
          title="Permanent settings"
          body="Fixed when the collection was deployed. Nothing can change these — not you, not us."
        >
          <dl className="manage-fixed">
            <div>
              <dt>Max supply</dt>
              <dd className="mono">{formatCount(maxSupply)}</dd>
            </div>
            <div>
              <dt>Public allocation</dt>
              <dd className="mono">{formatCount(publicLimit)}</dd>
            </div>
            <div>
              <dt>Max per wallet</dt>
              <dd className="mono">{perWallet === 0n ? "No cap" : formatCount(perWallet)}</dd>
            </div>
          </dl>
          <a
            className="btn btn-block"
            href={`${deployment.explorer}/address/${raw}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            View contract on explorer
          </a>
        </Card>
      </div>
    </section>
  );
}

/** Mint payments sit as native SOSO on the collection itself until swept. */
function Proceeds({ collection }: { collection: `0x${string}` }) {
  const { data } = useBalance({ address: collection, query: { refetchInterval: 12_000 } });

  return (
    <p className="manage-proceeds mono">
      {formatSoso(data?.value)} <span className="dim">SOSO held</span>
    </p>
  );
}

function Card({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="manage-card card">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="manage-stat">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}
