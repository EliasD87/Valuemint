"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GUIDE_STEPS } from "@/config/guide";
import { GuideArt } from "@/components/GuideArt";
import { GuideHowTo } from "@/components/GuideHowTo";
import { needsSoso } from "@/lib/needsSoso";
import "@/styles/guide.css";

/**
 * "Where is my SOSO?" — shown beside an empty balance, and the way out of it.
 *
 * People arrived with SOSO on SoDEX and a ValueChain wallet showing nothing,
 * and could not see the connection: the SOSO sits in their SoDEX Spot account
 * until it is transferred to the EVM wallet. The guide explains it, but a
 * newcomer staring at "0.00" is not reading a guide. So the question they are
 * asking is put right where they are asking it, and it opens only the step
 * that answers it.
 *
 * Renders nothing unless the balance is empty. Callers decide the balance;
 * this does not read the chain.
 */
export function WhereIsMySoso({ balance }: { balance: bigint | undefined }) {
  const [open, setOpen] = useState(false);
  if (!needsSoso(balance)) return null;

  return (
    <>
      <button
        type="button"
        className="soso-help"
        onClick={() => setOpen(true)}
        title="How to get SOSO onto ValueChain"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M6.3 6.4a1.8 1.8 0 1 1 2.5 1.65c-.5.22-.8.6-.8 1.1v.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.4" r=".85" fill="currentColor" />
        </svg>
        Where is my SOSO?
      </button>
      {open ? <SosoGuideDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * The "Get SOSO onto ValueChain" step on its own, as a dialog.
 *
 * Built from the same `GUIDE_STEPS` entry as `/guide` and the guide panel —
 * the same drawing, the same numbered steps — so the three cannot come to say
 * different things. Portalled to the body: it opens from inside the header's
 * wallet menu, and the header's `backdrop-filter` would otherwise make it
 * centre itself in a 72px bar.
 */
function SosoGuideDialog({ onClose }: { onClose: () => void }) {
  const step = GUIDE_STEPS.find((s) => s.id === "soso");
  const [mounted, setMounted] = useState(false);
  const close = useRef<HTMLButtonElement>(null);

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

  /* Focus starts inside the dialog, so a keyboard user is not left behind it. */
  useEffect(() => {
    if (mounted) close.current?.focus();
  }, [mounted]);

  if (!mounted || step === undefined) return null;

  return createPortal(
    <>
      <div className="gd-scrim" onClick={onClose} aria-hidden="true" />
      <div className="gd" role="dialog" aria-modal="true" aria-label={step.title}>
        <div className="gd-head">
          <p className="gd-count">Your balance is empty</p>
          <button ref={close} type="button" className="gd-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="gd-body">
          <div className="gd-art">
            <GuideArt id={step.id} />
          </div>
          <h2 className="gd-title">{step.title}</h2>
          <p className="gd-text">{step.body}</p>
          {step.howTo === undefined ? null : <GuideHowTo actions={step.howTo} />}
          {step.more === undefined ? null : <p className="soso-help-note">{step.more}</p>}
          <Link className="gd-howto-link" href={`/guide#${step.id}`} onClick={onClose}>
            Open the full guide
          </Link>
        </div>
      </div>
    </>,
    document.body,
  );
}
