"use client";

import { useEffect, useState } from "react";
import "./MaintenanceNotice.css";

/**
 * A maintenance window, announced on every page.
 *
 * Put up 2026-10-30 for two hours. The end is a fixed moment rather than "two
 * hours from page load", so every visitor counts down to the same time. When
 * it passes the bar stays and says it is nearly done - it comes down with a
 * push, not on a timer, so an overrun never leaves people without a notice.
 *
 * To take it down: set `MAINTENANCE_UNTIL` to null.
 */
const MAINTENANCE_UNTIL: string | null = "2026-10-30T14:00:00Z";

export function MaintenanceNotice() {
  // Null until mounted: the server's clock and the visitor's differ, and a
  // countdown rendered on both would never hydrate cleanly.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  if (MAINTENANCE_UNTIL === null) return null;

  const left = now === null ? null : Date.parse(MAINTENANCE_UNTIL) - now;

  return (
    <div className="maintenance" role="status">
      <div className="maintenance-inner page">
        <span className="maintenance-dot" aria-hidden="true" />
        <span className="maintenance-text">
          <strong>Scheduled maintenance.</strong> Some features may be unavailable for about 2 hours.
        </span>
        <span className="maintenance-time">
          {left === null ? "Back in about 2 hours" : left > 0 ? `Back in ${clock(left)}` : "Finishing up, back shortly"}
        </span>
      </div>
    </div>
  );
}

function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
