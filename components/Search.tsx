"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/**
 * Search by address.
 *
 * Deliberately narrow. There is no indexer on this chain, so a general text
 * search over token names would mean loading every collection's metadata on
 * every keystroke - and the one lookup people actually need is by address:
 * whose wallet is this, or what is this contract.
 *
 * It routes on shape rather than asking. Both a wallet and a collection are
 * forty hex characters, and the two destinations are different, so the input
 * accepts either and `useCollectionProbe`-style disambiguation happens on the
 * page it lands on. A wallet is the common case, so that is the default; the
 * collection option is offered explicitly rather than guessed at.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function Search() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open, so the dialog is usable without a second click.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes, as it must for anything modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const trimmed = value.trim();
  const isAddress = ADDRESS.test(trimmed);

  const go = (kind: "wallet" | "collection") => {
    if (!isAddress) return;
    setOpen(false);
    setValue("");
    router.push(kind === "wallet" ? `/address/${trimmed}` : `/collection/${trimmed}`);
  };

  return (
    <>
      <button
        type="button"
        className="search-trigger"
        aria-label="Search by address"
        onClick={() => setOpen(true)}
      >
        {/* Inline rather than an icon font: one glyph, no extra request. */}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      {open ? <Dialog
        value={value}
        setValue={setValue}
        isAddress={isAddress}
        onGo={go}
        onClose={() => setOpen(false)}
        inputRef={inputRef}
      /> : null}
    </>
  );
}

function Dialog({
  value,
  setValue,
  isAddress,
  onGo,
  onClose,
  inputRef,
}: {
  value: string;
  setValue: (v: string) => void;
  isAddress: boolean;
  onGo: (kind: "wallet" | "collection") => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
        aria-label="Search by address"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="search-input"
          placeholder="0x… wallet or collection address"
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isAddress) onGo("wallet");
          }}
        />

        {value.trim() === "" ? (
          <p className="search-hint">
            Paste an address to see everything it holds on ValueChain, or to open a
            collection this site has not indexed yet.
          </p>
        ) : !isAddress ? (
          <p className="search-hint search-hint-bad">
            That is not an address. A ValueChain address is 0x followed by 40 hex
            characters.
          </p>
        ) : (
          <div className="search-actions">
            <button type="button" className="btn btn-primary" onClick={() => onGo("wallet")}>
              See what this wallet holds
            </button>
            <button type="button" className="btn" onClick={() => onGo("collection")}>
              Open as a collection
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
