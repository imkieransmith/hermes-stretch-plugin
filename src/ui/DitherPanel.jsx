/**
 * The decorative dither: the main panel right of the text column, and a
 * barely-there edge behind the figure tile (side by side only).
 */

import { useEffect, useRef, useState } from 'react'
import { DITHER_PERIOD_PX, DITHER_RAMP_PX, DITHER_TILE_PX, ditherMask, rampMask, tileMask } from './dither.js'
import { prefersReducedMotion } from './hooks.js'
import { CARD_PAD_X_PX, CARD_PAD_Y_PX, DITHER_DRIFT_MS, DITHER_OPACITY } from './theme.js'

/**
 * How far the dither starts back under the text column (behind it). The
 * fade is near-empty there, so the faint first dots may touch the content.
 */
const DITHER_OVERLAP_PX = 150

/**
 * The left edge's width, CSS px from the card's left edge: just the start of
 * the fade (the sparse first dots), mirrored so it's faintest towards the
 * text. The tile's square is cut out of it (the tile's fill is translucent,
 * so being behind it isn't enough), so it only shows in the card's padding
 * around the tile and the gap after it.
 */
const DITHER_EDGE_PX = 200

/** An alpha mask from dither.js as a CSS url(), via our own offscreen canvas. */
function maskUrl(m) {
  const canvas = document.createElement('canvas')
  canvas.width = m.w
  canvas.height = m.h
  const g = canvas.getContext('2d')
  if (!g) return null
  const img = g.createImageData(m.w, m.h)
  for (let i = 0; i < m.alpha.length; i++) img.data[i * 4 + 3] = m.alpha[i]
  g.putImageData(img, 0, 0)
  return `url(${canvas.toDataURL()})`
}

/**
 * The masks already drawn, as CSS url()s, by name and device pixel ratio.
 * A mask depends on nothing else, so it's drawn and encoded once, not on
 * every mount (the panel remounts on each change of view: offer, exercise,
 * well done; and once per card in a split view). Derived data only, like
 * session.js's cache; a hot reload starts it afresh.
 */
const drawn = new Map()

function maskFor(name, scale, make) {
  const key = `${name}@${scale}`
  let url = drawn.get(key)
  if (!url) {
    url = maskUrl(make(scale))
    if (url) drawn.set(key, url)
  }
  return url
}

const edgeMask = scale => ditherMask(0, DITHER_EDGE_PX, scale)

/** Mask styles (standard + -webkit-) for one layer. */
const maskStyle = (url, width, repeat) => ({
  maskImage: url,
  WebkitMaskImage: url,
  maskSize: `${width}px ${DITHER_PERIOD_PX}px`,
  WebkitMaskSize: `${width}px ${DITHER_PERIOD_PX}px`,
  maskRepeat: repeat,
  WebkitMaskRepeat: repeat,
  maskPosition: 'left top',
  WebkitMaskPosition: 'left top'
})

/**
 * One endless upward drift of the layer, stepped a CSS pixel at a time (crisp
 * cells): playing while `moving`, paused otherwise, never with reduced motion.
 */
