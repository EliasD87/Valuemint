"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVerifiedContracts } from "@/hooks/useVerifiedContracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Wallet } from "./Wallet";
import { ThemeToggle } from "./ThemeToggle";
import { FocusLine } from "./FocusLine";
import { Search } from "./Search";
import { SodexLogo } from "./SodexLogo";
import { GuidePill } from "./GuidePill";
import { deployment } from "@/config/contracts";
import { SEAPORT } from "@/config/seaport";
import "./Layout.css";

/**
 * The navigation. One flat list, in one order, used by both the desktop header
 * and the phone drawer.
 *
 * The drawer briefly grouped these under headings. It was dropped: the captions
 * were a second thing to read before reaching the thing you came for, and with
 * nine short labels the list is quicker to scan without them.
 *
 * `mark` puts the SoDEX symbol beside a label. Only Trenches carries one: that
 * page is entirely about their leaderboard, and a symbol anywhere else would
 * read as SoDEX branding the marketplace itself.
 */
interface NavItem {
  to: string;
  label: string;
  /** Match the path exactly. Only "/" needs it; everything else prefix-matches. */
  end?: boolean;
  /** Show the SoDEX symbol beside the label. */
  mark?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Explore", end: true },
  /**
   * Second, ahead of Mint and Collections.
   *
   * This is a marketplace, and the market is the thing most people arrive
   * wanting. It sat fourth, behind two pages about making and listing
   * collections, which is the order the site was built in rather than the
   * order anybody reads it in.
   */
  { to: "/market", label: "Market" },
  { to: "/mint", label: "Mint" },
  { to: "/collections", label: "Collections" },
  { to: "/trenches", label: "Trenches", mark: true },
  { to: "/kols", label: "KOLs" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/manage", label: "Manage" },
];

export function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const isActive = (item: NavItem) =>
    item.end === true ? pathname === item.to : pathname.startsWith(item.to);

  // Navigating is the commonest way to leave the drawer, and it does not
  // unmount on a route change, so it has to close itself.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const close = () => {
      setMenuOpen(false);
      menuButton.current?.focus();
    };

    /**
     * The drawer covers the page, so focus has to be held inside it. Without
     * this, tabbing walks straight out into the page underneath — which is
     * still there, still focusable, and now invisible behind the scrim.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || panel.current === null) return;

      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      const here = document.activeElement;

      if (e.shiftKey && (here === first || here === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && here === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) === true || menuButton.current?.contains(t) === true) return;
      setMenuOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);

    // The page scrolls behind the drawer otherwise, which reads as the menu
    // sliding away on its own.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Move focus in, so a keyboard or screen reader lands where the drawer is
    // rather than continuing from the button behind it.
    panel.current?.querySelector<HTMLElement>("a[href], button")?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.body.style.overflow = overflow;
    };
  }, [menuOpen]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="header" data-menu-open={menuOpen ? "" : undefined}>
        <div className="header-inner page">
          <Link href="/" className="brand" aria-label="ValueMint, home">
            <span className="brand-mark" aria-hidden="true">
              <Mark />
            </span>
            <BrandName />
          </Link>

          <nav className="nav" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.to}
                href={item.to}
                className={`nav-link${isActive(item) ? " is-active" : ""}`}
                aria-current={isActive(item) ? "page" : undefined}
              >
                {item.mark === true ? <SodexLogo variant="mark" className="nav-mark" /> : null}
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            {/* Below 940 this hides and the drawer carries the switch instead,
                so the phone header is only brand, wallet and the menu. */}
            <Search />
            <ThemeToggle />
            <Wallet />
            <button
              ref={menuButton}
              type="button"
              className="menu-button"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="menu-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/**
       * The drawer, and the whole of the phone navigation.
       *
       * A sibling of the header rather than a child: it is full height and
       * fixed, and nesting it inside a sticky, bordered bar meant fighting that
       * bar's own box for every pixel of it.
       *
       * Always rendered, so it can animate and so its links keep a stable place
       * in the accessibility tree. `inert` is what takes them out of the tab
       * order while it is shut — which also makes the focus trap above safe,
       * since there is nothing to trap until it opens.
       */}
      <div
        id="mobile-nav"
        className="drawer"
        ref={panel}
        inert={!menuOpen}
        aria-hidden={!menuOpen}
        data-open={menuOpen ? "" : undefined}
      >
        <div className="drawer-head">
          <Link href="/" className="brand" aria-label="ValueMint, home">
            <span className="brand-mark" aria-hidden="true">
              <Mark />
            </span>
            <BrandName />
          </Link>
          <button
            type="button"
            className="drawer-close"
            aria-label="Close menu"
            onClick={() => {
              setMenuOpen(false);
              menuButton.current?.focus();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="drawer-nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.to}
              href={item.to}
              className={`drawer-link${isActive(item) ? " is-active" : ""}`}
              aria-current={isActive(item) ? "page" : undefined}
            >
              {/* After the label, not before it. Leading, the one marked row
                  started 62px in while the other eight sat flush, and a single
                  icon in nine rows does not justify reserving the slot on all
                  of them. Trailing, every label aligns and the mark reads as a
                  tag on Trenches. */}
              <span>{item.label}</span>
              {item.mark === true ? <SodexLogo variant="mark" className="nav-mark" /> : null}
            </Link>
          ))}
        </nav>

        <div className="drawer-foot">
          <ThemeToggle />
          <span className="drawer-chain">ValueChain · 286623</span>
        </div>
      </div>

      <div
        className="menu-scrim"
        data-open={menuOpen ? "" : undefined}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />

      <ContractIdentityBanner />

      <main id="main">{children}</main>

      {/* Fixed to a corner and deferred, so it costs the page nothing and
          covers none of it. Mounted here rather than per-page because "new
          here?" is true wherever somebody lands. */}
      <GuidePill />

      <footer
        className="footer"
        /*
          Two property writes and nothing else — no rAF loop, no state, no
          render. `--fm-x`/`--fm-y` are registered in `Layout.css`, so the
          browser interpolates them and the ease there does the gliding.
          Putting the pointer in React state would re-render the whole footer
          on every frame of a mouse movement.
        */
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) return;
          const style = event.currentTarget.style;
          style.setProperty("--fm-x", `${((event.clientX - box.left) / box.width) * 100}%`);
          style.setProperty("--fm-y", `${((event.clientY - box.top) / box.height) * 100}%`);
        }}
      >
        {/* Atmospheric, so it is out of the accessibility tree and takes no
            pointer events; the footer above is what listens. */}
        <div className="footer-mesh" aria-hidden="true" />

        <div className="footer-inner">
          <div className="footer-lead">
            {/* The mark and the name together, the way the header carries them.
                The disc alone said nothing to anybody who had not already
                learned it. */}
            <div className="footer-brand">
              <span className="brand-mark" aria-hidden="true">
                <Mark />
              </span>
              <span className="footer-name">ValueMint</span>
            </div>
            <FocusLine
              className="footer-statement"
              text="The marketplace for everything minted on ValueChain."
            />
          </div>

          <div className="footer-col">
            <h3>Marketplace</h3>
            <ul>
              <li>
                <Link href="/">Explore</Link>
              </li>
              <li>
                <Link href="/collections">Collections</Link>
              </li>
              <li>
                <Link href="/market">Listings</Link>
              </li>
              {/* Last in the column on purpose: the three above are places to
                  go and buy something, and this is a way of looking at what
                  they have been doing. */}
              <li>
                <Link href="/stats">Stats</Link>
              </li>
              {/* The way back in. The pill that offers this is dismissed for
                  good on the first click, so without a standing link the guide
                  would be unreachable to anyone who closed it. */}
              <li>
                <Link href="/guide">Getting started</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h3>On chain</h3>
            <ul>
              <li>
                <span className="mono">ValueChain · 286623</span>
              </li>
              <li>
                <a
                  className="mono"
                  href={`${deployment.explorer}/address/${SEAPORT}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Marketplace contract
                </a>
              </li>
              <li>
                <a
                  className="mono"
                  href={`${deployment.explorer}/address/${deployment.factory}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Collection factory
                </a>
              </li>
              <li>
                <a
                  className="mono"
                  href="https://main-scan.valuechain.xyz"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Block explorer
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-base">
          <span>Built on SoSoValue&rsquo;s Layer 1.</span>
          <span className="mono">Gas settles in SOSO</span>
        </div>
      </footer>
    </>
  );
}

