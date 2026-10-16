"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Share the Trenches perk ticket as a picture (owner, 2026-10-16): download
 * it, copy it, or hand it to the phone's share sheet.
 *
 * The picture is the ticket itself, rendered by html-to-image from the live
 * DOM, so it always shows exactly what the page shows — the wallet's tickets,
 * the clock. `.is-shooting` on the wrapper adds a margin of page colour and a
 * footer with the address for the length of the capture only.
 *
 * html-to-image is loaded on the first click, not with the page.
 */

type Status = { kind: "busy" | "done" | "error"; text: string } | undefined;

export function TicketShare({ target, fileName }: { target: React.RefObject<HTMLElement | null>; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(undefined);
  const [can, setCan] = useState({ copy: false, share: false });
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let share = false;
    try {
      share =
        typeof navigator.share === "function" &&
        navigator.canShare?.({ files: [new File([""], "t.png", { type: "image/png" })] }) === true;
    } catch {
      share = false;
    }
    setCan({ copy: typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function", share });
  }, []);

  /* Close on a click elsewhere or Escape. */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const render = async (): Promise<Blob> => {
    const node = target.current;
    if (node === null) throw new Error("No ticket to capture.");
    const { toBlob } = await import("html-to-image");
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#ffffff";
    node.classList.add("is-shooting");
    try {
      // Twice: the first pass warms html-to-image's font and image cache, and
      // without it Safari sometimes returns the ticket with its art missing.
      // includeQueryParams: the depth art is all /_next/image?url=…, and html-to-image's cache
      // otherwise keys on the path alone, so every piece came out as the first one's picture.
      const options = { backgroundColor: paper, includeQueryParams: true };
      await toBlob(node, { ...options, pixelRatio: 1 });
      const blob = await toBlob(node, { ...options, pixelRatio: 2 });
      if (blob === null) throw new Error("The browser could not draw the ticket.");
      return blob;
    } finally {
      node.classList.remove("is-shooting");
    }
  };

  const run = async (what: string, job: () => Promise<void>, ok: string) => {
    setStatus({ kind: "busy", text: what });
    try {
      await job();
      setStatus({ kind: "done", text: ok });
      setOpen(false);
    } catch (e) {
      // A cancelled share sheet is not an error.
      if (e instanceof DOMException && e.name === "AbortError") return setStatus(undefined);
      setStatus({ kind: "error", text: e instanceof Error && e.message !== "" ? e.message : "That did not work." });
    }
  };

  const download = () =>
    run(
      "Drawing your ticket…",
      async () => {
        const url = URL.createObjectURL(await render());
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      },
      "Saved",
    );

  const copy = () =>
    run(
      "Copying…",
      // The promise goes into ClipboardItem straight away: Safari only allows
      // the write inside the click, and the drawing takes longer than that.
      () => navigator.clipboard.write([new ClipboardItem({ "image/png": render() })]),
      "Copied: paste it anywhere",
    );

  const share = () =>
    run(
      "Drawing your ticket…",
      async () => {
        const file = new File([await render()], fileName, { type: "image/png" });
        await navigator.share({ files: [file], text: "My tickets for the Cybereator draw 🎟️ valuemint.store/trenches" });
      },
      "Shared",
    );

  return (
    <div className="tix-share" ref={menu}>
      <button
        type="button"
        className="tix-share-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setStatus(undefined);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </svg>
        Share ticket
      </button>

      {open ? (
        <div className="tix-share-menu" role="menu">
          {can.share ? (
            <button type="button" role="menuitem" onClick={share} disabled={status?.kind === "busy"}>
              Share…
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={download} disabled={status?.kind === "busy"}>
            Download image
          </button>
          {can.copy ? (
            <button type="button" role="menuitem" onClick={copy} disabled={status?.kind === "busy"}>
              Copy image
            </button>
          ) : null}
        </div>
      ) : null}

      {status !== undefined ? (
        <span className={`tix-share-status is-${status.kind}`} role="status">
          {status.text}
        </span>
      ) : null}
    </div>
  );
}
