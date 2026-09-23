"use client";

import { Soso } from "@/components/Soso";
import { formatCount, formatSoso } from "@/lib/format";

/**
 * The figures at the top of a portfolio.
 *
 * Figure above label, five of them, and no sentences. Everything is either a
 * number or one word naming it: the strip is read at a glance on the way to
 * the pieces, and every word in it is a word standing between the reader and
 * those pieces.
 *
 * The wallet balance sits behind a rule because it is not holdings — it is
 * spending money, and adding it to the asking figure would be adding unlike
 * things. That rule is the only thing in here doing any explaining, and it
 * does it without text.
 *
 * The bar under "listed" is the one relationship a number stated badly: a
 * reader would have to divide 3 by 17 to get the share of a portfolio actually
 * for sale. It is drawn from the two numbers printed beside it, so it cannot
 * disagree with them.
 */
export function PortfolioSummary({
  pieces,
  collections,
  listed,
  asking,
  balance,
}: {
  pieces: number;
  collections: number;
  listed: number;
  /** Total of the asking prices, in wei. */
  asking: bigint;
  /** Native SOSO held. `undefined` until the read lands. */
  balance?: bigint;
}) {
  /**
   * Guarded: an empty portfolio divides by zero and writes `NaN%` into a style
   * attribute, which the browser drops silently — leaving a full-width bar over
   * a portfolio holding nothing.
   */
  const listedShare = pieces > 0 ? Math.min(100, (listed / pieces) * 100) : 0;

  return (
    <section className="ps" aria-label="Portfolio summary">
      <div className="ps-group">
        <p className="ps-figure">{formatCount(BigInt(pieces))}</p>
        <p className="ps-label">{pieces === 1 ? "piece" : "pieces"}</p>
      </div>

      <div className="ps-group">
        <p className="ps-figure">{formatCount(BigInt(collections))}</p>
        <p className="ps-label">{collections === 1 ? "collection" : "collections"}</p>
      </div>

      <div className="ps-group">
        <p className="ps-figure">{formatCount(BigInt(listed))}</p>
        <p className="ps-label">listed</p>
        {/* Aria-hidden: "3" and "listed" say it better than a rectangle does. */}
        <div className="ps-bar" aria-hidden="true">
          <span className="ps-bar-fill" style={{ width: `${listedShare}%` }} />
        </div>
      </div>

      <div className="ps-group">
        <p className="ps-figure ps-figure-soso">
          <Soso size={13} markAt="unit">{formatSoso(asking)}</Soso>
        </p>
        <p className="ps-label">asking</p>
      </div>

      <div className="ps-group ps-group-wallet">
        <p className="ps-figure ps-figure-soso">
          <Soso size={13} markAt="unit">{formatSoso(balance)}</Soso>
        </p>
        <p className="ps-label">balance</p>
      </div>
    </section>
  );
}
