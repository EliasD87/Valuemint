"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVerifiedContracts } from "@/hooks/useVerifiedContracts";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Wallet } from "./Wallet";
import { ThemeToggle } from "./ThemeToggle";
import { FocusLine } from "./FocusLine";
import { Search } from "./Search";
import { SodexLogo } from "./SodexLogo";
import { GuideWelcome } from "./GuideWelcome";
import { NavProgress } from "./NavProgress";
import { MaintenanceNotice } from "./MaintenanceNotice";
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
  /** One line under the label, in a group's menu only. */
  note?: string;
  /** In a group's menu: a picture beside the label (local files only). */
  thumb?: "trenches" | "kols";
  /** In a group's menu: a small tag after the label, e.g. "Free". */
  tag?: string;
}

/**
 * Pages that share one slot in the bar and open from it.
 *
 * Added 2026-10-21 to keep the bar short. Trenches and KOLs are the two pages
 * about people rather than the market, so they fold under Community;
 * everything you trade with stays one click away.
 */
interface NavGroup {
  label: string;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => "items" in entry;

const NAV: NavEntry[] = [
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
  {
    label: "Community",
    items: [
      { to: "/trenches", label: "Trenches", mark: true, note: "Free NFTs for SoDEX traders", thumb: "trenches", tag: "Free" },
      { to: "/kols", label: "SoDEX KOLs", note: "Portraits of the SoDEX KOLs", thumb: "kols" },
    ],
  },
  { to: "/portfolio", label: "Portfolio" },
  /* /manage is not here, deliberately (2026-10-24): the page still works for
     anybody who types the address, and creating a collection still links to
     it, but it is not one of the places the site sends a visitor. */
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
      <NavProgress />
      <a className="skip" href="#main">
        Skip to content
      </a>

      <MaintenanceNotice />

      <header className="header" data-menu-open={menuOpen ? "" : undefined}>
        <div className="header-inner page">
          <Link href="/" className="brand" aria-label="ValueMint, home">
            <span className="brand-mark" aria-hidden="true">
              <Mark />
            </span>
            <BrandName />
          </Link>

          <nav className="nav" aria-label="Primary">
            {NAV.map((entry) =>
              isGroup(entry) ? (
                <NavMenu key={entry.label} group={entry} isActive={isActive} />
              ) : (
                <Link
                  key={entry.to}
                  href={entry.to}
                  className={`nav-link${isActive(entry) ? " is-active" : ""}`}
                  aria-current={isActive(entry) ? "page" : undefined}
                >
                  {entry.mark === true ? <SodexLogo variant="mark" className="nav-mark" /> : null}
                  {entry.label}
                </Link>
              ),
            )}
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
          {/* Flat on a phone (owner, 2026-10-24): a group's pages are rows like the rest, not folded. */}
          {NAV.flatMap((entry) => (isGroup(entry) ? entry.items : [entry])).map((item) => (
            <DrawerLink key={item.to} item={item} active={isActive(item)} />
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

      {/* Opens the guide once, on a first visit, a moment after the page has
          painted. Mounted here rather than per-page because a newcomer can
          land anywhere. */}
      <GuideWelcome />

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

          {/*
            Three links in one row, no headings (2026-10-24). The columns
            repeated the header's own navigation — Explore, Collections,
            Listings — and listed chain plumbing (the chain id, the factory,
            the explorer's front page) that a visitor never comes to the
            footer for. A nav landmark rather than a heading names the row.
          */}
          <nav className="footer-col footer-links" aria-label="More">
            <ul>
              <li>
                <Link href="/stats">Stats</Link>
              </li>
              {/* The way back in. The pill that offers this is dismissed for
                  good on the first click, so without a standing link the guide
                  would be unreachable to anyone who closed it. */}
              <li>
                <Link href="/guide">Getting started</Link>
              </li>
              <li>
                <a
                  href={`${deployment.explorer}/address/${SEAPORT}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Marketplace contract
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="footer-base">
          <span>Built on SoSoValue&rsquo;s Layer 1.</span>
          <a
            className="footer-social"
            href="https://x.com/valuemintNFT"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="ValueMint on X, @valuemintNFT"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z"
              />
            </svg>
            @valuemintNFT
          </a>
          <span className="mono">Gas settles in SOSO</span>
        </div>
      </footer>
    </>
  );
}

/**
 * A group in the desktop bar: a button that opens its pages under it.
 *
 * A disclosure — a button with `aria-expanded` over a list of plain links —
 * not an ARIA menu. These are page links, and a menu role would take the arrow
 * keys and promise a keyboard model that links do not have.
 *
 * A mouse opens it by hovering and it closes a beat after the pointer leaves,
 * so crossing the gap to the panel does not shut it. A click still toggles,
 * which is the whole interface for keyboard and touch — except that a click
 * while hovering only ever opens, or the hover would open it and the click
 * that followed would close it again.
 */
function NavMenu({ group, isActive }: { group: NavGroup; isActive: (item: NavItem) => boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const hovering = useRef(false);
  const closing = useRef<number | undefined>(undefined);
  const id = useId();

  const current = group.items.some(isActive);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const outside = (t: EventTarget | null) => root.current !== null && !root.current.contains(t as Node);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => outside(e.target) && setOpen(false);
    // Tabbing past the last link leaves the group, and the panel should go with it.
    const onFocus = (e: FocusEvent) => outside(e.target) && setOpen(false);

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closing.current), []);

  return (
    <div
      className="nav-group"
      ref={root}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        hovering.current = true;
        window.clearTimeout(closing.current);
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        hovering.current = false;
        closing.current = window.setTimeout(() => setOpen(false), 180);
      }}
    >
      <button
        ref={button}
        type="button"
        className={`nav-link nav-group-button${current ? " is-active" : ""}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => (hovering.current ? true : !v))}
      >
        {group.label}
        <Chevron />
      </button>

      {open ? (
        <div className="nav-menu" id={id}>
          {group.items.map((item) => (
            <Link
              key={item.to}
              href={item.to}
              className={`nav-menu-link${item.thumb !== undefined ? " has-thumb" : ""}${isActive(item) ? " is-active" : ""}`}
              aria-current={isActive(item) ? "page" : undefined}
            >
              {item.thumb !== undefined ? <MenuThumb kind={item.thumb} /> : null}
              <span className="nav-menu-text">
                <span className="nav-menu-label">
                  {item.mark === true ? <SodexLogo variant="mark" className="nav-mark" /> : null}
                  {item.label}
                  {item.tag === undefined ? null : <span className="nav-menu-tag">{item.tag}</span>}
                </span>
                {item.note === undefined ? null : <span className="nav-menu-note">{item.note}</span>}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DrawerLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.to}
      className={`drawer-link${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {/* After the label, not before it. Leading, the one marked row started
          62px in while the others sat flush, and a single icon does not justify
          reserving the slot on every row. Trailing, every label aligns and the
          mark reads as a tag on Trenches. */}
      <span>{item.label}</span>
      {item.mark === true ? <SodexLogo variant="mark" className="nav-mark" /> : null}
    </Link>
  );
}

/**
 * The picture beside a menu row. Local files, so opening the menu costs no
 * request to a gateway: Halo's card art for Trenches, and three
 * KOL portraits fanned for the KOLs.
 */
function MenuThumb({ kind }: { kind: "trenches" | "kols" }) {
  if (kind === "trenches") {
    return (
      <span className="nav-thumb" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/heroes/trenches-thumb.webp" alt="" />
      </span>
    );
  }
  return (
    <span className="nav-thumb nav-thumb-stack" aria-hidden="true">
      {/* Three with colour and a face in the middle: the rest are mostly white ground at this size. */}
      {["07", "09", "20"].map((n) => (
        <span key={n} className="nav-av">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/kols/roster/${n}.webp`} alt="" />
        </span>
      ))}
    </span>
  );
}

function Chevron() {
  return (
    <svg className="nav-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
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
 * either theme, with no per-context fills.
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
