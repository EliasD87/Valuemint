"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { Soso } from "@/components/Soso";
import { TxResult } from "@/components/TxResult";
import { kolLocal, xHandle } from "@/config/kols";
import type { useKolRewards } from "@/hooks/useKolRewards";
import { formatSoso } from "@/lib/format";
import { renderKolShareImage } from "@/lib/kolShareImage";
import "./KolEnvelope.css";

/**
 * The claim, as a letter addressed to one person.
 *
 * An envelope lit from inside, with their portrait standing up out of it and
 * the button underneath saying exactly what the claim delivers. After the
 * claim lands the portrait lifts clear of the envelope and the envelope drops
 * away — the piece is out, and it is theirs.
 *
 * Everything that matters is in the resting state. The card rising, the glow
 * breathing and the sparks are transitions and animations layered on top; if
 * none of them run, the portrait, the copy and the button are all still there.
 */

/** Rising sparks: position across the mouth, delay, drift. Decorative. */
const SPARKS = [
  [18, 0.0, -6],
  [27, 1.6, 4],
  [34, 0.7, -3],
  [41, 2.4, 5],
  [48, 1.1, -4],
  [55, 0.3, 3],
  [62, 2.0, -5],
  [69, 0.9, 6],
  [76, 1.8, -2],
  [83, 0.5, 4],
] as const;

