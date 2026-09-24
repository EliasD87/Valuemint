import type { GuideAction } from "@/config/guide";
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
 * No hooks, so the server-rendered guide page can use it as it is.
 */
export function GuideHowTo({ actions }: { actions: GuideAction[] }) {
  return (
    <ol className="guide-howto">
      {actions.map((a) => (
        <li key={a.title}>
          <strong className="guide-howto-title">{a.title}.</strong> {a.text}
          {a.link === undefined ? null : (
            <>
              {" "}
              <a href={a.link.href} target="_blank" rel="noreferrer noopener">
                {a.link.label}&nbsp;&#8599;
              </a>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
