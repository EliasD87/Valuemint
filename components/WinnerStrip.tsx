"use client";

import { useEffect, useRef, useState } from "react";
import { AddressLink } from "@/components/AddressLink";
import type { DrawWinner } from "@/lib/draw";
import "./WinnerStrip.css";

/**
 * The draw's winners as a row of cards that scrolls sideways (owner,
 * 2026-10-18, after a "ranking list" reference): a big place number, the
 * wallet, the winning ticket, the prize itself, and whether it has been sent.
 *
 * Every Cybereator has the same artwork (all tokens point at one image), so
 * each card shows that one picture: `/boxes/cybereator.webp`, the animated
 * file the rest of the site already uses for the collection.
 */

const fmt = (n: number) => n.toLocaleString("en-US");

export function WinnerStrip({
  winners,
  sent,
  explorer,
  you,
  shown,
  drawBlock,
}: {
  winners: readonly DrawWinner[];
  /** Lower-case winner wallet -> the transaction that sent its prize. */
  sent: Readonly<Record<string, `0x${string}`>>;
  explorer: string;
  /** The connected wallet, lower-case. */
  you?: string;
  /** The wallet whose ticket is up top, lower-case. */
  shown?: string;
  drawBlock: bigint;
}) {
  const track = useRef<HTMLOListElement>(null);
  /* How far along the row is scrolled, and how much of it is in view: the bar under it. */
  const [bar, setBar] = useState({ at: 0, size: 1 });
  const [ends, setEnds] = useState({ start: true, end: false });

  useEffect(() => {
    const el = track.current;
    if (el === null) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setBar({ at: max <= 0 ? 0 : el.scrollLeft / max, size: el.scrollWidth === 0 ? 1 : el.clientWidth / el.scrollWidth });
      setEnds({ start: el.scrollLeft <= 2, end: el.scrollLeft >= max - 2 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [winners.length]);

  /* One card's width plus the gap, so a click moves exactly a card. */
  const step = (dir: 1 | -1) => {
    const el = track.current;
    const card = el?.querySelector("li");
    if (el === null || el === undefined || card === null || card === undefined) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior: "smooth" });
  };

  return (
    <div className="wstrip">
      <div className="wstrip-head">
        <div>
          <h3 className="wstrip-title">
            {winners.length} {winners.length === 1 ? "winner" : "winners"}
          </h3>
          <p className="wstrip-sub">Picked on ValueChain from block {fmt(Number(drawBlock))}. One Cybereator each.</p>
        </div>
        <div className="wstrip-nav">
          <button type="button" aria-label="Previous winners" onClick={() => step(-1)} disabled={ends.start}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          <button type="button" aria-label="Next winners" onClick={() => step(1)} disabled={ends.end}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>

      <ol className="wstrip-track" ref={track} tabIndex={0} aria-label="Winners">
        {winners.map((w) => {
          const k = w.wallet.toLowerCase();
          const tx = sent[k];
          const me = you !== undefined && k === you;
          return (
            <li key={w.wallet} className={`wcard${me ? " is-you" : ""}${shown === k ? " is-shown" : ""}`}>
              <span className="wcard-place">{String(w.place).padStart(2, "0")}</span>
              <span className="wcard-dash" aria-hidden="true" />
              <span className="wcard-who">
                <AddressLink address={w.wallet} chars={4} />
                {me ? <span className="wcard-you">You</span> : null}
              </span>
              <span className="wcard-ticket">
                Ticket <b>#{fmt(w.ticket)}</b> · held {fmt(w.tickets)}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="wcard-art" src="/boxes/cybereator.webp" alt="Cybereator" loading="lazy" />
              {tx !== undefined ? (
                <a className="wcard-sent" href={`${explorer}/tx/${tx}`} target="_blank" rel="noreferrer">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                  Sent
                </a>
              ) : (
                <span className="wcard-pending">Sending soon</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="wstrip-bar" aria-hidden="true">
        <span style={{ width: `${bar.size * 100}%`, left: `${bar.at * (1 - bar.size) * 100}%` }} />
      </div>
    </div>
  );
}
