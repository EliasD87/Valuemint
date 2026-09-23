"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useDeferred } from "@/hooks/useDeferred";
import { GUIDE_STEPS } from "@/config/guide";
import { GuideArt } from "@/components/GuideArt";
import "@/styles/guide.css";

/**
 * A way in to the guide, for people who want one.
 *
 * Not a modal on arrival. Somebody landing here is trying to look at a
 * marketplace, and covering it to explain it is backwards — the artwork and
 * the prices are the pitch. `ListPrompt` reached the same conclusion for the
 * same reason and sits in the other corner; this one yields to it, because a
 * prompt about selling what you already hold is aimed at somebody further
 * along than a prompt about how any of this works.
 *
 * So: a pill that waits, says one thing, and opens a panel only if asked.
 * Closing it is permanent, and `/guide` stays in the footer for afterwards.
 */

/** Dismissed for good. There is a footer link; nobody needs asking twice. */
const STORE_KEY = "valuemint:guide-dismissed";

function alreadyDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) === "1";
  } catch {
    /* Private windows and blocked storage both land here. Showing the pill to
       somebody who has seen it is a far smaller failure than hiding it from
       somebody who has not. */
    return false;
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(STORE_KEY, "1");
  } catch {
    /* Then it comes back next visit, which is survivable. */
  }
}

export function GuidePill() {
  /**
   * After the page, not with it.
   *
   * The same reasoning as `WarmChain` and `ListPrompt`: nothing here is what
   * anybody is waiting for, and a pill animating in over a half-painted home
   * page is the kind of thing people close without reading.
   */
  const ready = useDeferred(1800);

  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);

  /* Read after mount, never during render: the server has no localStorage, so
     any other default would be a guess React then has to reconcile. Starting
     dismissed means the pill can only ever appear, never flash and vanish. */
  useEffect(() => setDismissed(alreadyDismissed()), []);

  const close = () => {
    setOpen(false);
    setDismissed(true);
    remember();
  };

  if (dismissed || !ready) return null;

  return (
    <>
      {open ? <GuidePanel onClose={close} /> : null}

      <div className="gp">
        <button type="button" className="gp-open" onClick={() => setOpen(true)}>
          <span className="gp-mark" aria-hidden="true">
            ?
          </span>
          New to ValueMint?
        </button>
        <button
          type="button"
          className="gp-dismiss"
          aria-label="Dismiss the guide"
          onClick={close}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </>
  );
}

/**
 * The steps, one at a time.
 *
 * Portalled to `document.body` for the reason every dialog on this site is:
 * `backdrop-filter` and `transform` both make a containing block for
 * `position: fixed`, and the header has one — a dialog rendered in place
 * centres itself inside the 72px bar instead of the window.
 */
function GuidePanel({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
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

  if (!mounted) return null;

  const current = GUIDE_STEPS[step]!;
  const last = step === GUIDE_STEPS.length - 1;

  return createPortal(
    <>
      <div className="gd-scrim" onClick={onClose} aria-hidden="true" />
      <div className="gd" role="dialog" aria-modal="true" aria-label="Getting started on ValueMint">
        <div className="gd-head">
          <p className="gd-count">
            {step + 1} of {GUIDE_STEPS.length}
          </p>
          <button type="button" className="gd-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="gd-body">
          {/* The same drawing the page uses, at panel size — one idea, drawn
              once, so the short version and the long version cannot come to
              disagree about what an allowance looks like. */}
          <div className="gd-art">
            <GuideArt id={current.id} />
          </div>

          {/* Absent on every step today, and the panel is written to read
              properly without it. See `config/guide.ts`. */}
          {current.clip === undefined ? null : (
            <video
              className="gd-clip"
              /* `preload="none"` so opening the guide is what fetches it, and
                 never the page load. Muted and inline or a phone refuses. */
              preload="none"
              poster={current.clip.poster}
              src={current.clip.src}
              aria-label={current.clip.alt}
              muted
              loop
              autoPlay
              playsInline
            />
          )}

          <h2 className="gd-title">{current.title}</h2>
          <p className="gd-text">{current.body}</p>
        </div>

        <div className="gd-foot">
          {/* Dots, not a progress bar: five steps is a shape you can see, and
              nothing here is loading. */}
          <span className="gd-dots" aria-hidden="true">
            {GUIDE_STEPS.map((s, i) => (
              <i key={s.id} className={i === step ? "is-at" : undefined} />
            ))}
          </span>

          <div className="gd-acts">
            {step > 0 ? (
              <button type="button" className="gd-back" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : (
              <button type="button" className="gd-back" onClick={onClose}>
                Skip
              </button>
            )}

            {last ? (
              <Link className="gd-next" href="/guide" onClick={onClose}>
                Read the rest &rarr;
              </Link>
            ) : (
              <button type="button" className="gd-next" onClick={() => setStep(step + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
