"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The phone's primary navigation.
 *
 * On a handset the nav lives behind a hamburger, which puts every destination
 * two taps away and out of reach of a thumb. A marketplace is a browsing
 * product — moving between Explore, Market and Portfolio is the main thing
 * anyone does — so those get a fixed bar at the bottom of the screen, where the
 * thumb already is.
 *
 * Four, not eight. The menu still holds everything; this is only the set worth
 * a permanent slot, and a fifth would make each target too narrow to hit
 * reliably. Create is deliberately not here: it is a long form, not somewhere
 * you dip into, and a bar pinned over it would compete with its own controls.
 */

interface Tab {
  to: string;
  label: string;
  /** Match the path exactly. Only "/" needs it; everything else prefix-matches. */
  end?: boolean;
  icon: () => React.JSX.Element;
}

const TABS: Tab[] = [
  { to: "/", label: "Explore", end: true, icon: Compass },
  { to: "/market", label: "Market", icon: Tag },
  { to: "/collections", label: "Collections", icon: Grid },
  { to: "/portfolio", label: "Wallet", icon: Wallet },
];

export function MobileTabs() {
  const pathname = usePathname();

  const isActive = (tab: Tab) =>
    tab.end === true ? pathname === tab.to : pathname.startsWith(tab.to);

  return (
    <nav className="tabbar" aria-label="Primary, compact">
      {TABS.map((tab) => {
        const active = isActive(tab);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.to}
            href={tab.to}
            className={`tabbar-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* Inline so the bar paints with the first frame — four icon requests for
   something permanently on screen is four too many. */

function Compass() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  );
}

function Tag() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 3h7.5L21 13.5 13.5 21 3 10.5z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  );
}

function Grid() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </svg>
  );
}

function Wallet() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="6" width="18" height="13" rx="2.6" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.2" />
    </svg>
  );
}
