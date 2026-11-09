/** The finished card. */

import { DONE_FIGURE } from '../figures.js'
import { QuietButton, Tick } from './parts.jsx'
import { S } from './theme.js'
import { EXERCISE_TILE_PX, TileRow } from './tile.jsx'

/**
 * The same words whatever you just did (a stretch session or a breather):
 * plain, no praise, nothing exercise-specific.
 */
const DONE_HEADING = 'All done'

/**
 * One nudge for what comes next: getting up and moving beats stretching in
 * your chair (HSE, NHS; see SOURCES.md). "If you can" because not everyone
 * can stand. Water is a friendly suggestion, not a health claim.
 */
export const DONE_NEXT = 'If you can, stand up, walk around, and grab some water.'

/**
 * Finished: same footprint as the exercise (no jump), a "done" figure, a tick
 * and DONE_HEADING. Leaves by itself after DONE_LINGER_MS; Close skips the wait.
 */
export function StretchDone({ model, stacked }) {
  return (
    <TileRow
      figure={DONE_FIGURE}
      stacked={stacked}
      size={EXERCISE_TILE_PX}
      text={
        <div
          style={{
            display: 'grid',
            alignContent: 'center',
            gap: 16 // ~20px visible, like the gap above the buttons while exercising
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tick />
            <span style={S.heading}>{DONE_HEADING}</span>
          </div>
          <p style={{ ...S.body, margin: 0 }}>{DONE_NEXT}</p>
          <div>
            <QuietButton onClick={model.actions.dismissDone}>Close</QuietButton>
          </div>
        </div>
      }
    />
  )
}
