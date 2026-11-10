"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ZH } from "@/lib/i18n.zh";

/**
 * English and Simplified Chinese (2026-11-10).
 *
 * The English text in the code is the key: `t("Make offer")` returns
 * "出价" when the visitor reads Chinese and "Make offer" otherwise. So a string
 * nobody has translated yet simply shows in English — the site is never
 * broken while the translation is only partly done, and the code still reads
 * as the page it draws.
 *
 * The choice is the visitor's: a saved one if they made it, otherwise Chinese
 * when the browser's languages start with Chinese. It lives on their device
 * (localStorage), so URLs, server rendering and the edge cache are unchanged —
 * the server always renders English and the page switches as it hydrates.
 */

export type Locale = "en" | "zh";

const STORAGE_KEY = "valuemint:locale";
const listeners = new Set<() => void>();
let current: Locale | undefined;

function detect(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    /* Storage can be off: fall back to the browser's languages. */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some((l) => typeof l === "string" && l.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function snapshot(): Locale {
  if (current === undefined) current = detect();
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocale(next: Locale): void {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* Not saved; still switched for this visit. */
  }
  for (const listener of listeners) listener();
}

/** The visitor's language. English on the server and in the first render, then theirs. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, snapshot, () => "en");
}

/** `{name}` placeholders, filled from `vars`. */
function fill(text: string, vars?: Record<string, string | number>): string {
  if (vars === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Translate outside a component, for a locale already known. */
export function translate(locale: Locale, text: string, vars?: Record<string, string | number>): string {
  return fill(locale === "zh" ? (ZH[text] ?? text) : text, vars);
}

/** `t("Make offer")`, or `t("{count} listed", { count: 4 })`. */
export function useT(): (text: string, vars?: Record<string, string | number>) => string {
  const locale = useLocale();
  return useCallback((text: string, vars?: Record<string, string | number>) => translate(locale, text, vars), [locale]);
}

/** Keeps `<html lang>` right for screen readers and fonts. Mounted once. */
export function LocaleSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
  return null;
}

/** The header's 中文 / EN switch. */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const next: Locale = locale === "zh" ? "en" : "zh";
  return (
    <button
      type="button"
      className={className}
      onClick={() => setLocale(next)}
      aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
      title={locale === "zh" ? "English" : "中文"}
    >
      {locale === "zh" ? "EN" : "中文"}
    </button>
  );
}
