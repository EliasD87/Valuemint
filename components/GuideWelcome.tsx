"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferred } from "@/hooks/useDeferred";
import { GUIDE_STEPS } from "@/config/guide";
import { GuideArt } from "@/components/GuideArt";
import "@/styles/guide.css";

/**
 * The guide, opened for a first visit.
 *
 * It used to wait as a pill in the bottom-left corner — "New to ValueMint?" —
 * on the reasoning that covering a marketplace to explain it is backwards.
 * In practice newcomers never pressed it, and then could not work out how to
 * get SOSO onto ValueChain or why offers need WSOSO: the pill was the one
 * thing on the page they skipped. So a first visit now opens the guide
 * itself, once, and it is gone the moment it is closed.
 *
 * Once means once. Any way out — Skip, Done, the cross, Escape, the scrim, a
 * link out of it — is remembered, and the pill's old dismissal counts too:
 * somebody who closed that has already said they are not new. Arriving on
 * `/guide` counts as well; that reader has found it.
 */

/** Seen for good. There is a footer link; nobody needs showing twice. */
const STORE_KEY = "valuemint:guide-dismissed";

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) === "1";
  } catch {
    /* Private windows and blocked storage both land here. The in-memory flag
       below still stops it reopening within the visit. */
    return false;
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(STORE_KEY, "1");
  } catch {
    /* Then it opens again next visit, which is survivable. */
  }
}

export function GuideWelcome() {
  /**
   * After the page, not with it: the first thing a stranger sees should be
   * the marketplace, with the guide arriving over it a beat later, rather
   * than a dialog over a half-painted page.
   */
  const ready = useDeferred(1200);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /* This visit, independent of storage — the layout outlives navigation, and
     blocked storage must not turn every page change into a reopening. */
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    if (pathname?.startsWith("/guide")) {
      shown.current = true;
      remember();
      return;
    }
    if (!ready) return;
    shown.current = true;
    if (!alreadySeen()) setOpen(true);
  }, [ready, pathname]);

  const close = () => {
    setOpen(false);
    remember();
  };

  return open ? <GuidePanel onClose={close} /> : null;
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
          {/* It opens unasked now, so the first page says what it is. */}
          <p className="gd-count">
            {step === 0 ? "Welcome to ValueMint · " : ""}
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
          {/* A step that happens on another site has numbered instructions the
              panel has no room for; this is the way to them. */}
          {current.howTo === undefined ? null : (
            <Link className="gd-howto-link" href={`/guide#${current.id}`} onClick={onClose}>
              Show me step by step
            </Link>
          )}
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
              /*
                The last step needs a way to simply be finished with.
                
                It used to offer Back and "Read the rest" and nothing else, so
                somebody who had read all four steps and wanted none of the
                long version had to go hunting for the close cross. Finishing
                is the likelier intent by then, so it takes the primary slot
                and the page is demoted to the link beside it — it is an offer,
                not the only way out.
              */
              <>
                <Link className="gd-aside" href="/guide" onClick={onClose}>
                  Full guide &rarr;
                </Link>
                <button type="button" className="gd-next" onClick={onClose}>
                  Done
                </button>
              </>
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
