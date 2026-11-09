/**
 * Pure: the decorative ordered-dither texture to the right of the card's
 * text column (a monotone, Nous-style fade). Produces alpha masks only; the
 * colour comes from a theme variable in CSS, so it follows the theme.
 *
 * Anchored on the left: x is CSS px from where the dither starts (under the
 * text column). Ink density ramps from 0 there to DITHER_DENSITY at
 * DITHER_RAMP_PX, bent by slow warped bands, then stays flat. So a wider
 * card just shows more of the thick part; nothing slides when it resizes.
 * Two masks cover it: the ramp (DITHER_RAMP_PX wide) and a flat tile
 * (DITHER_TILE_PX wide) that repeats to any width. Both repeat every
 * DITHER_PERIOD_PX vertically, so the texture can drift upward forever. A few
 * horizontal streaks add a little "distortion".
 */

/** Texture height, CSS px: a multiple of the Bayer repeat (8 cells). */
export const DITHER_PERIOD_PX = 240

/** Where the fade reaches full density, CSS px from the start. */
export const DITHER_RAMP_PX = 640

/** The flat tile's width: one Bayer repeat (8 cells), so it tiles seamlessly. */
export const DITHER_TILE_PX = 16

/** Most of the area that's ever inked (the flat part, before streaks). */
export const DITHER_DENSITY = 0.5

/** One dither "pixel", CSS px. */
export const DITHER_CELL_PX = 2

const STREAK_ROW_PX = 2

const STREAK_INK = 0.22

// 8×8 Bayer threshold matrix (0…63).
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54,
  22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29,
  53, 21
]

const TAU = Math.PI * 2

/** Deterministic hash of two integers → [0, 1). */
export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Horizontal warp for a row (CSS px y): whole cycles per period, so it tiles. */
function warpAt(y) {
  const v = y / DITHER_PERIOD_PX
  return 0.14 * Math.sin(TAU * v + 0.4) + 0.07 * Math.sin(TAU * 3 * v + 1.3) + 0.03 * Math.sin(TAU * 7 * v + 2.1)
}

/** Extra density from a streak on this row, at ramp position u (≥ 1: flat). */
function streakAt(y, u) {
  const rows = DITHER_PERIOD_PX / STREAK_ROW_PX
  const row = ((Math.floor(y / STREAK_ROW_PX) % rows) + rows) % rows
  if (hash2(row, 7) < 0.93) return 0
  const reach = 0.2 + 0.5 * hash2(row, 11) // how far back into the ramp it starts
  return u > 1 - reach ? STREAK_INK * smoothstep(1 - reach, 1, u) : 0
}

/** Ink density (0…1) at CSS px (x, y), x measured from the dither's start. */
export function ditherDensity(x, y) {
  const u = x / DITHER_RAMP_PX
  // The warp bends the fade in the middle, and lets go at both ends (so the
  // ramp meets the flat tile exactly).
  const bend = warpAt(y) * smoothstep(0, 0.4, u) * (1 - smoothstep(0.75, 1, u))
  const ramp = u >= 1 ? 1 : Math.pow(smoothstep(0, 1, u + bend), 1.5)
  return Math.min(1, ramp * DITHER_DENSITY + streakAt(y, u))
}

/**
 * A mask of the field from CSS px x0, `width` × DITHER_PERIOD_PX, drawn at
 * `scale` device px per CSS px (devicePixelRatio, so cells stay crisp).
 * Returns { w, h, alpha } with alpha 0 or 255 per device pixel.
 */
export function ditherMask(x0, width, scale = 1) {
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.round(DITHER_PERIOD_PX * scale)
  const alpha = new Uint8ClampedArray(w * h)
  // Every device pixel of a cell is the same, so each cell is worked out
  // once: along a row for a run of pixels, then the row is copied down for
  // the cell's other pixel rows.
  const cellOf = new Int32Array(w)
  for (let px = 0; px < w; px++) cellOf[px] = Math.floor((x0 + px / scale) / DITHER_CELL_PX)
  let rowCy = -1
  for (let py = 0; py < h; py++) {
    const cy = Math.floor(py / scale / DITHER_CELL_PX)
    const row = py * w
    if (cy === rowCy) {
      alpha.copyWithin(row, row - w, row)
      continue
    }
    rowCy = cy
    let cx = -1
    let ink = 0
    for (let px = 0; px < w; px++) {
      if (cellOf[px] !== cx) {
        cx = cellOf[px]
        const t = (BAYER[(cy % 8) * 8 + (cx % 8)] + 0.5) / 64
        ink = ditherDensity(cx * DITHER_CELL_PX, cy * DITHER_CELL_PX) > t ? 255 : 0
      }
      alpha[row + px] = ink
    }
  }
  return { w, h, alpha }
}

/** The ramp mask (0 → DITHER_RAMP_PX). */
export const rampMask = scale => ditherMask(0, DITHER_RAMP_PX, scale)

/** The flat tile that repeats after the ramp. */
export const tileMask = scale => ditherMask(DITHER_RAMP_PX, DITHER_TILE_PX, scale)
