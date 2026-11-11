"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { avatarFor, coverFor } from "@/config/covers";
import { heroFor } from "@/config/heroes";
import { wordmarkFor } from "@/config/wordmarks";
import { discordFor, websiteFor, xAccountFor } from "@/config/socials";
import { Wordmark } from "@/components/Wordmark";
import { BannerVideo } from "@/components/BannerVideo";
import { ShareLink } from "@/components/ShareLink";
import { VerifiedMark } from "@/components/VerifiedMark";
import { TradingMark } from "@/components/TradingMark";
import { deployment } from "@/config/contracts";
import { formatCount, shortAddress } from "@/lib/format";
import { useT } from "@/lib/i18n";
import "./CollectionHero.css";

/**
 * The top of a collection page: what this is, and whose.
 *
 * ---
 *
 * **Two kinds of band, and a collection always gets one.**
 *
 * Where somebody has composed artwork for a collection it is named in
 * `config/heroes.ts` and drawn sharp — a background filling the band, and
 * optionally a cutout character standing on its floor. That is the good case
 * and it is worth the file.
 *
 * Everything else falls back to its `config/covers.ts` thumbnails, blurred into
 * a colour field. That was the only mode this header had, and it is why the
 * header needed improving: blurred to a haze and then washed with a scrim, a
 * collection's band was a brown smear that said nothing about the collection.
 * It is still the fallback because it is free — those files are already
 * committed, already local, already downloaded for the card the visitor
 * clicked — but it is no longer the ceiling.
 *
 * Neither costs a chain read or a gateway fetch. The band draws on the first
 * frame, which is the opposite of how this page used to start.
 */
