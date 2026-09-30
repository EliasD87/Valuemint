"use client";

import type { AnimationEvent, MouseEvent } from "react";
import Image from "next/image";
import { KOLS, kolLocal, xHandle, type Kol } from "@/config/kols";
import { KOL_POSTS, type KolPost } from "@/config/kolPosts";
import "./KolWall.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "28 Sep", built by hand: `toLocaleDateString` can differ between the server
 * render and the browser, and a date that changes on hydration is a mismatch.
 */
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return m === undefined || d === undefined ? iso : `${d} ${MONTHS[m - 1] ?? ""}`;
};

/**
 * About how many lines a post takes in a card: ~44 characters to a line, each
 * written line at least one, and a Japanese or Chinese character counting
 * nearly double — it is set about twice as wide. Measured against the real
 * cards at desktop width (card ≈ 124px + 25px a line); only used to balance
 * the two columns, so close is enough.
 */
const textLines = (text: string) =>
  text.split("\n").reduce((n, line) => {
    const width = [...line].reduce((w, ch) => w + (/[　-鿿＀-￯]/.test(ch) ? 1.9 : 1), 0);
    return n + Math.max(1, Math.ceil(width / 44));
  }, 0);

/**
 * Their text with @handles, #tags and $tickers picked out, as X shows them. A
 * hashtag starts with a letter, as on X, so "KOL #1" stays plain.
 * Emphasis only: the words themselves are rendered exactly as stored.
 */
const Words = ({ text }: { text: string }) => (
  <>
    {text.split(/([@$][A-Za-z0-9_]+|#[A-Za-z_][A-Za-z0-9_]*)/).map((part, i) =>
      i % 2 === 1 ? (
        <b className="kw-tag-word" key={i}>
          {part}
        </b>
      ) : (
        part
      ),
    )}
  </>
);

const XMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.8L18.9 2Zm-1.1 18.1h1.7L8.3 3.8H6.5l11.3 16.3Z" />
  </svg>
);

/**
 * The KOLs' own posts after claiming, laid out as a tree growing out of the
 * collection: a root card, two branches, and the posts hanging off them.
 *
 * Every piece is visible without animation. Where the browser supports
 * scroll-driven animation (and the viewer has not asked for less motion) the
 * branches draw and the cards rise as the section scrolls in — an extra, never
 * a condition for the content to appear.
 */
export function KolWall({ claimed, total, live }: { claimed: number; total: number; live: boolean }) {
  const entries = KOL_POSTS
    .map((p, i) => ({ post: p, kol: KOLS.find((k) => k.n === p.kol), i }))
    .filter((e): e is { post: KolPost; kol: Kol; i: number } => e.kol !== undefined);
  if (entries.length === 0) return null;

  /*
   * Each post goes to whichever column is shorter so far, by an estimate of
   * its card's height, so the two sides end close together — alternating left
   * and right let a run of long posts leave one side 500px taller. The right
   * column starts ~46px lower, past its label. `order` keeps the list's order
   * for the single-column phone layout.
   */
  const left: typeof entries = [];
  const right: typeof entries = [];
  const height = { left: 0, right: 46 };
  for (const e of entries) {
    // Card plus the 52px gap that follows it, so a side with more cards pays for them.
    const est = 124 + 52 + textLines(e.post.text) * 25 + (e.post.translated === undefined ? 0 : 22);
    const side = height.left <= height.right ? "left" : "right";
    (side === "left" ? left : right).push(e);
    height[side] += est;
  }

  return (
    // No visible heading — the tree speaks for itself — but the section still
    // needs a name for anyone navigating by landmarks.
    <section className="kw" aria-label="What the KOLs said">
      <div className="kw-tree">
        <div className="kw-root">
          <span className="kw-root-thumbs" aria-hidden="true">
            {KOLS.slice(0, 3).map((k) => (
              <Image key={k.n} src={kolLocal(k)} alt="" width={40} height={40} loading="eager" />
            ))}
          </span>
          <b>ValueMint KOLs</b>
          <span className="kw-root-meta">
            {live ? (
              <>
                Claimed <span className="mono">{claimed} / {total}</span>
              </>
            ) : (
              <>
                <span className="mono">{total}</span> portraits
              </>
            )}
          </span>
        </div>

        {/* The two branches out of the root, landing on the centres of the two
            columns (25% and 75%). Stretched to the tree's width, so the strokes
            keep their weight with vector-effect. */}
        <div className="kw-fork" aria-hidden="true">
          <svg viewBox="0 0 1000 120" preserveAspectRatio="none" focusable="false">
            <path className="kw-branch" d="M500 0 V44 Q500 60 516 60 H734 Q750 60 750 76 V120" />
            <path className="kw-branch is-dashed" d="M492 14 C 420 100, 290 16, 250 120" />
          </svg>
          <span className="kw-chip">Posted on X</span>
        </div>

        <div className="kw-cols">
          {[left, right].map((col, c) => (
            <div className={`kw-col ${c === 0 ? "is-left" : "is-right"}`} key={c}>
              {col.map(({ post, kol, i }) => (
                <Post key={i} post={post} kol={kol} order={i} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Hovering knocks the card; the swing then plays to the end on its own.
 *
 * Not `:hover` in CSS: an animation tied to a selector is cut off the moment
 * the selector stops matching, so sweeping the pointer across the wall left
 * each card snapping straight back. A class that only `animationend` removes
 * lets every swing finish — and a hover mid-swing does not restart it.
 */
const SWING_OK = "(hover: hover) and (prefers-reduced-motion: no-preference)";

function swing(e: MouseEvent<HTMLElement>) {
  const body = e.currentTarget.querySelector(".kw-card-body");
  if (body !== null && window.matchMedia(SWING_OK).matches) body.classList.add("is-swinging");
}

function settle(e: AnimationEvent<HTMLElement>) {
  if (e.animationName === "kw-swing") e.currentTarget.classList.remove("is-swinging");
}

/**
 * One post, hanging off its line.
 *
 * Two boxes on purpose: the outer one stays put and carries the line and the
 * node it hangs from (and the scroll-in rise), the inner one is the card that
 * swings from that node on hover. On one box the swing would replace the
 * scroll animation — an element has one `animation` list — and the line would
 * swing along with the card instead of holding it.
 */
function Post({ post, kol, order }: { post: KolPost; kol: Kol; order: number }) {
  const handle = kol.x === undefined ? undefined : xHandle(kol.x);

  return (
    <article className="kw-card" style={{ order }} onMouseEnter={swing}>
      <div className="kw-card-body" onAnimationEnd={settle}>
        <header className="kw-card-head">
          {/* Eager: next/image's lazy observer has been seen never to fire for
              images this small (see the hero thumbs on /kols). */}
          <Image className="kw-avatar" src={kolLocal(kol)} alt="" width={88} height={88} loading="eager" />
          <span className="kw-who">
            <b>{kol.name}</b>
            {handle === undefined ? null : <span>{handle}</span>}
          </span>
          <span className="kw-x" title="Posted on X">
            <XMark />
          </span>
        </header>

        <p className="kw-text" lang={post.translated === undefined ? undefined : "en"}>
          <Words text={post.text} />
        </p>
        {post.translated === undefined ? null : (
          <p className="kw-translated">Translated from {post.translated} by X</p>
        )}

        <footer className="kw-card-foot">
          <span className="kw-tag mono">1/1 #{kol.n}</span>
          <time dateTime={post.date}>{shortDate(post.date)}</time>
        </footer>
      </div>
    </article>
  );
}