function useDrift(layerRef, moving) {
  const drift = useRef(null)
  useEffect(() => {
    const el = layerRef.current
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return undefined
    drift.current = el.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${DITHER_PERIOD_PX}px)` }], {
      duration: DITHER_DRIFT_MS,
      easing: `steps(${DITHER_PERIOD_PX})`,
      iterations: Infinity
    })
    if (!moving) drift.current.pause()
    return () => {
      drift.current.cancel()
      drift.current = null
    }
  }, [])
  useEffect(() => {
    const anim = drift.current
    if (anim) moving ? anim.play() : anim.pause()
  }, [moving])
}

const RADIUS = 'calc(var(--radius-2xl) - 1px)' // inside the card's 1px border

const INK = { position: 'absolute', top: 0, bottom: 0, background: 'var(--ui-text-primary)' }

/** The drifting layer (one period taller than its frame, so it can move up). */
const layerStyle = ready => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: -DITHER_PERIOD_PX,
  opacity: ready ? DITHER_OPACITY : 0,
  transition: 'opacity 400ms ease'
})

/**
 * Fills the space right of the text column, starting DITHER_OVERLAP_PX back
 * under it, and bleeds through the card's padding to its top, right and
 * bottom edges. Anchored on the left: the fade starts at the same place
 * whatever the card's width, and a wider card just shows more of the thick
 * part (the ramp, then a flat tile repeating). The masks are drawn once
 * (maskFor); mounting again or resizing redraws nothing. They sit over a theme-coloured fill, so it
 * follows the theme. While `moving`, it drifts upward a CSS pixel at a time
 * (one full tile per DITHER_DRIFT_MS); paused otherwise, and never with
 * reduced motion. Purely decorative: aria-hidden, no pointer.
 */
export function DitherPanel({ moving }) {
  const layerRef = useRef(null)
  const [masks, setMasks] = useState(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const scale = window.devicePixelRatio || 1 // device px per CSS px: crisp cells
    const ramp = maskFor('ramp', scale, rampMask)
    const tile = maskFor('tile', scale, tileMask)
    if (ramp && tile) setMasks({ ramp, tile })
  }, [])

  useDrift(layerRef, moving)

  // The spacer takes only the free space beside the column (no negative
  // margins: in a flex row they'd hand that space to the text column). The
  // frame inside is absolute, so reaching back under the text and out to the
  // card's edges never changes anyone's layout.
  return (
    <div
      aria-hidden="true"
      style={{
        flex: '1 1 0',
        minWidth: 0,
        alignSelf: 'stretch',
        position: 'relative',
        zIndex: -1, // behind the text column it reaches under (StretchBody isolates)
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -CARD_PAD_Y_PX,
          bottom: -CARD_PAD_Y_PX,
          right: -CARD_PAD_X_PX,
          left: -DITHER_OVERLAP_PX,
          overflow: 'hidden',
          borderTopRightRadius: RADIUS,
          borderBottomRightRadius: RADIUS
        }}
      >
        <div ref={layerRef} style={layerStyle(masks)}>
          {masks ? (
            <>
              <div
                style={{ ...INK, left: 0, width: DITHER_RAMP_PX, ...maskStyle(masks.ramp, DITHER_RAMP_PX, 'repeat-y') }}
              />
              <div
                style={{ ...INK, left: DITHER_RAMP_PX, right: 0, ...maskStyle(masks.tile, DITHER_TILE_PX, 'repeat') }}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Mask styles for a frame with the tile's square cut out (everything XOR the square). */
function holeStyle(size) {
  const image = 'linear-gradient(#000, #000), linear-gradient(#000, #000)'
  const sizes = `100% 100%, ${size}px ${size}px`
  const position = `0 0, ${CARD_PAD_X_PX}px center`
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskSize: sizes,
    WebkitMaskSize: sizes,
    maskPosition: position,
    WebkitMaskPosition: position,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskComposite: 'exclude',
    WebkitMaskComposite: 'xor'
  }
}

/**
 * The faint start of the fade, mirrored, from the card's left edge in behind
 * the figure tile: absolute in TileRow's row (which is position: relative),
 * bleeding through the card's padding to its top, left and bottom edges.
 * Drifts with the main panel. `tile`: the figure tile's size, cut out of it
 * (a square hole; the tile's rounded corners leave a few px uncovered, too
 * few for a dot to matter). The tile is vertically centred in the row, and
 * this frame reaches equally above and below, so the hole is centred too.
 * Purely decorative: aria-hidden, no pointer.
 */
export function DitherEdge({ moving, tile }) {
  const layerRef = useRef(null)
  const [mask, setMask] = useState(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    setMask(maskFor('edge', window.devicePixelRatio || 1, edgeMask))
  }, [])

  useDrift(layerRef, moving)

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: -CARD_PAD_Y_PX,
        bottom: -CARD_PAD_Y_PX,
        left: -CARD_PAD_X_PX,
        width: DITHER_EDGE_PX,
        overflow: 'hidden',
        zIndex: -1, // behind the tile (StretchBody isolates)
        pointerEvents: 'none',
        borderTopLeftRadius: RADIUS,
        borderBottomLeftRadius: RADIUS,
        ...holeStyle(tile)
      }}
    >
      <div ref={layerRef} style={layerStyle(mask)}>
        {mask ? (
          <div
            style={{
              ...INK,
              left: 0,
              width: DITHER_EDGE_PX,
              transform: 'scaleX(-1)', // densest at the card's edge, fading towards the text
              ...maskStyle(mask, DITHER_EDGE_PX, 'repeat-y')
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
