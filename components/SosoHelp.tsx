"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GUIDE_STEPS, type GuideIcon } from "@/config/guide";
import { GuideArt } from "@/components/GuideArt";
import { ArrowRight } from "@/components/Arrows";
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

/** Closed for this visit; it comes back next time while the wallet is still empty. */
const CALLOUT_KEY = "valuemint:soso-callout-closed";

/**
 * The same question, offered unasked: a bubble that drops from the wallet
 * button in the header and floats there while the wallet holds no SOSO.
 *
 * The pill in the wallet menu and the portfolio only helps somebody who opens
 * the menu or visits the portfolio, and the person with an empty wallet is
 * usually doing neither — they are on a listing, wondering why Buy will not
 * work. This meets them wherever they are, as soon as the balance reads 0.00.
 *
 * It goes the moment SOSO arrives, and closing it lasts for the visit: an
 * empty wallet next time is worth asking about again.
 *
 * The motion is transform only — a short drop, then a slow float — so the
 * bubble is fully visible even where animations never run, and still under
 * `prefers-reduced-motion`.
 */
export function SosoCallout({ balance }: { balance: bigint | undefined }) {
  const [closed, setClosed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(CALLOUT_KEY) === "1") setClosed(true);
    } catch {
      /* Blocked storage: it shows until closed, and closing still works. */
    }
  }, []);

  const dialog = open ? <SosoGuideDialog onClose={() => setOpen(false)} /> : null;
  if (!needsSoso(balance) || closed) return dialog;

  return (
    <>
      <div className="soso-callout" role="status">
        <button type="button" className="soso-callout-main" onClick={() => setOpen(true)}>
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
        <button
          type="button"
          className="soso-callout-close"
          aria-label="Close"
          onClick={() => {
            setClosed(true);
            try {
              window.sessionStorage.setItem(CALLOUT_KEY, "1");
            } catch {
              /* Then it returns on reload, which is survivable. */
            }
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {dialog}
    </>
  );
}

/**
 * The "Get SOSO onto ValueChain" step on its own, as a wide dialog.
 *
 * Wide and laid out as a journey rather than a column of paragraphs: the
 * idea and its drawing across the top, then the five moves as a row of cards,
 * each with its number, a picture, two or three words and one line, and the
 * way on to the full guide. It was
 * the guide panel's 30rem column first, and five sentences down a narrow
 * scroller read as homework rather than as five quick things to do.
 *
 * Built from the same `GUIDE_STEPS` entry as `/guide` and the welcome panel,
 * so the three cannot come to say different things. Portalled to the body: it
 * opens from inside the header, whose `backdrop-filter` would otherwise make
 * it centre itself in a 72px bar.
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
      <div className="sg" role="dialog" aria-modal="true" aria-labelledby="sg-title">
        <button ref={close} type="button" className="gd-close sg-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="sg-top">
          <div className="sg-intro">
            <p className="sg-kicker">Your balance is empty</p>
            <h2 id="sg-title" className="sg-title">
              {step.title}
            </h2>
            <p className="sg-lead">{step.body}</p>
          </div>
          <div className="sg-art">
            <GuideArt id={step.id} />
          </div>
        </div>

        {step.howTo === undefined ? null : (
          <ol className="sg-steps">
            {step.howTo.map((a, i) => (
              <li key={a.title} className="sg-card">
                <div className="sg-card-top">
                  <span className="sg-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <ActionIcon icon={a.icon} />
                </div>
                <h3 className="sg-card-title">{a.title}</h3>
                <p className="sg-card-text">{a.text}</p>
                {a.link === undefined ? null : (
                  <a className="sg-card-link" href={a.link.href} target="_blank" rel="noreferrer noopener">
                    {a.link.label}
                    <span aria-hidden="true">&#8599;</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}

        {/* The step's longer caveat is left to `/guide`, by request: the
            dialog is the five moves and the way to the rest. */}
        <div className="sg-foot">
          <Link className="btn btn-sm sg-full" href={`/guide#${step.id}`} onClick={onClose}>
            Full guide
            <ArrowRight />
          </Link>
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * The picture on each instruction card: one line-drawn glyph per move, in the
 * text's own colour, so it reads in both themes without a colour of its own.
 */
function ActionIcon({ icon }: { icon: GuideIcon }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg className="sg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {icon === "login" ? (
        /* A wallet: what logs you in. */
        <>
          <rect x="3" y="6" width="18" height="13" rx="2.5" {...common} />
          <path d="M3 9.5h13.5a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H14" {...common} />
          <circle cx="15.5" cy="12" r="1" fill="currentColor" />
          <path d="M6 6V5a2 2 0 0 1 2-2h8" {...common} />
        </>
      ) : icon === "deposit" ? (
        /* Down into a tray. */
        <>
          <path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" {...common} />
          <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" {...common} />
        </>
      ) : icon === "buy" ? (
        /* One thing for another. */
        <>
          <path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5" {...common} />
          <path d="M20 16H6M9.5 12.5 6 16l3.5 3.5" {...common} />
        </>
      ) : icon === "transfer" ? (
        /* From one box to the other. */
        <>
          <rect x="2.5" y="7" width="7" height="10" rx="1.8" {...common} />
          <rect x="14.5" y="7" width="7" height="10" rx="1.8" {...common} />
          <path d="M10 12h3.5M11.8 10.2 13.6 12l-1.8 1.8" {...common} />
        </>
      ) : (
        /* Done: connected and ready. */
        <>
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="m8.2 12.2 2.6 2.6 5-5.2" {...common} />
        </>
      )}
    </svg>
  );
}
