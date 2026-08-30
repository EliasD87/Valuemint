"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getAddress, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useSignMessage,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ValueChainCollectionFactoryAbi, deployment } from "@/config/contracts";
import { valuechain } from "@/config/chain";
import { CLAIM_HEADERS, contentDigest, fileHash, uploadMessage } from "@/lib/uploadClaim";
import "@/styles/create.css";

/**
 * Creating a collection, artwork included.
 *
 * The artwork is pinned *before* the contract is deployed, so the collection is
 * born pointing at its own images and never exists in a blank state. That removes
 * a whole class of problem: no "set your metadata later" step to forget, nothing
 * to detect, and one transaction instead of two.
 *
 * Nothing here mentions IPFS, CIDs or base URIs. Those are plumbing; a creator
 * uploads pictures and says how many of each. Advanced hosting lives behind a
 * disclosure for the few who want it.
 */

interface Design {
  id: string;
  file: File;
  preview: string;
  pinnedName: string;
  name: string;
  count: number;
  tier: string;
}

const TIERS = ["", "Legendary", "Epic", "Rare", "Common"];
const STEPS = ["Basics", "Artwork", "Sale", "Review"] as const;

export default function Create() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [designs, setDesigns] = useState<Design[]>([]);
  const [price, setPrice] = useState("0.01");
  const [perWallet, setPerWallet] = useState("5");
  const [royalty, setRoyalty] = useState("5");
  const [reserve, setReserve] = useState("0");
  const [advanced, setAdvanced] = useState(false);
  const [manualUri, setManualUri] = useState("");
  const [manualSupply, setManualSupply] = useState("100");
  const [seed] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

  const [signing, setSigning] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const { writeContract, data: hash, isPending: txSigning, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  useEffect(() => () => designs.forEach((d) => URL.revokeObjectURL(d.preview)), [designs]);

  // Supply comes from the artwork, so the two can never disagree.
  const supply = useMemo(() => designs.reduce((n, d) => n + (d.count || 0), 0), [designs]);
  const usingUpload = !advanced || manualUri.trim() === "";
  const effectiveSupply = usingUpload ? supply : Number(manualSupply) || 0;

  const addFiles = (list: FileList | null) => {
    if (list === null) return;
    setProblem(undefined);

    const added: Design[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) {
        setProblem(`"${file.name}" isn't an image.`);
        continue;
      }
      added.push({
        id: `${file.name}-${file.size}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        pinnedName: file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-"),
        name: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().toUpperCase(),
        count: 1,
        tier: "",
      });
    }
    setDesigns((d) => [...d, ...added]);
  };

  const update = (id: string, patch: Partial<Design>) =>
    setDesigns((l) => l.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const remove = (id: string) =>
    setDesigns((l) => {
      const gone = l.find((d) => d.id === id);
      if (gone !== undefined) URL.revokeObjectURL(gone.preview);
      return l.filter((d) => d.id !== id);
    });

  const problems = validate();

  function validate(): string[] {
    const out: string[] = [];
    if (name.trim() === "") out.push("Give the collection a name.");
    if (symbol.trim() === "") out.push("Give it a short symbol.");
    if (usingUpload && designs.length === 0) out.push("Add at least one image.");
    if (usingUpload && supply === 0) out.push("Each design needs at least one edition.");
    if (Number.isNaN(Number(price)) || Number(price) < 0) out.push("Price must be a number.");
    const r = Number(royalty);
    if (Number.isNaN(r) || r < 0 || r > 10) out.push("Royalty must be between 0 and 10%.");
    if (!Number.isInteger(Number(perWallet)) || Number(perWallet) < 0)
      out.push("Per-wallet limit must be a whole number.");
    if (Number(reserve) > effectiveSupply) out.push("Your reserve cannot exceed the supply.");
    return out;
  }

  /** Pin the artwork, then deploy with its address already baked in. */
  const create = async () => {
    setProblem(undefined);
    let baseUri = manualUri.trim();

    if (usingUpload) {
      if (address === undefined) {
        setProblem("Connect your wallet first.");
        return;
      }

      // Serialised once and reused verbatim. Re-stringifying for the digest
      // would risk a different key order than the body actually carries, and
      // the signature would no longer match on the server.
      const configJson = JSON.stringify({
        collectionName: name.trim(),
        description: description.trim(),
        seed,
        designs: designs.map((d) => ({
          file: d.pinnedName,
          name: d.name,
          count: d.count,
          ...(d.tier === "" ? {} : { tier: d.tier }),
        })),
      });

      // Uploading spends the host's pinning account, so the server will only
      // accept it from a wallet that signed for this exact set of files. Free,
      // and no transaction - but it does mean a wallet prompt.
      const signer = getAddress(address);
      const issuedAt = new Date().toISOString();
      let signature: `0x${string}`;

      setSigning(true);
      try {
        /**
         * Hash the bytes, not the name and size.
         *
         * The signature has to bind the exact files being sent. Hashing
         * `name:size` bound only their shape, so a captured signature stayed
         * valid for any same-named file of the same length.
         */
        const digest = await contentDigest(
          configJson,
          await Promise.all(
            designs.map(async (d) => ({
              name: d.pinnedName,
              hash: await fileHash(await d.file.arrayBuffer()),
            })),
          ),
        );
        signature = await signMessageAsync({
          message: uploadMessage({
            address: signer,
            collectionName: name.trim(),
            issuedAt,
            digest,
          }),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setProblem(
          /rejected|denied|User denied/i.test(msg)
            ? "You cancelled the signature, so nothing was uploaded."
            : "Could not sign the upload. Reconnect your wallet and try again.",
        );
        setSigning(false);
        return;
      }
      setSigning(false);

      setPinning(true);
      try {
        const form = new FormData();
        for (const d of designs) form.append("images", d.file, d.pinnedName);
        form.append("config", configJson);

        const res = await fetch("/api/pin", {
          method: "POST",
          // No Content-Type: the browser has to set the multipart boundary.
          headers: {
            [CLAIM_HEADERS.address]: signer,
            [CLAIM_HEADERS.signature]: signature,
            [CLAIM_HEADERS.issuedAt]: issuedAt,
          },
          body: form,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Upload failed.");
        baseUri = body.baseUri as string;
      } catch (e) {
        setProblem(e instanceof Error ? e.message : "Upload failed.");
        setPinning(false);
        return;
      }
      setPinning(false);
    }

    reset();
    const publicLimit = BigInt(Math.max(effectiveSupply - (Number(reserve) || 0), 0));

    writeContract({
      address: deployment.factory,
      abi: ValueChainCollectionFactoryAbi,
      functionName: "createCollection",
      args: [
        name.trim(),
        symbol.trim().toUpperCase(),
        baseUri,
        {
          maxSupply: BigInt(effectiveSupply),
          mintPrice: parseEther(price || "0"),
          publicMintLimit: publicLimit,
          maxPerWallet: BigInt(perWallet || "0"),
        },
        address!,
        BigInt(Math.round(Number(royalty || "0") * 100)),
      ],
    });
  };

  if (isSuccess) {
    return (
      <section className="page section create-done">
        <p className="eyebrow">Created</p>
        <h1 className="create-title">{name} is live, artwork and all.</h1>
        <p className="lede">
          You own it outright. {effectiveSupply} tokens, {usingUpload ? `${designs.length} designs` : "your metadata"},
          already attached — nothing else to set up.
        </p>
        <div className="create-actions">
          <Link className="btn btn-primary btn-lg" href="/manage">
            Manage it
          </Link>
          <a
            className="btn btn-lg"
            href={`${deployment.explorer}/tx/${receipt?.transactionHash}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            View transaction
          </a>
        </div>
        <p className="field-hint create-next">
          Public minting starts closed. Open it from Manage when you&rsquo;re ready.
        </p>
      </section>
    );
  }

  const busy = signing || pinning || txSigning || confirming;

  return (
    <section className="page section">
      <div className="create-head">
        <p className="eyebrow">Create</p>
        <h1 className="create-title">A collection, start to finish.</h1>
        <ol className="create-steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? "is-current" : i < step ? "is-done" : ""}>
              <button onClick={() => setStep(i)}>
                <span className="create-step-n">{i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="create-grid">
        <div className="create-form">
          {step === 0 ? (
            <>
              <Field label="Name" hint="Shown in wallets and marketplaces. Permanent." value={name} onChange={setName} placeholder="Nocturne Editions" />
              <Field label="Symbol" hint="A short ticker. Permanent." value={symbol} onChange={(v) => setSymbol(v.toUpperCase())} placeholder="NCT" maxLength={11} />
              <div className="field">
                <label>Description</label>
                <textarea
                  className="input create-textarea"
                  rows={3}
                  placeholder="Shown on every piece."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div
                className="studio-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
              >
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                <p className="studio-drop-title">Drop your artwork here</p>
                <p className="muted">One image per design. Square works best — marketplaces crop to square.</p>
                <button className="btn btn-primary" onClick={() => fileInput.current?.click()}>
                  Choose images
                </button>
              </div>

              {designs.length > 0 ? (
                <div className="studio-designs">
                  {designs.map((d) => (
                    <div key={d.id} className="studio-design card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.preview} alt={d.name} />
                      <div className="studio-design-fields">
                        <div className="field">
                          <label>Name</label>
                          <input className="input" value={d.name} onChange={(e) => update(d.id, { name: e.target.value })} />
                        </div>
                        <div className="studio-design-row">
                          <div className="field">
                            <label>How many</label>
                            <input className="input" inputMode="numeric" value={d.count} onChange={(e) => update(d.id, { count: Math.max(0, Number(e.target.value) || 0) })} />
                          </div>
                          <div className="field">
                            <label>Tier</label>
                            <select className="input" value={d.tier} onChange={(e) => update(d.id, { tier: e.target.value })}>
                              {TIERS.map((t) => (
                                <option key={t} value={t}>
                                  {t === "" ? "None" : t}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button className="btn btn-sm" onClick={() => remove(d.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <details className="create-advanced" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
                <summary>Already host your own metadata?</summary>
                <div className="create-advanced-body">
                  <Field
                    label="Metadata address"
                    hint="Each token resolves to this plus its id, so it must end with a slash. Leave blank to use the images above."
                    value={manualUri}
                    onChange={setManualUri}
                    placeholder="https://…/ or ipfs://…/"
                  />
                  {!usingUpload ? (
                    <Field label="Total supply" hint="How many tokens exist. Permanent." value={manualSupply} onChange={setManualSupply} />
                  ) : null}
                </div>
              </details>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Field label="Mint price (SOSO)" hint="What the public pays per piece. Changeable later." value={price} onChange={setPrice} />
              <Field label="Max per wallet" hint="0 for no limit. Permanent." value={perWallet} onChange={setPerWallet} />
              <Field label="Keep for yourself" hint="Held back from the public sale. Permanent." value={reserve} onChange={setReserve} />
              <Field label="Resale royalty (%)" hint="Your cut of every resale, forever. Up to 10%." value={royalty} onChange={setRoyalty} />
            </>
          ) : null}

          {step === 3 ? (
            <dl className="create-review">
              <Row label="Name" value={`${name || "—"} (${symbol || "—"})`} />
              <Row label="Supply" value={String(effectiveSupply)} />
              <Row label="Designs" value={usingUpload ? String(designs.length) : "Your own metadata"} />
              <Row label="Public sale" value={String(Math.max(effectiveSupply - (Number(reserve) || 0), 0))} />
              <Row label="You keep" value={reserve || "0"} />
              <Row label="Price" value={`${price || "0"} SOSO`} />
              <Row label="Per wallet" value={perWallet === "0" ? "No limit" : perWallet} />
              <Row label="Royalty" value={`${royalty || "0"}%`} />
            </dl>
          ) : null}

          {/* The action sits under the work, not beside it. It used to live in the
              sidebar, which put "Continue" next to a summary rather than next to
              the fields it advances past — and left no way back at all. */}
          <div className="create-nav">
            {step > 0 ? (
              <button className="btn btn-lg" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : (
              <span />
            )}

            {step < 3 ? (
              <button className="btn btn-primary btn-lg" onClick={() => setStep(step + 1)}>
                Continue
              </button>
            ) : !isConnected ? (
              <button
                className="btn btn-primary btn-lg"
                disabled={connecting}
                onClick={() => {
                  const injected = connectors.find((c) => c.id === "injected");
                  if (injected !== undefined) connect({ connector: injected });
                }}
              >
                {connecting ? "Check your wallet…" : "Connect wallet"}
              </button>
            ) : chainId !== valuechain.id ? (
              <button className="btn btn-primary btn-lg" disabled={switching} onClick={() => switchChain({ chainId: valuechain.id })}>
                {switching ? "Switching…" : "Switch to ValueChain"}
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" disabled={busy || problems.length > 0} onClick={create}>
                {signing
                ? "Sign to authorise…"
                : pinning
                  ? "Uploading artwork…"
                  : txSigning
                    ? "Confirm in wallet…"
                    : confirming
                      ? "Creating…"
                      : "Create collection"}
              </button>
            )}
          </div>

          {problem !== undefined ? <p className="create-error">{problem}</p> : null}
          {writeError !== null ? (
            <p className="create-error">
              {/rejected|denied|User denied/i.test(writeError.message) ? "You cancelled the transaction." : writeError.message.slice(0, 160)}
            </p>
          ) : null}
        </div>

        <aside className="create-panel card">
          <h2 className="create-panel-title">{name.trim() || "Untitled"}</h2>
          <p className="create-symbol mono">{symbol.trim() || "—"}</p>

          {designs.length > 0 ? (
            <div className="create-thumbs">
              {designs.slice(0, 6).map((d) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={d.preview} alt="" />
              ))}
            </div>
          ) : null}

          <dl className="create-summary">
            <Row label="Supply" value={effectiveSupply === 0 ? "—" : String(effectiveSupply)} />
            <Row label="Price" value={`${price || "0"} SOSO`} />
            <Row label="Royalty" value={`${royalty || "0"}%`} />
            <Row label="Cost to create" value="Gas only" />
          </dl>

          <p className="create-permanent">
            Supply, the public allocation and the per-wallet limit are <strong>permanent</strong>.
            Price, artwork and royalty can be changed later.
          </p>

          {problems.length > 0 && step === 3 ? (
            <div className="create-problems">
              <p className="create-problems-title">Before you can create</p>
              <ul>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
      <span className="field-hint">{hint}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="create-row">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}
