/**
 * Sessions (pure): a plan (a list of exercise ids) built into one flat list
 * of timed steps, so the routine engine runs a whole session the way it
 * runs one exercise. A single exercise is a one-part session.
 *
 * Each step records its `part` (which exercise of the plan it belongs to)
 * and its own `count` style, so one session can mix stretching (count
 * down) and breathing (count up). Between two exercises sits a "next up"
 * step (`intro: true`, `between: true`): the next exercise's get-ready,
 * with its setup cue and pose. It belongs to that next part but isn't on
 * its bar (like the first get-ready).
 */

import { EXERCISES } from './exercises/index.js'
import { NEXT_MS } from './timing.js'

/** Build a session from exercises (no lookup, no cache: tests and planning). */
export function buildSession(parts) {
  const steps = []
  parts.forEach((ex, part) => {
    if (part > 0)
      steps.push({
        ms: NEXT_MS,
        label: 'next up',
        cue: ex.setup,
        pose: ex.prepPose,
        round: null,
        between: true,
        intro: true,
        count: 'down',
        part
      })
    for (const st of ex.steps) steps.push({ ...st, count: ex.count || 'down', part })
  })
  return { plan: parts.map(ex => ex.id), parts, steps, prepPose: parts.length ? parts[0].prepPose : null }
}

/**
 * The few sessions in use (the running one, an offer's), so every tick
 * gets the same object back. Only derived data from constant exercises.
 */
const recent = new Map()

const RECENT_MAX = 8

/** The session for a routine state (or a plan). Unknown ids are dropped. */
export function sessionOf(s) {
  const plan = (Array.isArray(s) ? s : s && s.plan) || []
  const key = plan.join(',')
  let ses = recent.get(key)
  if (!ses) {
    ses = buildSession(plan.map(id => EXERCISES[id]).filter(Boolean))
    if (recent.size >= RECENT_MAX) recent.delete(recent.keys().next().value)
    recent.set(key, ses)
  }
  return ses
}

/** Which part (exercise index) a state is in: a step's own; else the first, or the last once done. */
export function partIndex(s, ses) {
  if (s.phase === 'step' || s.phase === 'done') return (ses.steps[s.step] || {}).part || 0
  return 0
}

/** The exercise a state is in (the get-ready counts as the first). */
export function partOf(s, ses) {
  return ses.parts[partIndex(s, ses)] || null
}
