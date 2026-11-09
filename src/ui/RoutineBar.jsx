/** The routine bar: one segment per round, with labels. */

import { currentRound, routineSegments } from '../routine.js'
import { partOf } from '../session.js'
import { Bar } from './parts.jsx'

/** Routine bar thickness, and the gap between its segments. */
const ROUTINE_BAR_PX = 6

const ROUTINE_GAP_PX = 6

/** A labelled rest segment ("Switch") is never narrower than this. */
const REST_SEG_MIN_PX = 64

const LABEL_STYLE = { fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

/** Sentence-case a step label for display ("switch sides" → "Switch sides"). */
const sentence = t => (t ? t[0].toUpperCase() + t.slice(1) : t)

/**
 * The routine bar for the current exercise of the session `ses`, with
 * labels under it if the exercise has them: Left / Right for the rounds,
 * and the rest's own short label (Switch). The segment you're in has the
 * stronger label. Each segment is a column (bar over label), so a label
 * always sits under its own bar.
 *
 * The label line is always there, blank when there's no label: an exercise
 * without labels (no sides) must be as tall as one with them, or the card's
 * height and its buttons shift between exercises (under your cursor).
 */
export function RoutineBar({ s, ses, now }) {
  const ex = partOf(s, ses)
  const segs = routineSegments(s, ses, now)
  const paused = s.pausedAt != null
  const labelled = ex.rounds.some(Boolean)
  const at = s.phase === 'step' ? s.step : segs.length ? segs[0].first : 0
  const labelOf = seg => (seg.round != null ? ex.rounds[seg.round] : sentence(seg.label))
  return (
    <div
      role="group"
      aria-label={ex.roundText(currentRound(s, ses))}
      style={{ display: 'flex', gap: ROUTINE_GAP_PX, width: '100%' }}
    >
      {segs.map((seg, i) => {
        const rest = seg.round == null
        const current = at >= seg.first && at <= seg.last
        return (
          <div
            style={{
              flex: `${seg.weight} 1 0`,
              minWidth: rest && labelled ? REST_SEG_MIN_PX : 0,
              display: 'grid',
              gap: 6
            }}
            key={i}
          >
            <div style={{ display: 'flex' }}>
              <Bar fill={seg.fill} dim={paused} height={ROUTINE_BAR_PX} />
            </div>
            {labelled && labelOf(seg) ? (
              <span
                style={{
                  ...LABEL_STYLE,
                  color: current ? 'var(--ui-text-primary)' : 'var(--ui-text-secondary)'
                }}
              >
                {labelOf(seg)}
              </span>
            ) : (
              <span aria-hidden="true" style={LABEL_STYLE}>
                {'\u00a0'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
