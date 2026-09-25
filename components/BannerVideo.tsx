"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Crossfade at the loop point, in seconds. Must match the transition on
 * `.bv-clip` in CollectionHero.css.
 */
const FADE = 0.8;

/**
 * A banner video that loops without a visible jump, and never shows a play
 * button.
 *
 * **The loop.** A clip's last frame is not its first, so `loop` cuts from one
 * to the other. Two copies of the same (cached) file take turns instead: in
 * the last FADE seconds the idle one starts from 0 and fades in on top, so the
 * end dissolves into the start.
 *
 * **The play button.** A browser that will not autoplay — iOS Low Power Mode,
 * data saver, most in-app browsers (X, Telegram) — leaves a paused video and
 * draws its own play button over it. So nothing is shown until `play()`
 * actually resolves, and when it is refused the band swaps to `fallback`: the
 * same loop as an animated image, which every browser animates. The still sits
 * underneath throughout, so the band is never empty while any of this loads.
 *
 * Reduced motion gets the still and nothing else.
 */
export function BannerVideo({
  src,
  still,
  fallback,
  position,
}: {
  src: string;
  still: string;
  fallback?: string;
  position?: string;
}) {
  const [mode, setMode] = useState<"video" | "fallback" | "still">("video");
  const first = useRef<HTMLVideoElement>(null);
  const second = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (mode !== "video") return;
    const a = first.current;
    const b = second.current;
    if (a === null || b === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMode("still");
      return;
    }

    let front = a;
    let back = b;
    let fading = false;
    let live = true;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /* Set as properties too: React leaves `muted` out of server HTML, and an
       unmuted video is exactly what browsers refuse to autoplay. */
    a.muted = true;
    b.muted = true;

    /**
     * Only `NotAllowedError` means autoplay was refused. Anything else is an
     * interruption, not a verdict — Chrome pauses silent video in a background
     * tab with `AbortError` ("paused to save power"), and treating that as a
     * refusal sent a tab opened with ctrl-click to the 2 MB fallback for good.
     * Those are retried when the tab is shown.
     */
    const begin = () => {
      front.play().then(
        () => {
          if (live && front.dataset.state === undefined) front.dataset.state = "front";
        },
        (e: unknown) => {
          if (live && e instanceof DOMException && e.name === "NotAllowedError") {
            setMode(fallback !== undefined ? "fallback" : "still");
          }
        },
      );
    };
    begin();

    const onVisible = () => {
      if (document.visibilityState === "visible" && front.paused && !fading) begin();
    };
    document.addEventListener("visibilitychange", onVisible);

    const tick = () => {
      const d = front.duration;
      if (!fading && Number.isFinite(d) && d > FADE * 2 && front.currentTime >= d - FADE) {
        fading = true;
        back.currentTime = 0;
        void back.play().catch(() => {});
        // The outgoing clip stays fully opaque underneath while the incoming
        // one fades in over it — fading both would dip through the page.
        front.dataset.state = "under";
        back.dataset.state = "front";
        timer = setTimeout(() => {
          front.pause();
          delete front.dataset.state;
          [front, back] = [back, front];
          fading = false;
        }, FADE * 1000 + 60);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
      a.pause();
      b.pause();
    };
  }, [mode, fallback]);

  const style = position === undefined ? undefined : { objectPosition: position };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- local, pre-sized, fills a fixed box */}
      <img className="ch-bg" src={still} alt="" aria-hidden="true" decoding="async" style={style} />
      {mode === "video" ? (
        <>
          {[first, second].map((ref, i) => (
            <video
              key={i}
              ref={ref}
              className="ch-bg bv-clip"
              src={src}
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              aria-hidden="true"
              tabIndex={-1}
              style={style}
            />
          ))}
        </>
      ) : mode === "fallback" && fallback !== undefined ? (
        // eslint-disable-next-line @next/next/no-img-element -- animated image; next/image would re-encode it
        <img className="ch-bg" src={fallback} alt="" aria-hidden="true" decoding="async" style={style} />
      ) : null}
    </>
  );
}
