/** The card below the input, choosing picker or compact / large / done by phase. */

import { useValue } from '@hermes/plugin-sdk'
import { useRef } from 'react'
import { isLargePhase, isStalled, isTimed, tickRoutine } from '../routine.js'
import { sessionOf } from '../session.js'
import { SessionPicker } from './SessionPicker.jsx'
import { StretchCompact } from './StretchCompact.jsx'
import { StretchDone } from './StretchDone.jsx'
import { StretchLarge } from './StretchLarge.jsx'
import { useCardMotion, useFadeOnChange, useTicker, useWidth } from './hooks.js'
import { CARD_PAD_X_PX, CARD_PAD_Y_PX } from './theme.js'

const STACK_BELOW_PX = 540

/** The stretch UI, sized by phase. */
function StretchBody({ model }) {
  const stored = useValue(model.$routine)
  const closing = useValue(model.$closing)
  // Draw from the clock, not just the store: the routine driver advances the
  // store on its own 200 ms interval, so between a step ending and the driver
  // noticing, the store still holds the finished step (which would show a
  // "0"). Catching up here means the card always shows the step that's
  // actually running; the driver catches the store up moments later.
  // While it fades out, keep showing the last frame: Stop resets the
  // routine at once (so sound stops), and the card mustn't flip to the
  // compact view on its way out.
  // After a sleep (isStalled) there's nothing to catch up to: the driver
  // stops the session on its next tick, so show it as it was until then.
  const frame = useRef(null)
  if (!closing || !frame.current) {
    const t = Date.now()
    frame.current = { now: t, s: isStalled(stored, t) ? stored : tickRoutine(stored, sessionOf(stored), t) }
  }
  const { now, s } = frame.current
  const ref = useRef(null)
  const width = useWidth(ref)
  const stacked = width != null && width < STACK_BELOW_PX
  const layout = s.phase === 'done' ? 'done' : isLargePhase(s.phase) ? 'large' : 'compact'
  // 100 ms keeps each second of the countdown even (≤ 0.1 s late).
  useTicker(isTimed(s) && s.pausedAt == null && !closing, 100)
  useFadeOnChange(ref, layout)
  // The mute toggle sits at the right end of the exercise view's button row
  // (only there: the offer plays no sound, and well done is over).
  return (
    <div
      ref={ref}
      // isolate: the dither panel's z-index -1 stays inside the card, behind our text
      style={{ position: 'relative', isolation: 'isolate', width: '100%', fontSize: 12, boxSizing: 'border-box' }}
    >
      {layout === 'done' ? (
        <StretchDone model={model} stacked={stacked} />
      ) : layout === 'large' ? (
        <StretchLarge model={model} s={s} now={now} stacked={stacked} />
      ) : s.picker ? (
        <SessionPicker model={model} s={s} now={now} stacked={stacked} />
      ) : (
        <StretchCompact model={model} s={s} stacked={stacked} />
      )}
    </div>
  )
}

/**
 * COMPOSER_AREAS.underside: below the input box, outside its frame. It's still
 * inside the chat pane, so the app's focus-follows-hover keeps the input box
 * focused while you use it.
 */
export function ComposerCard({ model }) {
  const closing = useValue(model.$closing)
  const rootRef = useRef(null)
  useCardMotion(rootRef, closing)
  return (
    <div
      ref={rootRef}
      style={{
        width: '100%', // the underside strip is a wrapping flex row
        padding: `${CARD_PAD_Y_PX}px ${CARD_PAD_X_PX}px`,
        borderRadius: 'var(--radius-2xl)',
        border: '1px solid color-mix(in srgb, var(--color-border, var(--ui-stroke-secondary)) 65%, transparent)',
        background: 'var(--composer-fill, var(--ui-bg-card))',
        backdropFilter: 'blur(0.75rem) saturate(1.12)',
        WebkitBackdropFilter: 'blur(0.75rem) saturate(1.12)',
        pointerEvents: closing ? 'none' : undefined // fading out: nothing to press
      }}
    >
      <StretchBody model={model} />
    </div>
  )
}
