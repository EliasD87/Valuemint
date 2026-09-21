import { KolRibbon } from "@/components/KolRibbon";
import "@/styles/kols.css";

/**
 * The KOL portraits.
 *
 * Given, never minted or sold — so there has never been anything to do on this
 * page, and it is now stripped back to saying so. A belt of the portraits
 * turning past on a dark field, and the words "Coming soon" under it. No
 * heading, no lede, no roster with names, no price, nothing to connect a wallet
 * for.
 *
 * What was here before was a showcase written as though the set had shipped: a
 * hero with three cutouts standing in the letters K, O and L, a title, a
 * paragraph about who the portraits are of, and a twelve-card grid with names
 * under each. All of it described something a visitor still cannot have. The
 * pictures do that better on their own.
 *
 * A server component. Everything that moves is inside `KolRibbon`.
 */
export default function Kols() {
  return (
    <div className="kolp">
      {/*
        The one piece of text that is not on screen, and the only reason it is
        in the markup: a document with no heading has no outline, and a screen
        reader landing here would be told nothing about where it is. The belt
        below announces itself once as a picture.
      */}
      <h1 className="kolp-name">KOLs</h1>

      {/*
        Held under the header while the page scrolls past it, so a scroll runs
        the belt sideways instead of taking it off screen after half a flick.
        The runway is one extra screen, on `.kolp`; the footer is right below
        it.
      */}
      <div className="kolp-stage">
        <KolRibbon />

        <p className="kolp-soon">
          <span className="kolp-dot" aria-hidden="true" />
          Coming soon
        </p>
      </div>
    </div>
  );
}
