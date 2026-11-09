/** The figure tile beside the text, and how big it is. */

import { DitherEdge, DitherPanel } from './DitherPanel.jsx'
import { Figure } from './parts.jsx'
import { COLUMN_MAX_PX } from './theme.js'

const TILE_PAD_PX = 14

/**
 * The exercise's tile (and well done's), side by side with the text: one
 * size for every exercise, so the figure never changes size between them.
 * Not the text column's height: that differs (a bar with or without labels
 * under it, a line that wraps). Just over the column's height (~253 px in
 * Chromium: StretchLarge keeps it the same for every exercise), so the
 * card's height is the tile's: fixed, and the buttons never move.
 */
export const EXERCISE_TILE_PX = 256

/** Narrower than STACK_BELOW_PX the tile sits on its own line, this tall. */
const TILE_STACKED_PX = 220

/** The offers' tile grows with taller text (a bigger text scale), up to this. */
const TILE_MAX_PX = 280

/** An offer's tile size: its text's height, at least `min`, at most TILE_MAX_PX. */
export function tileSize(textHeight, min) {
  if (textHeight == null) return min
  return Math.max(min, Math.min(TILE_MAX_PX, textHeight))
}

/**
 * The grey tile holding the figure, `size` px square. Stacked, it spans the
 * text column's width (same edges as the bar and buttons below), with the
 * figure centred in it.
 *
 * Every figure sits on the tile's bottom edge, with padding above and beside
 * it: a waist-up drawing's cut is then the tile's edge, and a whole-body one
 * stands on it (its image has a little room under the feet). The tile clips
 * anything past its rounded corners.
 */
function FigureTile({ figure, size, stacked }) {
  return (
    <div
      style={{
        flex: 'none',
        boxSizing: 'border-box',
        height: size,
        padding: `${TILE_PAD_PX}px ${TILE_PAD_PX}px 0`,
        borderRadius: 'var(--radius-xl)',
        background: 'var(--ui-bg-tertiary)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        ...(stacked ? { alignSelf: 'stretch', maxWidth: COLUMN_MAX_PX } : { width: size })
      }}
    >
      <Figure figure={figure} size={size - TILE_PAD_PX} />
    </div>
  )
}

/**
 * Figure tile + text column (+ the dither in the space to the right, and its
 * faint start mirrored behind the tile): side
 * by side, or tile above when `stacked` (no dither: no space beside). The
 * column is width 100%, max COLUMN_MAX_PX; the dither takes whatever is
 * left (none on a narrow card, more on a wider one). `drift`: the dither
 * drifts (an exercise running, not paused). `figure`: its key (Figure).
 * `size`: the tile's size side by side (stacked, it's TILE_STACKED_PX).
 */
export function TileRow({ figure, stacked, size, text, drift = false }) {
  // Same element tree stacked or not (tile, column, …) so the column (and
  // anything measuring it) is never remounted as the card crosses the
  // breakpoint.
  if (stacked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
        <FigureTile figure={figure} size={TILE_STACKED_PX} stacked />
        <div style={{ alignSelf: 'stretch', minWidth: 0, maxWidth: COLUMN_MAX_PX }}>{text}</div>
      </div>
    )
  }
  // No row gap after the column (marginLeft instead): with no room for the
  // dither, the column runs right to the card's edge.
  return (
    <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
      <FigureTile figure={figure} size={size} />
      <div style={{ flex: `0 1 ${COLUMN_MAX_PX}px`, minWidth: 0, marginLeft: 24 }}>{text}</div>
      <DitherPanel moving={drift} />
      {/* Last, so the tile and column keep their slots (never remounted). */}
      <DitherEdge moving={drift} tile={size} />
    </div>
  )
}
