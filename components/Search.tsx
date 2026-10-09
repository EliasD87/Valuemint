"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAllCollections } from "@/hooks/useAllCollections";
import { searchResults, type SearchResult } from "@/lib/search";

/**
 * Search: collections by name, a piece by collection and number, or an address.
 *
 * It was addresses only, on the grounds that a text search would mean loading
 * every collection's metadata on every keystroke. Names were never that
 * expensive: the collection registry is one cached read, and it is only loaded
 * when the dialog opens (2026-10-09), so no page pays for search until somebody
 * searches. Token metadata is still never searched; "treasure 79565" opens
 * piece #79565 of the collection that matches "treasure".
 *
 * An address that is a known collection opens the collection. Any other
 * address still offers both readings, wallet first, as before: the two are the
 * same forty hex characters and only the page they land on can tell them apart.
 */

export function Search() {
  const [open, setOpen] = useState(false);

  /**
   * "/" or Ctrl/Cmd+K opens it from anywhere, unless someone is typing.
   * Always listening, and that is all it does until it fires: the dialog and
   * the registry it reads mount only when it opens.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      const shortcut = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey);
      if (shortcut || (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="search-trigger"
        aria-label="Search collections, pieces and addresses"
        title="Search (press /)"
        onClick={() => setOpen(true)}
      >
        {/* Inline rather than an icon font: one glyph, no extra request. */}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      {open ? <Dialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { collections, isLoading } = useAllCollections();
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted) inputRef.current?.focus();
  }, [mounted]);

  // Escape closes, as it must for anything modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const found = useMemo(() => searchResults(collections, value), [collections, value]);
  const results = Array.isArray(found) ? found : [];
  const current = Math.min(active, Math.max(0, results.length - 1));

  const go = (r: SearchResult | undefined) => {
    if (r === undefined) return;
    onClose();
    router.push(r.href);
  };

  if (!mounted) return null;

  /**
   * Portalled to the body, and this is not optional: `.header` sets
   * `backdrop-filter`, which makes it a containing block for `position: fixed`
   * exactly as `transform` does. Rendered in place, this dialog centres itself
   * inside the 72px header bar instead of the viewport. That bug has been paid
   * for once already, in the wallet picker.
   */
  return createPortal(
    <div className="search-scrim" onClick={onClose} role="presentation">
      <div
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Collection, piece (Genesis 45) or 0x address"
          value={value}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="search-results"
          aria-activedescendant={results[current] === undefined ? undefined : `search-${results[current]!.key}`}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              go(results[current]);
            }
          }}
        />

        {!Array.isArray(found) ? (
          <p className="search-hint">{found.hint}</p>
        ) : results.length === 0 ? (
          <p className="search-hint">{isLoading ? "Loading collections…" : "No collections yet."}</p>
        ) : (
          <>
            {value.trim() === "" ? <p className="search-label">Collections</p> : null}
            <ul className="search-results" id="search-results" role="listbox">
              {results.map((r, i) => (
                <li
                  key={r.key}
                  id={`search-${r.key}`}
                  role="option"
                  aria-selected={i === current}
                  className={i === current ? "search-result is-active" : "search-result"}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => go(r)}
                >
                  {r.art === undefined ? (
                    <span className="search-art search-art-empty" aria-hidden="true" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="search-art" src={r.art} alt="" loading="lazy" decoding="async" />
                  )}
                  <span className="search-text">
                    <b>{r.title}</b>
                    <small>{r.sub}</small>
                  </span>
                  <span className="search-enter" aria-hidden="true">
                    ↵
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
