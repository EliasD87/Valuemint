"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A link that starts loading its page the moment someone shows interest in it
 * (2026-10-25).
 *
 * The token and collection pages are prerendered and cached, so a prefetch is
 * one cached request and the click that follows lands instantly. Prefetching
 * every card in view would be sixty requests per market visit for pages
 * nobody opens; waiting for a hover, a touch or keyboard focus spends a
 * request only on the piece somebody is reaching for. Next's own pattern for
 * large lists (docs: "prefetch only on hover").
 *
 * On a phone `touchstart` arrives a beat before the tap's click, which is
 * enough for the prefetch to be in flight when navigation begins.
 */
export function WarmLink({
  onPointerEnter,
  onTouchStart,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [warm, setWarm] = useState(false);
  return (
    <Link
      {...props}
      prefetch={warm ? null : false}
      onPointerEnter={(e) => {
        setWarm(true);
        onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        setWarm(true);
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setWarm(true);
        onFocus?.(e);
      }}
    />
  );
}
