/**
 * The offer layout, shared by the session picker and the breather: the
 * artwork tile (OFFER_TILE_PX, the same for both offers, with the text
 * centred beside it), then a title, a line or two of copy, the buttons, and anything under them
 * (the picker's tick box). Narrow (`stacked`): like the exercise screen, the
 * tile spans the column above the text, the figure centred in it.
 */

import { useRef } from 'react'
import { useHeight } from './hooks.js'
import { S } from './theme.js'
import { TileRow, tileSize } from './tile.jsx'

/**
 * Both offers' tile size, so the picker and the breather are the same
 * height side by side: just over the picker's text (two lines of copy +
 * buttons + tick box). The breather's shorter text is centred against it.
 * Text taller than this (a bigger text scale, more wrapping) grows the tile
 * with it rather than spilling past it.
 */
export const OFFER_TILE_PX = 152

export function OfferLayout({ figure, title, copy, buttons, below = null, stacked }) {
  const bodyRef = useRef(null)
  const textHeight = useHeight(bodyRef)
  const body = (
    <div ref={bodyRef}>
      {/* pretty: no orphaned last word */}
      <div style={{ ...S.heading, textWrap: 'pretty' }}>{title}</div>
      <div style={{ ...S.body, marginTop: 4, textWrap: 'pretty' }}>{copy}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>{buttons}</div>
      {below}
    </div>
  )
  // Always through TileRow, never the bare body: swapping
  // the outer element would remount the body as the card crosses the
  // breakpoint, and the tile would size itself from a stale height.
  return <TileRow figure={figure} stacked={stacked} size={tileSize(textHeight, OFFER_TILE_PX)} text={body} />
}
