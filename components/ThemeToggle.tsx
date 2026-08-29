"use client";

import { useEffect, useState } from "react";

/**
 * Light / dark switch.
 *
 * Three states matter, not two. A viewer who has never chosen follows their
 * system, and that is the default we want to preserve - so "no stored choice"
 * stamps nothing on <html> and lets the prefers-color-scheme block in
 * tokens.css decide. Only an explicit choice writes `data-theme`, which is what
 * makes it override the OS in both directions.
 *
 * The initial paint is handled by the inline script in layout.tsx, not here.
 * This component only reports what was already resolved and changes it on
 * click, so it must render the same markup on the server and on first client
 * paint - hence `mounted`, and hence the button being label-less until then.
 */

const KEY = "valuemint-theme";

type Choice = "light" | "dark";

function stored(): Choice | undefined {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : undefined;
  } catch {
    // Private browsing, or storage disabled. Falling back to the system
    // preference is the correct behaviour, not an error worth surfacing.
    return undefined;
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Choice>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(stored() ?? (systemPrefersDark() ? "dark" : "light"));
    setMounted(true);
  }, []);

  // While the viewer is still following their system, track it live: changing
  // the OS theme should move the page with it, without a reload.
  useEffect(() => {
    if (stored() !== undefined) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Choice = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;

    // Cross-fade the palette instead of snapping it. The flag is temporary and
    // opt-in per switch, because leaving a colour transition on every element
    // permanently makes ordinary hovers feel laggy.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      root.dataset.themeTransition = "";
      window.setTimeout(() => delete root.dataset.themeTransition, 260);
    }

    setTheme(next);
    root.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The page still changes; it just will not be remembered.
    }
  };

  const isDark = mounted && theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light" : "Dark"}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb" data-dark={isDark ? "" : undefined}>
          {isDark ? <Moon /> : <Sun />}
        </span>
      </span>
    </button>
  );
}

function Sun() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.1M12 19.5v2.1M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2.4 12h2.1M19.5 12h2.1M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8Z" />
    </svg>
  );
}
