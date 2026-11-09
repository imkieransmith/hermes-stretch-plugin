/** The large card, while an exercise runs. */

import { Button } from '@hermes/plugin-sdk'
import { useRef } from 'react'
import { countParts, currentFigure } from '../routine.js'
import { partIndex, sessionOf } from '../session.js'
import { RoutineBar } from './RoutineBar.jsx'
import { useEnterOnChange } from './hooks.js'
import { QuietButton, SoundToggle } from './parts.jsx'
import { S } from './theme.js'
import { EXERCISE_TILE_PX, TileRow } from './tile.jsx'

/**
 * Space above each block of the large card: title + cue (a pair, close
 * together), then count, bar, buttons. Uneven on purpose: each evens out the
 * blank space a block's font leaves above/below its letters, so the VISIBLE
 * gaps come out even (measured from rendered pixels): ~8px inside the pair,
 * ~20px between blocks.
 */
const LARGE_GAPS = { cue: 4, count: 10, bar: 14, buttons: 20, safety: 16 }

/**
 * While a session runs: figure, big countdown, routine bar, cue, controls.
 * The title, bar, cue and safety line are the current exercise's; a session
 * of several also says which one you're on ("2 of 4").
 */
export function StretchLarge({ model, s, now, stacked }) {
  const ses = sessionOf(s)
  const part = partIndex(s, ses)
  const ex = ses.parts[part]
  const a = model.actions
  const paused = s.pausedAt != null
  const step = s.phase === 'step' ? ses.steps[s.step] : null
  const cue = step ? step.cue : ex.setup
  // Each new step eases in: the countdown + its caption, and the cue (only
  // when the words actually change).
  const stepKey = `${s.phase}:${s.step}`
  const count = countParts(s, ses, now)
  const countRef = useRef(null)
  const cueRef = useRef(null)
  useEnterOnChange(countRef, stepKey)
  useEnterOnChange(cueRef, cue)

  const body = (
    <div
      style={{
        display: 'grid',
        alignContent: 'center'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <span style={S.heading}>{ex.name}</span>
        {ses.parts.length > 1 ? (
          <span
            style={{ ...S.supporting, fontSize: 13, whiteSpace: 'nowrap' }}
          >{`${part + 1} of ${ses.parts.length}`}</span>
        ) : null}
      </div>
      <div ref={cueRef} style={{ ...S.body, marginTop: LARGE_GAPS.cue }}>
        {cue}
      </div>
      <div ref={countRef} style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: LARGE_GAPS.count }}>
        <span
          style={{
            fontSize: 56,
            fontWeight: 300,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--ui-text-primary)',
            opacity: paused ? 0.45 : 1
          }}
        >
          {count.pad ? (
            <span aria-hidden="true" style={S.decorative}>
              {count.pad}
            </span>
          ) : null}
          {count.digits}
        </span>
        <span style={{ ...S.supporting, fontSize: 13 }}>{paused ? 'paused' : step ? step.label : 'get ready'}</span>
      </div>
      <div style={{ marginTop: LARGE_GAPS.bar }}>
        <RoutineBar s={s} ses={ses} now={now} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: LARGE_GAPS.buttons }}>
        <Button variant="secondary" onClick={paused ? a.resume : a.pause}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <QuietButton onClick={a.skip}>Skip</QuietButton>
        <QuietButton onClick={a.stop}>Stop</QuietButton>
        <SoundToggle model={model} />
      </div>
      {/* Room for two lines whatever its length: a line that wraps on a
          narrower card mustn't change the card's height between exercises. */}
      <div
        style={{ ...S.supporting, fontSize: 12, lineHeight: 1.45, minHeight: '2.9em', marginTop: LARGE_GAPS.safety }}
      >
        {ex.safety}
      </div>
    </div>
  )

  return (
    <TileRow figure={currentFigure(s, ses)} stacked={stacked} size={EXERCISE_TILE_PX} text={body} drift={!paused} />
  )
}
