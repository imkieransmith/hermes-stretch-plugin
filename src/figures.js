/**
 * Which figure the card shows (pure). A figure is one pose of one exercise,
 * keyed 'exercise-id/pose'; the artwork itself is in figure-art.js (filled
 * in by the build): the colour drawing, transparent around the figure. (A
 * single-colour variant tinted with the theme was tried: on dark themes it
 * read as a photo negative.)
 */

import { FIGURE_ART } from './figure-art.js'

/** The session picker's artwork: one fixed image, not tied to the exercises picked. */
export const OFFER_FIGURE = 'overhead-side-bend/left'

/** The well-done screen's artwork: one-off art (the toolkit's ARTWORK), not an exercise pose. */
export const DONE_FIGURE = 'well-done/thumbs-up'

export const figureKey = (exerciseId, pose) => `${exerciseId}/${pose}`

/** The artwork's data URL for a figure, or null (no art: the placeholder). */
export function figureArt(key, art = FIGURE_ART) {
  return (key && art[key]) || null
}
