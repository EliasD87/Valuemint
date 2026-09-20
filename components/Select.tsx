"use client";

import { useEffect, useId, useRef, useState } from "react";
import "./Select.css";

/**
 * A dropdown that looks like the rest of the site.
 *
 * A native `<select>` is styled only down to its closed box: the list it opens
 * is drawn by the operating system, in the system font, with the system's blue
 * highlight, and no stylesheet reaches it. On a dark page that is a white panel
 * with a Windows-blue row in it, which is exactly what was reported — three
 * screenshots of the same fault on three different pages.
 *
 * So the list is ours. The cost of that is everything a native select gives
 * away for free, and it is all here rather than skipped:
 *
 *   - keyboard: Enter, Space, Arrow keys and Alt+Down open it; arrows move;
 *     Home and End jump; Enter and Space choose; Escape and Tab close without
 *     choosing, which is what a native one does;
 *   - type-ahead: typing jumps to the next option starting with those letters,
 *     with a short buffer so "su" reaches "Super rare" rather than stopping at
 *     the first S;
 *   - screen readers: a real `listbox` with `aria-activedescendant`, so the
 *     focused option is announced while focus itself stays on the button;
 *   - a click anywhere else closes it, and so does scrolling the page under it.
 *
 * What it deliberately does NOT do is portal itself to the body. Everything it
 * opens inside is a short row of filters, the menu is positioned against its
 * own trigger, and a portal would bring the containing-block problem this
 * project has already paid for once — `backdrop-filter` and `transform` both
 * make `position: fixed` resolve against an ancestor instead of the viewport.
 * If a caller ever puts one inside `overflow: hidden`, that is the moment to
 * revisit this, not before.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Shown dimmed after the label — a count, a hint. Never part of matching. */
  note?: string;
}

export function Select({
  value,
  onChange,
  options,
  label,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Describes the control when there is no visible `<label>` beside it. */
  label?: string;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const listId = `${id ?? auto}-list`;

  const [open, setOpen] = useState(false);
  /** Which option the keyboard is on. Not the same as the chosen one. */
  const [active, setActive] = useState(0);

  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const chosen = options.findIndex((o) => o.value === value);
  const current = options[chosen === -1 ? 0 : chosen];

  /** Opening lands on the chosen option, not the top of the list. */
  const openMenu = () => {
    setActive(chosen === -1 ? 0 : chosen);
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const pick = (i: number) => {
    const option = options[i];
    if (option === undefined) return;
    onChange(option.value);
    close();
  };

  /**
   * Outside clicks and page scrolls close it.
   *
   * `pointerdown` rather than `click`, so the menu is gone before whatever was
   * clicked underneath reacts. Scroll is captured, because the thing that moved
   * may be a container rather than the window — the menu is positioned against
   * its trigger and would otherwise be left behind.
   */
  useEffect(() => {
    if (!open) return;

    const away = (e: PointerEvent) => {
      if (root.current !== null && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const moved = () => setOpen(false);

    document.addEventListener("pointerdown", away);
    window.addEventListener("scroll", moved, { passive: true, capture: true });
    window.addEventListener("resize", moved, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("scroll", moved, { capture: true });
      window.removeEventListener("resize", moved);
    };
  }, [open]);

  /** Keep the keyboard's option in view in a list long enough to scroll. */
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  /** Jump to the next option whose label starts with what was typed. */
  const typeAhead = (key: string) => {
    const now = Date.now();
    const text = (now - typed.current.at < 600 ? typed.current.text : "") + key.toLowerCase();
    typed.current = { text, at: now };

    const from = open ? active : chosen === -1 ? 0 : chosen;
    for (let n = 1; n <= options.length; n++) {
      const i = (from + n) % options.length;
      if (options[i]!.label.toLowerCase().startsWith(text)) {
        if (open) setActive(i);
        else onChange(options[i]!.value);
        return;
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
        return;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        typeAhead(e.key);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        /** Closes WITHOUT choosing, and lets focus move on, as a native one does. */
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          typeAhead(e.key);
        }
    }
  };

  return (
    <div ref={root} className={`sel${className === undefined ? "" : ` ${className}`}`}>
      <button
        ref={button}
        type="button"
        id={id}
        className="sel-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="sel-value">{current?.label ?? ""}</span>
        {/* Marked hidden: the button already says what is chosen, and a second
            reading of the same thing is noise. */}
        <svg className="sel-caret" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          ref={list}
          id={listId}
          className="sel-menu"
          role="listbox"
          aria-label={label}
          tabIndex={-1}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              className={`sel-option${i === active ? " is-active" : ""}${
                o.value === value ? " is-chosen" : ""
              }`}
              /* `pointerdown`, not `click`: the button keeps focus and the
                 outside-click handler above never sees this as "away". */
              onPointerDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onPointerEnter={() => setActive(i)}
            >
              <span className="sel-option-label">{o.label}</span>
              {o.note === undefined ? null : <span className="sel-option-note">{o.note}</span>}
              <svg className="sel-tick" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                <path
                  d="M2.5 6.4 4.9 8.8 9.5 3.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
