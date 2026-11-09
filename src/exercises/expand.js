/**
 * Turns an exercise spec (one entry in an area file) into what the
 * routine engine runs: timed steps, bar rounds and a count style. Pure.
 *
 * Patterns:
 *   hold       a hold per side with a switch between (or one hold)
 *   reps       paced reps; a rep is one strip, optionally in phases
 *   breathing  cycles of phases, counting up
 *   steps      anything else: an ordered list; consecutive steps with the
 *              same `strip` share a bar strip; `rest: true` steps are
 *              pauses (they sound like the get-ready)
 */

import { REST_MS } from '../timing.js'

const SIDES = ['Left', 'Right']

/** "Cross-body shoulder" → "cross-body-shoulder". */
export const slug = name =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const ms = sec => Math.round(sec * 1000)

/** The pause between sides: always REST_MS, with the spec's cue and pose. */
const switchStep = (cue, pose) => ({
  ms: REST_MS,
  label: 'switch sides',
  pose,
  round: null,
  between: true,
  barLabel: 'switch',
  cue
})

function hold(spec) {
  const step = (round, cue, pose) => ({ ms: ms(spec.holdSec), label: 'seconds left', pose, round, cue })
  if (spec.sides !== 'left_right')
    return { rounds: [null], roundText: () => 'Hold', steps: [step(0, spec.cue, spec.pose)] }
  const { cues, poses } = spec
  return {
    rounds: SIDES,
    roundText: i => `${SIDES[i]} side`,
    steps: [step(0, cues.left, poses.left), switchStep(cues.switch, poses.switch), step(1, cues.right, poses.right)]
  }
}

function reps(spec) {
  if (spec.sides === 'left_right') throw new Error(`${spec.name}: per-side reps aren’t supported; use steps`)
  const n = spec.reps
  const phases = spec.phases || [{ sec: spec.secPerRep, cue: spec.cue, pose: spec.pose }]
  return {
    count: 'reps',
    rounds: Array(n).fill(null),
    roundText: i => `Rep ${i + 1} of ${n}`,
    steps: Array.from({ length: n }, (_, round) =>
      phases.map(p => ({ ms: ms(p.sec), rep: round + 1, round, label: `of ${n}`, pose: p.pose, cue: p.cue }))
    ).flat()
  }
}

function breathing(spec) {
  const n = spec.cycles
  return {
    count: 'up',
    rounds: Array(n).fill(null),
    roundText: i => `Breath ${i + 1} of ${n}`,
    steps: Array.from({ length: n }, (_, round) =>
      spec.phases.map(p => ({ ms: ms(p.sec), label: p.caption, pose: p.pose, round, cue: p.cue }))
    ).flat()
  }
}

function steps(spec) {
  const sided = spec.sides === 'left_right'
  const strips = [] // the non-rest strips, in order: one bar round each
  let last = null
  const out = spec.steps.map(st => {
    const base = { ms: ms(st.sec), label: st.caption, pose: st.pose, cue: st.cue }
    if (st.rest) {
      last = null
      return { ...base, round: null, between: true, barLabel: st.strip }
    }
    if (st.strip !== last) strips.push(st.strip)
    last = st.strip
    return { ...base, round: strips.length - 1 }
  })
  return {
    rounds: sided ? strips : strips.map(() => null),
    roundText: i => (sided ? `${strips[i]} side` : `Part ${i + 1} of ${strips.length}`),
    steps: out
  }
}

const PATTERNS = { hold, reps, breathing, steps }

/** A spec → an exercise (see index.js for the shape). */
export function expand(spec) {
  const pattern = PATTERNS[spec.pattern]
  if (!pattern) throw new Error(`${spec.name}: unknown pattern "${spec.pattern}"`)
  return {
    id: slug(spec.name),
    name: spec.name,
    type: spec.type,
    area: spec.area,
    position: spec.position,
    setup: spec.setup,
    safety: spec.safety,
    prepPose: spec.startPose,
    breather: !!spec.breather,
    sources: spec.sources,
    ...pattern(spec)
  }
}