/**
 * The wordmark, one span per letter.
 *
 * Split so the strike can travel through it — each letter is given its index
 * as `--i` and leans on that for its delay, which is the whole of the ripple.
 * There is no JavaScript in the animation; the only thing this does is hand CSS
 * an ordinal.
 *
 * `aria-hidden` because the link already carries `aria-label="ValueMint, home"`,
 * so the accessible name is right either way — and without it some screen
 * readers announce a per-letter split one letter at a time. Selecting and
 * copying the text still works: the characters are really there.
 */
function BrandName() {
  return (
    <span className="brand-name" aria-hidden="true">
      {"ValueMint".split("").map((ch, i) => (
        <span key={i} className="brand-letter" style={{ ["--i" as string]: i }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

/**
 * The ValueMint mark: a struck disc bearing a V.
 *
 * A coin from a mint, which is what the name says. It replaced a generic
 * hexagon that had nothing to do with either the name or the letter.
 *
 * One path, drawn with `evenodd`, so the V is a hole rather than a second
 * colour - the disc takes `currentColor` and whatever sits behind shows
 * through the letter. That is what lets the same mark work on the page in
 * either theme and on the permanently dark footer, with no per-context fills.
 */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M16 0a16 16 0 1 1 0 32 16 16 0 0 1 0-32ZM9 9.5 14.1 22h3.8L23 9.5h-3.5L16 18.1 12.5 9.5H9Z"
      />
    </svg>
  );
}

/**
 * Says so, loudly, when the chain disagrees with this build about the two
 * addresses everything is approved to.
 *
 * Deliberately silent while loading and silent on an unreachable node: an
 * unanswered question is not a failed one, and a banner that cries wolf during
 * every RPC hiccup gets ignored on the day it matters. It appears only when the
 * chain has actually answered and the answer was wrong.
 */
function ContractIdentityBanner() {
  const { mismatch, problems } = useVerifiedContracts();
  if (!mismatch) return null;

  return (
    <div className="identity-alarm" role="alert">
      <strong>Stop. This site is not talking to the contracts it should be.</strong>
      <ul>
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p>
        Do not approve anything and do not send a transaction. Approving would grant
        blanket rights over your collection to whatever contract this is.
      </p>
    </div>
  );
}
