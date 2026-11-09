/** Which cues to play when, for a routine state and its session (pure). */

import { isRep, isRoutineActive } from '../routine.js'
import { PREP_MS } from '../timing.js'

/** Count-down phases (get ready, stretch holds, switch sides) tick this many last seconds. */
export const LAST_TICKS = 3

/**
 * Every sound left in the routine from `s`, as epoch-ms times:
 *   get ready, switch sides, next up  `ready` on its last 3, 2, 1
 *   a step's first second    `go` (a stretch starting; each breath's 1)
 *   counting up (breathing)  `tick` on 2, 3, 4
 *   counting down (a hold)   `tick` on its last 3, 2, 1
 *   a rep                    just its `go` (one note per rep sets the pace)
 *   finished                 `chime` (once, at the end of the session)
 * Nothing for an offer (it wasn't asked for) or while paused.
 * @returns {{ at: number, cue: 'ready' | 'go' | 'tick' | 'chime' }[]}
 */
export function soundPlan(s, ses) {
  if (!isRoutineActive(s) || s.pausedAt != null) return []
  const plan = []
  const lastTicks = (start, ms, cue) => {
    for (let k = Math.min(LAST_TICKS, Math.floor(ms / 1000)); k >= 1; k--) {
      const at = start + ms - k * 1000
      if (at > start || cue === 'ready') plan.push({ at, cue })
    }
  }
  let from = 0
  let t = s.endsAt
  if (s.phase === 'prep') lastTicks(s.endsAt - PREP_MS, PREP_MS, 'ready')
  else {
    from = s.step
    t = s.endsAt - ses.steps[s.step].ms
  }
  for (let i = from; i < ses.steps.length; i++) {
    const st = ses.steps[i]
    if (st.between) lastTicks(t, st.ms, 'ready')
    else {
      plan.push({ at: t, cue: 'go' })
      if (st.count === 'up') for (let k = 1; k * 1000 < st.ms; k++) plan.push({ at: t + k * 1000, cue: 'tick' })
      else if (!isRep(st)) lastTicks(t, st.ms, 'tick') // a rep: its go alone
    }
    t += st.ms
  }
  plan.push({ at: t, cue: 'chime' })
  return plan
}
