"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { KOLS, kolLocal } from "@/config/kols";
import { applyMessage, normaliseHandle } from "@/lib/kolApply";
import "./KolApply.css";

/** What someone has typed but not sent yet, kept across closing and reloads. */
const DRAFT_KEY = "kol-apply-draft";
/** The last application this browser sent, so reopening says so. */
const SENT_KEY = "kol-apply-sent";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage refused (private mode): the draft just lives as long as the page.
  }
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Phase = "idle" | "signing" | "sending" | "sent";

/**
 * "Apply to join" on /kols: a button, and the pop-up it opens.
 *
 * The applicant gives their X handle and signs a free message with the wallet
 * their portrait would go to. Closing the pop-up keeps what they typed — the
 * state lives here, outside the dialog, and in localStorage — so they can step
 * away, check their handle, and come back to it. Nothing is kept once it has
 * been sent, except a note that it was.
 */
export function KolApply() {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sentAs, setSentAs] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // Restore after mount, so the server render and the first client render agree.
  useEffect(() => {
    setHandle(read(DRAFT_KEY) ?? "");
    setSentAs(read(SENT_KEY));
  }, []);

  /*
   * Development only: `?kap-preview=found` opens straight onto the "seat
   * found" sequence, so it can be looked at without a wallet signature and a
   * real row in the database. `NODE_ENV` is inlined at build time, so this
   * whole block is dead code in production and removed.
   */
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (new URLSearchParams(window.location.search).get("kap-preview") !== "found") return;
    setSentAs("yourhandle");
    setPhase("sent");
    setOpen(true);
  }, []);

  const edit = (v: string) => {
    setHandle(v);
    setError(null);
    write(DRAFT_KEY, v === "" ? null : v);
  };

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  return (
    <>
      {/* Three faces from the set (not the three the gift line above already
          shows) and an empty seat beside them: the offer,
          said as a picture. Once applied, the seat shows a tick instead. */}
      <button
        ref={opener}
        type="button"
        className={`kap-open${sentAs === null ? "" : " is-sent"}`}
        onClick={() => setOpen(true)}
      >
        <span className="kap-faces" aria-hidden="true">
          {KOLS.slice(3, 6).map((k) => (
            <Image key={k.n} src={kolLocal(k)} alt="" width={56} height={56} loading="eager" />
          ))}
          <span className="kap-seat">{sentAs === null ? "+" : "✓"}</span>
        </span>
        <span className="kap-label">
          {sentAs === null ? (
            <>
              Want in? <b>Apply to join</b>
            </>
          ) : (
            <>
              You&rsquo;ve applied <b>Update</b>
            </>
          )}
        </span>
        <span className="kap-arrow" aria-hidden="true">
          →
        </span>
      </button>
      {open ? (
        <ApplyDialog
          handle={handle}
          onHandle={edit}
          phase={phase}
          setPhase={setPhase}
          error={error}
          setError={setError}
          sentAs={sentAs}
          onSent={(h) => {
            setSentAs(h);
            write(SENT_KEY, h);
            write(DRAFT_KEY, null);
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function ApplyDialog({
  handle,
  onHandle,
  phase,
  setPhase,
  error,
  setError,
  sentAs,
  onSent,
  onClose,
}: {
  handle: string;
  onHandle: (v: string) => void;
  phase: Phase;
  setPhase: (p: Phase) => void;
  error: string | null;
  setError: (e: string | null) => void;
  sentAs: string | null;
  onSent: (handle: string) => void;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const input = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  useEffect(() => {
    if (mounted && phase !== "sent") input.current?.focus();
  }, [mounted, phase]);

  if (!mounted) return null;

  const clean = normaliseHandle(handle);
  const busy = phase === "signing" || phase === "sending";
  const ready = isConnected && address !== undefined && clean !== undefined && !busy;

  const submit = async () => {
    if (!ready || address === undefined || clean === undefined) return;
    setError(null);
    const issuedAt = new Date().toISOString();
    let signature: `0x${string}`;
    try {
      setPhase("signing");
      signature = await signMessageAsync({ message: applyMessage({ wallet: address, handle: clean, issuedAt }) });
    } catch {
      setPhase("idle");
      setError("The signature was cancelled. Nothing was sent.");
      return;
    }
    try {
      setPhase("sending");
      const res = await fetch("/api/kol-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address, handle: clean, issuedAt, signature }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || out.ok !== true) throw new Error(out.error ?? "Could not send your application. Try again.");
      onSent(clean);
      setPhase("sent");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Could not send your application. Try again.");
    }
  };

  return createPortal(
    <>
      <div className="kap-scrim" onClick={onClose} aria-hidden="true" />
      <div className="kap" role="dialog" aria-modal="true" aria-labelledby="kap-title">
        <div className="kap-head">
          <div>
            <p className="kap-kicker">ValueMint KOL collection</p>
            <h2 id="kap-title">{phase === "sent" ? "Application received" : "Apply to join"}</h2>
          </div>
          <button type="button" className="kap-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {phase === "sent" ? (
          <SeatFound handle={sentAs ?? clean ?? ""} onClose={onClose} />
        ) : (
          <form
            className="kap-body"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="kap-lede">
              For the people who keep showing up around SoDEX. Tell us who you are, and if you&rsquo;re picked
              we&rsquo;ll make your 1/1 portrait.
            </p>
            {sentAs !== null ? (
              <p className="kap-note">
                You applied as <b>@{sentAs}</b>. Sending again from the same wallet updates it.
              </p>
            ) : null}

            <label className="kap-field">
              <span>Your X handle</span>
              <span className="kap-at">
                <span aria-hidden="true">@</span>
                <input
                  ref={input}
                  value={handle}
                  onChange={(e) => onHandle(e.target.value)}
                  placeholder="yourhandle"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={80}
                  disabled={busy}
                />
              </span>
              {handle !== "" && clean === undefined ? (
                <small className="kap-bad">That doesn&rsquo;t look like an X handle.</small>
              ) : null}
            </label>

            <div className="kap-field">
              <span>Your wallet</span>
              {isConnected && address !== undefined ? (
                <p className="kap-wallet">
                  <b className="mono">{short(address)}</b> Your portrait would be sent here.
                </p>
              ) : (
                <ConnectButton className="btn btn-block">Connect wallet</ConnectButton>
              )}
            </div>

            {error !== null ? <p className="kap-error">{error}</p> : null}

            <button type="submit" className="btn btn-primary btn-block" disabled={!ready}>
              {phase === "signing" ? "Sign in your wallet…" : phase === "sending" ? "Sending…" : "Sign and apply"}
            </button>
            <p className="kap-fine">Signing is free and sends nothing from your wallet. It proves the wallet is yours.</p>
          </form>
        )}
      </div>
    </>,
    document.body,
  );
}

/**
 * What the applicant sees once their application is saved: the empty seat
 * from the button is "found" and filled.
 *
 * Every line in it is something that has actually happened by the time it
 * shows — the wallet signed, the handle received, the row saved — because this
 * only mounts after /api/kol-apply said ok. It does not pretend to check their
 * posts or anything else nobody checked.
 *
 * The sequence is driven by timers setting a stage, not by CSS animation
 * delays: content never waits on an animation that might not run, and the
 * final state is simply the last stage. With reduced motion it starts there.
 */
function SeatFound({ handle, onClose }: { handle: string; onClose: () => void }) {
  const [stage, setStage] = useState(0);
  const done = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(4);
      return;
    }
    const timers = [450, 900, 1350, 1900].map((ms, i) => window.setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  useEffect(() => {
    if (stage === 4) done.current?.focus();
  }, [stage]);

  const checks = ["Wallet signed", `@${handle} received`, "Saved to the list"];
  const found = stage >= 4;

  return (
    <div className={`kap-body kap-found${found ? " is-found" : ""}`} aria-live="polite">
      <div className="kap-radar" aria-hidden="true">
        <span className="kap-ring" />
        <span className="kap-ring is-late" />
        <span className="kap-sweep" />
        <span className="kap-burst">
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} style={{ ["--a" as string]: `${i * 36}deg` }} />
          ))}
        </span>
        <span className="kap-radar-seat">{found ? "✓" : "+"}</span>
      </div>

      <p className="kap-found-title">{found ? "You’re on the list" : "Finding you a seat…"}</p>

      <ul className="kap-checks">
        {checks.map((c, i) => (
          <li key={c} className={stage > i ? "is-on" : undefined}>
            <span aria-hidden="true">{stage > i ? "✓" : ""}</span>
            {c}
          </li>
        ))}
      </ul>

      <div className={`kap-found-end${found ? " is-on" : ""}`}>
        <p className="kap-done">
          We&rsquo;ll reach out to you on X if you&rsquo;re picked, <b>@{handle}</b>. Keep showing up 🧡
        </p>
        <button ref={done} type="button" className="btn btn-primary btn-block" onClick={onClose} disabled={!found}>
          Done
        </button>
      </div>
    </div>
  );
}
