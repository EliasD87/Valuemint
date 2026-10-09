"use client";

import { firstPieces, pieceKey, togglePiece } from "@/lib/piecePick";
import "./PiecePicker.css";

export interface PieceChoice {
  id: bigint;
  /** A design or name, shown when it tells pieces apart. */
  note?: string;
}

/**
 * Every piece as a toggle, for choosing exactly which go (2026-10-09).
 *
 * Used where a count used to decide on its own: bulk listing and selling into
 * a batch offer. The count still makes the starting selection; this is where
 * #123 goes in and #455 comes out. See lib/piecePick.ts.
 *
 * Ids only, no artwork: the pieces here are one level of one collection and
 * mostly share a picture, and a wallet can hold hundreds of them.
 */
export function PiecePicker({
  pieces,
  selected,
  onChange,
  max,
  disabled = false,
  label,
}: {
  pieces: readonly PieceChoice[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** The most that can be chosen. Every piece when not given. */
  max?: number;
  disabled?: boolean;
  /** What is being chosen, for screen readers: "Pieces to list". */
  label: string;
}) {
  const cap = Math.min(max ?? pieces.length, pieces.length);
  const count = pieces.filter((p) => selected.has(pieceKey(p.id))).length;
  const full = count >= cap;
  const ids = pieces.map((p) => p.id);

  return (
    <div className="pp" role="group" aria-label={label}>
      <div className="pp-head">
        <span className="pp-count">
          <b>{count}</b> of {pieces.length} chosen
          {cap < pieces.length ? <span className="pp-cap"> · up to {cap}</span> : null}
        </span>
        <span className="pp-acts">
          <button
            type="button"
            className="pp-link"
            disabled={disabled || count === cap}
            onClick={() => onChange(firstPieces(ids, cap))}
          >
            {cap < pieces.length ? `First ${cap}` : "All"}
          </button>
          <button
            type="button"
            className="pp-link"
            disabled={disabled || count === 0}
            onClick={() => onChange(new Set())}
          >
            None
          </button>
        </span>
      </div>
      <div className="pp-grid">
        {pieces.map((p) => {
          const on = selected.has(pieceKey(p.id));
          return (
            <button
              key={pieceKey(p.id)}
              type="button"
              className={on ? "pp-chip is-on" : "pp-chip"}
              aria-pressed={on}
              disabled={disabled || (!on && full)}
              onClick={() => onChange(togglePiece(selected, p.id, cap))}
            >
              #{p.id.toString()}
              {p.note !== undefined ? <small>{p.note}</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