export function CollectionHero({
  address,
  name,
  symbol,
  supply,
  action,
}: {
  address: `0x${string}`;
  name?: string;
  symbol?: string;
  supply?: bigint;
  /** The page's primary action, first beside Share: "Make an offer". */
  action?: ReactNode;
}) {
  const t = useT();
  const hero = heroFor(address);
  const covers = coverFor(address);
  const mark = wordmarkFor(address);
  const x = xAccountFor(address);
  const site = websiteFor(address);
  const discord = discordFor(address);

  /**
   * The avatar is the collection's own thumbnail, never the banner.
   *
   * They answer different questions — the banner is what this place feels like,
   * the avatar is what a piece of it looks like — and a collection with a
   * composed banner still wants its token art in the round.
   */
  const avatar = avatarFor(address);

  return (
    <header className="ch">
      <div
        className={`ch-band${hero !== undefined ? " ch-band-art-custom" : ""}${hero?.video !== undefined ? " ch-band-video" : ""}`}
      >
        {hero !== undefined ? (
          <>
            {hero.video !== undefined ? (
              <BannerVideo
                src={hero.video.src}
                still={hero.video.still}
                {...(hero.video.fallback === undefined ? {} : { fallback: hero.video.fallback })}
                {...(hero.position === undefined ? {} : { position: hero.position })}
              />
            ) : hero.background === undefined ? null : (
              // eslint-disable-next-line @next/next/no-img-element -- local, pre-sized, fills a fixed box
              <img
                className="ch-bg"
                src={hero.background}
                alt=""
                aria-hidden="true"
                decoding="async"
                /* Per-banner crop, where the art needs one — see `position` in
                   config/heroes.ts. Absent, the stylesheet's centre applies. */
                {...(hero.position === undefined ? {} : { style: { objectPosition: hero.position } })}
              />
            )}
            {hero.foreground === undefined ? null : (
              /*
                Named rather than hidden, unlike the background.

                A character standing in a header is closer to a logo than to
                wallpaper, and `alt=""` would drop the one part of this band
                that carries meaning. The background stays hidden because
                describing a blurred bar interior tells a reader nothing the
                collection's name did not already say.
              */
              // eslint-disable-next-line @next/next/no-img-element -- local, pre-sized, height-driven
              <img
                className="ch-fg"
                src={hero.foreground}
                alt={hero.foregroundAlt ?? ""}
                decoding="async"
              />
            )}
          </>
        ) : covers === undefined ? null : (
          <div className="ch-band-blur" data-count={Math.min(covers.length, 4)} aria-hidden="true">
            {covers.slice(0, 4).map((src) => (
              /*
                A plain `img`, not `Art`.

                This is decoration: blurred past recognition, carrying nothing
                the avatar does not. `Art` exists to render artwork somebody is
                looking at — it holds failure state and swaps a still for an
                animation — and all of that is wasted here. The files are local
                and already small.
              */
              // eslint-disable-next-line @next/next/no-img-element -- decorative, local, pre-sized
              <img key={src} src={src} alt="" loading="eager" decoding="async" />
            ))}
          </div>
        )}

        {/*
          The scrim is not styling — it is what makes the row below legible.

          The identity overlaps the band's lower edge, and a collection whose
          artwork is pale there would put near-white text on near-white. It runs
          to transparent at the top so it never reads as a band of its own.
        */}
        <div className="ch-scrim" aria-hidden="true" />

      </div>

      <div className="ch-body">
        <div className="ch-avatar">
          {avatar === undefined ? (
            <span className="ch-avatar-empty" aria-hidden="true">
              {(symbol ?? name ?? "?").slice(0, 2).toUpperCase()}
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local, fixed box, no srcset worth generating
            <img src={avatar} alt="" width={96} height={96} decoding="async" />
          )}
        </div>

        <div className="ch-id">
          {/*
            Name and actions on one row, and the whole row sits BELOW the band.

            Three arrangements were measured before this one. Beside the name
            with the identity row lifted into the band, the controls overlapped
            the Cybereator cutout by 110x25px — "Share" on the cat's coat.
            Raising the figure to clear them exposed that its bottom-right
            corner is fully opaque, because the bar counter is part of the
            artwork, so lifting it made that counter a rectangle in mid-air.
            Moving the controls to the band's top corner failed too: the figure
            is full height on the right, so that corner is its head.

            The band is artwork and nothing else now. Only the avatar reaches
            into it, and nothing that can be drawn over a character is on the
            same layer as one.
          */}
          <div className="ch-namerow">
            <h2 className="ch-name">
              {/*
                The collection's own wordmark where it has one, still inside the
                heading so the document outline is unchanged and the mark
                carries the name as its accessible label.

                Gated on `name` having arrived as well as the mark existing:
                swapping a finished drawing in for "Loading…" shows a complete
                heading over a page that is still reading, which is a worse lie
                than the placeholder.
              */}
              {name !== undefined && mark !== undefined ? (
                <Wordmark mark={mark} name={name} />
              ) : (
                (name ?? t("Loading…"))
              )}
              {/*
                Inside the heading, beside the name it qualifies. Outside it the
                mark would be a sibling of the title rather than part of it, and
                a screen reader would read the collection's name and then,
                separately, that something here is verified — without saying
                what.
              */}
              <VerifiedMark collection={address} size={20} />
              {/* Beside it, for a collection earned by trading (config/tradingMark.ts). */}
              <TradingMark collection={address} size={20} />
            </h2>

            <div className="ch-actions">
              {action}
              <ShareLink title={name ?? undefined} />
              <Link className="ch-back" href="/collections">
                {t("All collections")}
              </Link>
            </div>
          </div>

          <div className="ch-chips">
            {symbol === undefined ? null : <span className="ch-chip">{symbol}</span>}
            {supply === undefined ? null : (
              <span className="ch-chip">
                {t(supply === 1n ? "{count} piece" : "{count} pieces", { count: formatCount(supply) })}
              </span>
            )}
            {/*
              The contract, which on a chain is the only unforgeable answer to
              "whose is this". A name can be copied; an address cannot.
            */}
            <a
              className="ch-chip ch-chip-link"
              href={`${deployment.explorer}/token/${address}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {shortAddress(address, 4)}
            </a>
            {x === undefined ? null : (
              <a
                className="ch-chip ch-chip-link ch-chip-icon ch-social ch-social-x"
                href={x.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t("{name} on X (@{handle})", { name: name ?? t("This collection"), handle: x.handle })}
                title={t("@{handle} on X", { handle: x.handle })}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                  />
                </svg>
                <span className="ch-social-label" aria-hidden="true">{t("Follow on X")}</span>
              </a>
            )}
            {/* The collection's own site and Discord, beside X, from config/socials.ts. */}
            {site === undefined ? null : (
              <a
                className="ch-chip ch-chip-link ch-chip-icon ch-social ch-social-site"
                href={site.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t("{name} website ({host})", { name: name ?? t("This collection"), host: site.host })}
                title={site.host}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
                  <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z" />
                  </g>
                </svg>
                <span className="ch-social-label" aria-hidden="true">
                  {t("Visit {name}", { name: name ?? site.host })}
                </span>
              </a>
            )}
            {discord === undefined ? null : (
              <a
                className="ch-chip ch-chip-link ch-chip-icon ch-social ch-social-discord"
                href={discord}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t("{name} on Discord", { name: name ?? t("This collection") })}
                title="Discord"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"
                  />
                </svg>
                <span className="ch-social-label" aria-hidden="true">{t("Join Discord")}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
