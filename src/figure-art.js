/**
 * The exercise figures as data URLs: `{ 'exercise-id/pose': 'data:image/png;base64,…' }`.
 *
 * Empty here. scripts/build.mjs replaces this module in the bundle with every
 * image in assets/figures/<exercise-id>/<pose>.png, so no network and no
 * files at runtime. Tests import src/ directly and get this empty map: the
 * card then shows the placeholder.
 */
export const FIGURE_ART = {}
