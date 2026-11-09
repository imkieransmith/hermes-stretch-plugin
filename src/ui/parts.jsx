/** Small pieces of the card: buttons, figure placeholder, bars, icons. */

import { useValue, Button, Codicon, icons, Tip } from '@hermes/plugin-sdk'
import { figureArt } from '../figures.js'
import { BUTTON_ICON_PX, ICON_PX, ICON_STROKE, buttonIconStyle, iconStyle } from './theme.js'

/**
 * Secondary actions on the card ("Skip", "Not now", "Close"): core Button,
 * `outline` variant. Not `text`: that's tertiary grey (~3.4:1 on the light
 * theme, under WCAG AA); outline uses primary text (DESIGN.md variants).
 */
export function QuietButton({ onClick, size, children }) {
  return (
    <Button variant="outline" size={size} onClick={onClick}>
      {children}
    </Button>
  )
}

/**
 * The exercise illustration, `size` px square: `figure` is its key
 * ('exercise-id/pose', see figures.js); the colour drawing, transparent
 * around the figure, on the tile. Decorative (the words say what to do), so
 * hidden from screen readers. No art for it (tests, an exercise not drawn
 * yet): FigurePlaceholder.
 */
export function Figure({ figure, size }) {
  const url = figureArt(figure)
  if (!url) return <FigurePlaceholder label={figure ? figure.split('/').pop() : ''} size={size} />
  return (
    <img
      aria-hidden="true"
      alt=""
      draggable={false}
      src={url}
      width={size}
      height={size}
      style={{
        display: 'block',
        flex: 'none',
        width: size,
        height: size,
        objectFit: 'contain'
      }}
    />
  )
}

/** Where a figure has no artwork: a dashed box naming the pose. */
function FigurePlaceholder({ label, size }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--ui-stroke-secondary)',
        color: 'var(--ui-text-quaternary)',
        fontSize: size >= 80 ? 11 : 9,
        lineHeight: 1.3,
        whiteSpace: 'pre-line'
      }}
    >
      {size >= 80 ? `figure\n${label}` : label.slice(0, 1)}
    </div>
  )
}

/** Progress bar; `fill` 0 → 1. */
export function Bar({ fill, dim = false, height = 4 }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height,
        borderRadius: 999,
        background: 'var(--ui-stroke-secondary)',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, fill)) * 1000) / 10}%`,
          height: '100%',
          borderRadius: 999,
          background: 'var(--ui-accent)',
          opacity: dim ? 0.45 : 1,
          transition: 'width 200ms linear, opacity 200ms ease'
        }}
      />
    </div>
  )
}

/**
 * Mute toggle, pushed to the right end of the card's button row
 * (unlabelled icon, so it gets a Tip). Outline like the QuietButtons beside
 * it, default size: with a BUTTON_ICON_PX svg as its direct child the Button
 * uses its own icon padding and matches the text buttons' height.
 * Tabler like the rest of the card: on is Tabler's volume (two waves,
 * drawn inline: Hermes doesn't re-export it), the shape its volume-off
 * (`icons.VolumeX`) strikes through. Volume2 (one wave) didn't match it.
 * Codicon only if a Hermes build lacks `icons`.
 */
export function SoundToggle({ model }) {
  const on = useValue(model.$settings).soundOn
  const label = on ? 'Mute' : 'Unmute'
  const Off = icons && icons.VolumeX
  return (
    <div style={{ marginLeft: 'auto', display: 'flex' }}>
      <Tip label={label}>
        <Button variant="outline" aria-label={label} onClick={model.actions.toggleSound}>
          {on ? (
            <VolumeIcon />
          ) : Off ? (
            <Off aria-hidden="true" size={BUTTON_ICON_PX} stroke={ICON_STROKE} style={buttonIconStyle} />
          ) : (
            <Codicon name="mute" size={`${BUTTON_ICON_PX}px`} />
          )}
        </Button>
      </Tip>
    </div>
  )
}

/** Tabler IconVolume (MIT, tabler.io), inline: not in Hermes's `icons`. */
function VolumeIcon() {
  return (
    <svg
      aria-hidden="true"
      width={BUTTON_ICON_PX}
      height={BUTTON_ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={buttonIconStyle}
    >
      <path d="M15 8a5 5 0 0 1 0 8" />
      <path d="M17.7 5a9 9 0 0 1 0 14" />
      <path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5" />
    </svg>
  )
}

/**
 * A tick in a ring, in the accent colour: the app's own icon (Tabler
 * IconCircleCheck, `icons.CheckCircle2` in the SDK). Falls back to the same
 * shape drawn inline if a Hermes build doesn't export `icons`.
 */
export function Tick() {
  const Icon = icons && icons.CheckCircle2
  if (Icon)
    return <Icon aria-hidden="true" size={ICON_PX} stroke={ICON_STROKE} color="var(--ui-accent)" style={iconStyle} />
  return (
    <svg
      aria-hidden="true"
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ui-accent)"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={iconStyle}
    >
      <circle cx={12} cy={12} r={9} />
      <path d="M9 12l2 2l4 -4" />
    </svg>
  )
}
