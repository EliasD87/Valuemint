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
 * `navigator.share` where it exists, which on a phone is the native sheet with
 * X, Telegram and Discord already in it. Clipboard everywhere else.
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

  const onClick = async () => {
    const url = window.location.href;

    /**
     * `canShare` as well as `share`: some desktop browsers define `share` and
     * then reject every call, which would show a failure for something that was
     * never going to work. Falling through to the clipboard is better.
     */
    if (typeof navigator.share === "function" && navigator.canShare?.({ url }) !== false) {
      try {
        await navigator.share({ title: title ?? document.title, url });
        return;
      } catch (err) {
        // Dismissing the sheet throws AbortError. That is a choice, not a
        // failure, and must not be reported as one.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      flash("copied");
    } catch {
      // Clipboard access can be refused outright — an insecure origin, or a
      // permission the user declined.
      flash("failed");
    }
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
