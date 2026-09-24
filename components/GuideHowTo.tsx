import type { GuideAction } from "@/config/guide";
import "@/styles/guide.css";

/**
 * A guide step's numbered instructions.
 *
 * Shared by `/guide` and the "Where is my SOSO?" dialog, so the steps a
 * stranger is walked through are word for word the same wherever they meet
 * them. Numbered because the step happens on another site: a reader switching
 * tabs needs to find their place again when they come back.
 *
 * No hooks, so the server-rendered guide page can use it as it is.
 */
export function GuideHowTo({ actions }: { actions: GuideAction[] }) {
  return (
    <ol className="guide-howto">
      {actions.map((a) => (
        <li key={a.text}>
          {a.text}
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
