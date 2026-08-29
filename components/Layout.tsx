"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Wallet } from "./Wallet";
import { ThemeToggle } from "./ThemeToggle";
import { deployment } from "@/config/contracts";
import "./Layout.css";

const NAV = [
  { to: "/", label: "Explore", end: true },
  { to: "/mint", label: "Mint" },
  { to: "/collections", label: "Collections" },
  { to: "/market", label: "Market" },
  { to: "/trenches", label: "Trenches" },
  { to: "/create", label: "Create" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/manage", label: "Manage" },
];

export function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const isActive = (item: (typeof NAV)[number]) =>
    item.end === true ? pathname === item.to : pathname.startsWith(item.to);

  // Navigating is the commonest way to leave the menu, and the panel does not
  // unmount on a route change, so it has to close itself.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) === true || menuButton.current?.contains(t) === true) return;
      setMenuOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);

    // The panel scrolls with the page behind it otherwise, which on a phone
    // reads as the menu sliding away on its own.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

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
            <span className="brand-name">ValueMint</span>
          </Link>

          <nav className="nav" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.to}
                href={item.to}
                className={`nav-link${isActive(item) ? " is-active" : ""}`}
                aria-current={isActive(item) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            <ThemeToggle />
            <Link className="btn btn-primary btn-sm header-cta" href="/create">
              Create
            </Link>
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
              </span>
            </button>
          </div>
        </div>

        {/* Always rendered so the panel can animate, and so its links stay in
            the accessibility tree in a predictable place. `inert` keeps them
            out of the tab order while it is shut. */}
        <div
          id="mobile-nav"
          className="mobile-nav"
          ref={panel}
          inert={!menuOpen}
          aria-hidden={!menuOpen}
        >
          <nav className="mobile-nav-inner page" aria-label="Primary, compact">
            {NAV.map((item) => (
              <Link
                key={item.to}
                href={item.to}
                className={`mobile-nav-link${isActive(item) ? " is-active" : ""}`}
                aria-current={isActive(item) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div
        className="menu-scrim"
        data-open={menuOpen ? "" : undefined}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />

      <main id="main">
        {children}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-lead">
            <span className="brand-mark" aria-hidden="true">
              <Mark />
            </span>
            <p className="footer-statement">The marketplace for everything minted on ValueChain.</p>
            <p className="footer-note">
              Non-custodial by construction. A token never leaves its owner&rsquo;s wallet until
              payment clears, and both move in the same transaction or neither does.
            </p>
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
              <li>
                <Link href="/create">Create a collection</Link>
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
                  href={`${deployment.explorer}/address/${deployment.marketplace}`}
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