export function KolEnvelope({
  rewards,
  onClose,
}: {
  rewards: ReturnType<typeof useKolRewards>;
  onClose: () => void;
}) {
  const { mine, tx, deadline, portraits } = rewards;
  const [mounted, setMounted] = useState(false);
  /** The share picture: idle, drawing, on the clipboard, or saved as a file instead. */
  const [picture, setPicture] = useState<"idle" | "busy" | "copied" | "saved" | "failed">("idle");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  const done = mine?.claimed === true || tx.success;
  const phase = done ? "done" : tx.signing ? "signing" : tx.confirming ? "confirming" : "ready";

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

  // Focus moves into the dialog, onto the dialog itself rather than the claim
  // button — a ring around the one big button reads as a second border, and a
  // stray Enter should not send a transaction.
  useEffect(() => {
    if (mounted) dialog.current?.focus({ preventScroll: true });
  }, [mounted]);

  if (!mounted || mine === undefined) return null;

  /*
   * Copy the envelope as a picture. The blob is handed to the clipboard as a
   * promise, inside the click, because Safari refuses a clipboard write that
   * starts after an await. Where images cannot go on the clipboard at all
   * (older Firefox, some phones), the same picture is downloaded instead.
   */
  const copyPicture = async () => {
    const root = dialog.current;
    if (root === null) return;
    setPicture("busy");
    const heading = root.querySelector("h2");
    const blob = renderKolShareImage({
      themeFrom: root,
      portrait: kolLocal(mine.kol),
      number: mine.kol.n,
      name: mine.kol.name,
      handle: mine.kol.x === undefined ? undefined : xHandle(mine.kol.x),
      displayFont: heading === null ? "sans-serif" : getComputedStyle(heading).fontFamily,
      sansFont: getComputedStyle(root).fontFamily,
    });
    try {
      if (typeof ClipboardItem === "undefined" || navigator.clipboard?.write === undefined) throw new Error("no image clipboard");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setPicture("copied");
    } catch {
      try {
        const url = URL.createObjectURL(await blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `valuemint-kol-${mine.kol.n}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setPicture("saved");
      } catch {
        setPicture("failed");
      }
    }
  };

  const { kol } = mine;
  const share = mine.amount > 0n ? formatSoso(mine.amount) : undefined;
  const handle = kol.x === undefined ? undefined : xHandle(kol.x);
  const shareText =
    "Just claimed my one-of-one portrait on ValueMint, made for the people who show up on SoDEX. Sponsored by ValueChain.";
  const intent =
    `https://x.com/intent/post?text=${encodeURIComponent(shareText)}` +
    `&url=${encodeURIComponent("https://www.valuemint.store/kols")}`;

  return createPortal(
    <>
      <div className="kce-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialog}
        tabIndex={-1}
        className={`kce is-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kce-title"
      >
        <button type="button" className="kce-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="kce-scene" aria-hidden="true">
          <div className="kce-glow" />
          <div className="kce-rays" />
          <div className="kce-sparks">
            {SPARKS.map(([x, delay, drift], i) => (
              <span
                key={i}
                style={{
                  ["--x" as string]: `${x}%`,
                  ["--d" as string]: `${delay}s`,
                  ["--drift" as string]: `${drift}px`,
                }}
              />
            ))}
          </div>

          <div className="kce-env">
            <div className="kce-flap" />
            <div className="kce-back" />

            <div className="kce-card">
              <div className="kce-card-head">
                <span>ValueMint KOLs</span>
                <span className="kce-card-no">#{String(kol.n).padStart(2, "0")}</span>
              </div>
              <div className="kce-card-art">
                <Image src={kolLocal(kol)} alt="" width={640} height={640} loading="eager" sizes="280px" />
              </div>
              <div className="kce-card-foot">
                <b>{kol.name}</b>
                <span>1 of 1</span>
              </div>
            </div>

            <div className="kce-front">
              <div className="kce-fold" />
              {/* Addressed like a letter: ValueChain is the sender. */}
              <div className="kce-address">
                <p className="kce-from">
                  <span>From</span>
                  <b>ValueChain</b>
                </p>
                <p className="kce-to">
                  <span>To</span>
                  <b>{kol.name}</b>
                  {handle === undefined ? null : <i>{handle}</i>}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="kce-copy">
          {done ? (
            <>
              <p className="kce-eyebrow">A gift from ValueChain · #{kol.n}</p>
              <h2 id="kce-title">It&rsquo;s yours, {kol.name}.</h2>
              <p className="kce-lede">
                Your portrait{share === undefined ? " is" : <> and <Soso size={14}>{share}</Soso> are</>} in
                this wallet, courtesy of ValueChain. Thank you for showing up.
              </p>
            </>
          ) : (
            <>
              <p className="kce-eyebrow">A gift from ValueChain · #{kol.n}</p>
              <h2 id="kce-title">GM, {kol.name}.</h2>
              <p className="kce-lede">
                Your one of one is here, drawn for you and nobody else
                {share === undefined ? "." : ", with SOSO alongside it."}
              </p>
            </>
          )}
        </div>

        <div className="kce-actions">
          {done ? (
            <>
              {portraits === undefined ? null : (
                <Link className="btn btn-primary btn-block" href={`/token/${portraits}/${kol.n}`} onClick={onClose}>
                  View your portrait
                </Link>
              )}
              <div className="kce-row">
                <button
                  type="button"
                  className="btn"
                  disabled={picture === "busy"}
                  onClick={() => void copyPicture()}
                >
                  <svg className="kce-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2.5" />
                    <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
                  </svg>
                  {picture === "busy"
                    ? "Drawing…"
                    : picture === "copied"
                      ? "Image copied"
                      : picture === "saved"
                        ? "Image saved"
                        : "Copy image"}
                </button>
                <a className="btn" href={intent} target="_blank" rel="noreferrer noopener">
                  Share on X
                </a>
              </div>
              <p className="kce-small" aria-live="polite">
                {picture === "copied"
                  ? "Now open Share on X and paste it into your post."
                  : picture === "saved"
                    ? "Saved to your downloads. Attach it to your post on X."
                    : picture === "failed"
                      ? "Could not make the image here. Try another browser."
                      : "Copy your envelope as an image to go with your post."}
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn btn-primary btn-lg btn-block kce-claim${tx.busy ? " is-busy" : ""}`}
                disabled={tx.busy}
                aria-busy={tx.busy}
                onClick={() => void rewards.claim(kol.n)}
              >
                {tx.signing ? (
                  "Confirm in your wallet…"
                ) : tx.confirming ? (
                  "Opening your envelope…"
                ) : share === undefined ? (
                  "Claim your portrait"
                ) : (
                  <>
                    Claim
                    <span className="kce-claim-sep" aria-hidden="true" />
                    <Soso size={18}>{share}</Soso>
                  </>
                )}
              </button>

              <TxResult
                hash={tx.hash}
                confirming={tx.confirming}
                success={false}
                error={tx.error}
                successLabel="Claimed"
              />
              {deadline === undefined ? null : <p className="kce-small">Open until {until(deadline)}</p>}
            </>
          )}

          {/* The sponsor, as a sign-off under everything else, in both states. */}
          <p className="kce-sponsor">
            <span>Sponsored by</span>
            <b>ValueChain</b>
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
}

const until = (unix: number) =>
  new Date(unix * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
