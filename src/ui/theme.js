/** Shared styles: text colours, icon size, motion. Theme variables only. */

export const ENTER_MS = 280

export const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

export const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'

/** Text styles. Readable text must meet WCAG AA (4.5:1). */
export const S = {
  /** Supporting text. Secondary, not tertiary: tertiary is ~3.4:1 on the
   *  light theme, under AA for small text; this is ~6:1. */
  supporting: { color: 'var(--ui-text-secondary)' },
  /** Decoration only (the timer's leading zero): too faint to read. */
  decorative: { color: 'var(--ui-text-quaternary)' },
  mono: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' },
  /** The card's title (exercise name, the picker's "It's been…", "All done"). */
  heading: { fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ui-text-primary)' },
  /** The text under the title (an exercise's cue, the picker's why). */
  body: { fontSize: 14, lineHeight: 1.45, color: 'var(--ui-text-secondary)' }
}

/** The card's own padding (the dither panel bleeds through it to the edge). */
export const CARD_PAD_Y_PX = 10

export const CARD_PAD_X_PX = 12

/** The dither panel: ink opacity (theme text colour), and one full drift cycle. */
export const DITHER_OPACITY = 0.05

export const DITHER_DRIFT_MS = 120_000

/**
 * Widest the text column beside the figure gets (exercise + well done). One
 * width for the whole column: its children (title, cue, bar, buttons,
 * safety line) all fill it, so they share one right edge. Don't cap
 * children separately. About 75 characters of the 14 px cue: a comfortable
 * reading measure. Every safety line (≤ 110 characters, a test checks; the
 * longest is ~515 px at 12 px) fits on one line when there's room, so the
 * card doesn't change height between exercises. Below ~516 it wraps.
 */
export const COLUMN_MAX_PX = 518

export const FADE_MS = 160

export const STEP_ENTER_MS = 250

/** Even, symmetric fade (sine-like): no burst at the start like EASE_OUT. */
export const STEP_ENTER_EASE = 'cubic-bezier(0.37, 0, 0.63, 1)'

/**
 * One icon size and weight for the whole card: 20 px (Hermes's `iconSize.lg`)
 * at Tabler's own 2 px stroke (on its 24 px grid, so ~1.7 px drawn). Sized
 * with an inline style: buttons shrink any unsized svg to 12-14 px.
 */
export const ICON_PX = 20

export const ICON_STROKE = 2

export const iconStyle = { width: ICON_PX, height: ICON_PX, flex: 'none' }

/**
 * Icons inside a text-height button row (the mute toggle beside Pause /
 * Skip / Stop): 16 px, the button's own line height, so a default-size
 * Button holding it is exactly as tall as its text siblings (28 px).
 */
export const BUTTON_ICON_PX = 16

export const buttonIconStyle = { width: BUTTON_ICON_PX, height: BUTTON_ICON_PX, flex: 'none' }
