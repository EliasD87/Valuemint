"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import {
  ABOUT_MAX,
  NAME_MAX,
  cleanText,
  creatorApplyMessage,
  normaliseHandle,
  normaliseLink,
} from "@/lib/creatorApply";
import { useT } from "@/lib/i18n";

/** What has been typed but not sent, kept across reloads. */
const DRAFT_KEY = "creator-apply-draft";
/** Wallets this browser has applied from, so returning shows "received". */
const SENT_KEY = "creator-apply-sent";

interface Draft {
  handle: string;
  collection: string;
  about: string;
  link: string;
}
const EMPTY: Draft = { handle: "", collection: "", about: "", link: "" };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage refused (private mode): the draft just lives as long as the page.
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Phase = "idle" | "signing" | "sending";

/**
 * "Apply to create", on /create for wallets that are not approved yet.
 *
 * Modelled on the KOL application: a few fields and a free signature from the
 * wallet that would create, so the wallet on file is one the applicant
 * controls. Nothing approves anyone automatically; the owner reviews the
 * applications and adds accepted wallets to config/creators.ts, after which
 * Create and Manage appear in that wallet's menu.
 */
export function CreatorApply() {
  const tr = useT();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [again, setAgain] = useState(false);

  // Restored after mount, so the server render and the first client render agree.
  useEffect(() => {
    setDraft(readJson(DRAFT_KEY, EMPTY));
    setSent(readJson<Record<string, string>>(SENT_KEY, {}));
  }, []);

  const edit = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => {
      const next = { ...d, ...patch };
      writeJson(DRAFT_KEY, next);
      return next;
    });
  };

  const handle = normaliseHandle(draft.handle);
  const collection = cleanText(draft.collection);
  const about = cleanText(draft.about);
  const link = draft.link.trim() === "" ? "" : normaliseLink(draft.link);
  const busy = phase !== "idle";
  const ready =
    isConnected &&
    address !== undefined &&
    handle !== undefined &&
    collection !== "" &&
    about !== "" &&
    link !== undefined &&
    !busy;

  const sentAs = address === undefined ? undefined : sent[address.toLowerCase()];

  const submit = async () => {
    if (!ready || address === undefined || handle === undefined || link === undefined) return;
    setError(null);
    const issuedAt = new Date().toISOString();
    const application = { wallet: address, handle, collection, about, link, issuedAt };
    let signature: `0x${string}`;
    try {
      setPhase("signing");
      signature = await signMessageAsync({ message: creatorApplyMessage(application) });
    } catch {
      setPhase("idle");
      setError("The signature was cancelled. Nothing was sent.");
      return;
    }
    try {
      setPhase("sending");
      const res = await fetch("/api/creator-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...application, signature }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || out.ok !== true) throw new Error(out.error ?? "Could not send your application. Try again.");
      const next = { ...sent, [address.toLowerCase()]: handle };
      setSent(next);
      writeJson(SENT_KEY, next);
      writeJson(DRAFT_KEY, null);
      setDraft(EMPTY);
      setAgain(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your application. Try again.");
    } finally {
      setPhase("idle");
    }
  };

  if (sentAs !== undefined && !again) {
    return (
      <div className="capply capply-sent" aria-live="polite">
        <p className="capply-title">{tr("Application received")}</p>
        <p className="muted">
          {tr("Thanks, @{handle}. We review every application and will reach out on X. Once you are approved, Create appears in the menu when this wallet is connected.", { handle: sentAs })}
        </p>
        <button type="button" className="btn btn-sm" onClick={() => setAgain(true)}>
          {tr("Update my application")}
        </button>
      </div>
    );
  }

  return (
    <form
      className="capply"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="capply-title">{tr("Apply to create")}</p>

      <div className="field">
        <label htmlFor="capply-handle">{tr("Your X handle")}</label>
        <input
          id="capply-handle"
          className="input"
          value={draft.handle}
          onChange={(e) => edit({ handle: e.target.value })}
          placeholder="@yourhandle"
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          disabled={busy}
        />
        {draft.handle !== "" && handle === undefined ? (
          <span className="field-hint capply-bad">{tr("That doesn’t look like an X handle.")}</span>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="capply-name">{tr("Collection name")}</label>
        <input
          id="capply-name"
          className="input"
          value={draft.collection}
          onChange={(e) => edit({ collection: e.target.value })}
          maxLength={NAME_MAX}
          disabled={busy}
        />
      </div>

      <div className="field">
        <label htmlFor="capply-about">{tr("About the collection")}</label>
        <textarea
          id="capply-about"
          className="input create-textarea"
          rows={4}
          value={draft.about}
          onChange={(e) => edit({ about: e.target.value })}
          placeholder={tr("What it is, how many pieces, and the mint price you have in mind.")}
          maxLength={ABOUT_MAX}
          disabled={busy}
        />
        <span className="field-hint">
          {draft.about.length} / {ABOUT_MAX}
        </span>
      </div>

      <div className="field">
        <label htmlFor="capply-link">{tr("Link to your artwork (optional)")}</label>
        <input
          id="capply-link"
          className="input"
          value={draft.link}
          onChange={(e) => edit({ link: e.target.value })}
          placeholder="https://"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          disabled={busy}
        />
        {link === undefined ? <span className="field-hint capply-bad">{tr("That doesn’t look like a web address.")}</span> : null}
      </div>

      <div className="field">
        <span className="capply-label">{tr("Your wallet")}</span>
        {isConnected && address !== undefined ? (
          <p className="muted">
            <b className="mono">{short(address)}</b> {tr("This is the wallet that would be approved to create.")}
          </p>
        ) : (
          <ConnectButton className="btn">{tr("Connect wallet")}</ConnectButton>
        )}
      </div>

      {error !== null ? <p className="create-error">{tr(error)}</p> : null}

      <button type="submit" className="btn btn-primary" disabled={!ready}>
        {phase === "signing" ? tr("Sign in your wallet…") : phase === "sending" ? tr("Sending…") : tr("Sign and apply")}
      </button>
      <p className="field-hint">{tr("Signing is free and sends nothing from your wallet. It proves the wallet is yours.")}</p>
    </form>
  );
}
