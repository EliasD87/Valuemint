"use client";

import { useEffect, useRef, useState } from "react";
import "./ShareLink.css";

/**
 * Copy or share this page's link.
 *
 * Now that token and collection routes carry real Open Graph metadata, a shared
 * link renders as the artwork with a name — so it is worth making the link easy
 * to get out of the page rather than leaving people to the address bar, which
 * on a phone is fiddly and on a wallet's in-app browser is sometimes hidden
 * entirely.
 *
 * The native sheet on a phone, where it is the one with X, Telegram and Discord
 * already in it. The clipboard everywhere else, by two routes, because one of
 * them is refused more often than its reputation suggests.
 */
export function ShareLink({ title }: { title?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A pending "Copied" reset would otherwise fire into an unmounted component
  // after a route change.
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (next: "copied" | "failed") => {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };

  /**
   * Put the URL on the clipboard, by whichever route still works.
   *
   * `navigator.clipboard` is the right API and it is refused more often than
   * its reputation suggests: a lost transient activation, a declined
   * permission, a browser that only grants it to a focused document. The old
   * `execCommand` path needs none of that — it is synchronous and works off
   * the selection — so it stays as the second attempt rather than the page
   * giving up and saying "Copy failed".
   */
  const copy = async (url: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      /* Fall through and try the older way. */
    }

    /** `.select()` steals focus, and removing the field would drop it on <body>. */
    const focused = document.activeElement;

    try {
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      /** Off-screen but focusable: `display: none` cannot be selected. */
      field.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.appendChild(field);
      field.select();
      field.setSelectionRange(0, url.length);
      const ok = document.execCommand("copy");
      field.remove();
      if (focused instanceof HTMLElement) focused.focus();
      return ok;
    } catch {
      return false;
    }
  };

  const onClick = async () => {
    const url = window.location.href;

    /**
     * The native sheet only where it is actually better, which is a phone.
     *
     * This used to try `navigator.share` first everywhere. Desktop Chrome
     * defines it, so the click went to the OS share sheet — and when that
     * failed for any reason other than being dismissed, the fallback to the
     * clipboard had already lost the click's transient activation and was
     * refused. The button then said "Copy failed" on a machine whose clipboard
     * was working perfectly well.
     *
     * A coarse pointer is the honest test for "the native sheet is the better
     * answer here": on a phone it offers X, Telegram and Discord; on a desktop
     * it is a worse way to do what one keystroke does.
     */
    const touch =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (touch && typeof navigator.share === "function" && navigator.canShare?.({ url }) !== false) {
      try {
        await navigator.share({ title: title ?? document.title, url });
        return;
      } catch (err) {
        // Dismissing the sheet throws AbortError. That is a choice, not a
        // failure, and must not be reported as one.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    flash((await copy(url)) ? "copied" : "failed");
  };

  return (
    <button type="button" className="share-link" onClick={() => void onClick()}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {state === "copied" ? (
          <path d="M5 12.5 10 17.5 19 7" />
        ) : (
          <>
            <path d="M8.5 13.5 15.5 9.5M8.5 10.5 15.5 14.5" />
            <circle cx="6" cy="12" r="2.6" />
            <circle cx="18" cy="7.5" r="2.6" />
            <circle cx="18" cy="16.5" r="2.6" />
          </>
        )}
      </svg>
      <span>{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Share"}</span>
    </button>
  );
}
