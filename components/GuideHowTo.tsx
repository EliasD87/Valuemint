"use client";

import type { ReactNode } from "react";
import type { GuideAction } from "@/config/guide";
import { useT } from "@/lib/i18n";
import "@/styles/guide.css";

/**
 * A guide step's numbered instructions, as a list.
 *
 * `/guide` reads these as a list beside the step's drawing; the "Where is my
 * SOSO?" dialog lays the same entries out as cards. Both come from one
 * `GUIDE_STEPS` entry, so the words are the same wherever someone meets them.
 * Numbered because the step happens on another site: a reader switching tabs
 * needs to find their place again when they come back.
 *
 * A client component since the Chinese translation (2026-11-10): the visitor's
 * language lives on their device, so only the browser knows which words to
 * show. The server-rendered guide page still uses it as it is.
 */
export function GuideHowTo({ actions }: { actions: GuideAction[] }) {
  const t = useT();
  return (
    <ol className="guide-howto">
      {actions.map((a) => (
        <li key={a.title}>
          <strong className="guide-howto-title">{t("{title}.", { title: t(a.title) })}</strong> {t(a.text)}
          {a.link === undefined ? null : (
            <>
              {" "}
              <a href={a.link.href} target="_blank" rel="noreferrer noopener">
                {t(a.link.label)}&nbsp;&#8599;
              </a>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * One translated string, for the server-rendered guide page.
 *
 * `/guide` stays a server component (it exports its metadata), and a server
 * component cannot know the visitor's language. These two leaves are the only
 * parts of it that have to run in the browser.
 */
export function GuideText({ text, vars }: { text: string; vars?: Record<string, string | number> }) {
  const t = useT();
  return <>{t(text, vars)}</>;
}

/** A `<nav>` whose accessible name is translated. Its links stay server-rendered. */
export function GuideNav({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <nav className={className} aria-label={t(label)}>
      {children}
    </nav>
  );
}
