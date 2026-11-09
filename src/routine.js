/**
 * The routine engine (pure, timestamp-driven): one state machine that runs
 * any session (one exercise or several, see session.js), plus what the card
 * derives from it (countdown, progress, bar segments, pose).
 */

import { figureKey } from './figures.js'
import { partIndex } from './session.js'
import { PREP_MS } from './timing.js'

/**
 * Routine state. Phases: idle → prep → step(0…n-1) → done. Nothing starts
 * by itself: an offer is `idle` until you press a start button. It runs a
 * session (session.js): `plan` is its exercise ids, and every function here
 * takes the session built from it (`ses`, from sessionOf). `picker`: the
 * compact card shows the session picker (short / medium / long) rather than
 * a single exercise's offer; `length` is the session length picked (null for
 * a single exercise). `endsAt` is the wall-clock end of the current phase;
 * while paused, `pausedAt` freezes time and resuming shifts `endsAt` by the
 * pause.
 */
const routine = (plan, phase, endsAt, length = null) => ({
  plan,
  picker: length != null,
  length,
  phase,
  step: 0,
  endsAt,
  pausedAt: null
})

/** Nothing running. No plan: the session picker (⌘K); a plan: that exercise's Start view. */
export function idleRoutine(plan = null) {
  return plan ? routine(plan, 'idle', null) : { ...routine([], 'idle', null), picker: true }
}

/** Start `plan` now (get ready first). `length`: the session length it was picked as. */
export function startRoutine(plan, now, length = null) {
  return routine(plan, 'prep', now + PREP_MS, length)
}

/** An exercise is underway (the user is committed; keep the card up). */
export function isRoutineActive(s) {
  return s.phase === 'prep' || s.phase === 'step'
}

/** The current phase has a running clock. */
export function isTimed(s) {
  return isRoutineActive(s)
}

export function phaseDurationMs(s, ses) {
  if (s.phase === 'step') return (ses.steps[s.step] || {}).ms || 0
  return s.phase === 'prep' ? PREP_MS : 0
}

/** Move to the next phase, starting it at `at`. */
export function advanceRoutine(s, ses, at) {
  const step = i => ({ ...s, phase: 'step', step: i, endsAt: at + ses.steps[i].ms, pausedAt: null })
  if (isTimed(s) && !ses.steps.length) return idleRoutine() // nothing to run (unknown ids)
  switch (s.phase) {
    case 'prep':
      return step(0)
    case 'step':
      return s.step < ses.steps.length - 1 ? step(s.step + 1) : { ...s, phase: 'done', endsAt: null, pausedAt: null }
    default:
      return s
  }
}

/** Catch up to `now` (handles missed ticks precisely). Returns `s` itself if nothing changed. */
export function tickRoutine(s, ses, now) {
  let cur = s
  while (isTimed(cur) && cur.pausedAt == null && now >= cur.endsAt) cur = advanceRoutine(cur, ses, cur.endsAt)
  return cur
}

/**
 * A running phase left this far past its end means nothing was ticking: the
 * computer slept (or the app was suspended) mid-exercise.
 */
export const STALLED_MS = 10_000

/** The clock ran on without us (see STALLED_MS): stop, rather than catch up through everything missed. */
export function isStalled(s, now) {
  return isTimed(s) && s.pausedAt == null && now - s.endsAt > STALLED_MS
}

export function pauseRoutine(s, now) {
  return isRoutineActive(s) && s.pausedAt == null ? { ...s, pausedAt: now } : s
}

export function resumeRoutine(s, now) {
  return s.pausedAt == null ? s : { ...s, endsAt: s.endsAt + (now - s.pausedAt), pausedAt: null }
}

/**
 * Skip: to the end of the current bar segment (unpauses). A whole round goes
 * at once (a breath's in/hold/out/hold is one segment), a rest is its own
 * segment, and a get-ready (no segment; "next up" too) skips to the first
 * step.
 */
export function skipRoutine(s, ses, now) {
  if (!isTimed(s)) return s
  const cur = s.phase === 'step' ? ses.steps[s.step] : null
  const sameRound = st => cur && cur.round != null && st.part === cur.part && st.round === cur.round
  let next = advanceRoutine(s, ses, now)
  while (next.phase === 'step' && sameRound(ses.steps[next.step])) next = advanceRoutine(next, ses, now)
  return next
}

export function remainingMs(s, now) {
  if (!isTimed(s)) return 0
  return Math.max(0, s.endsAt - (s.pausedAt ?? now))
}

/**
 * The whole seconds to show for a running phase: counts N … 1, never 0.
 * (At 0 the phase is over and the next one shows its own N.)
 */
export function displaySeconds(s, now) {
  return Math.max(1, Math.ceil(remainingMs(s, now) / 1000))
}

/** A rep step: its number is the rep (`rep`), not a time. */
export const isRep = st => st.count === 'reps' && st.rep != null

/**
 * The big number for the current phase. Steps of a counting-up exercise go
 * 1 … N (N on the last beat, never N+1); a rep shows its rep number for the
 * whole rep (its strip on the bar shows the time); everything else counts
 * down N … 1 (the get-ready and a reps exercise's rests included).
 */
export function displayCount(s, ses, now) {
  const st = s.phase === 'step' ? ses.steps[s.step] : null
  if (st && isRep(st)) return st.rep
  if (!st || st.count !== 'up') return displaySeconds(s, now)
  const total = phaseDurationMs(s, ses)
  const elapsed = total - remainingMs(s, now)
  return Math.min(Math.ceil(total / 1000), Math.floor(elapsed / 1000) + 1)
}

/**
 * The big number, zero-padded to the current exercise's widest value so it
 * never changes width within an exercise, from get ready through every
 * step: the neck stretch runs 05 … 01, 20 … 09 … 01, 05 … 01; box
 * breathing (never past 5) stays 5 … 1, 1 2 3 4. `pad` is the leading zeros
 * (drawn dimmed), `digits` the number.
 */
export function countParts(s, ses, now) {
  const part = partIndex(s, ses)
  const widest = Math.max(
    PREP_MS / 1000,
    ...ses.steps.filter(st => st.part === part).map(st => (isRep(st) ? st.rep : st.ms / 1000))
  )
  const digits = String(displayCount(s, ses, now))
  return { pad: '0'.repeat(Math.max(0, String(Math.ceil(widest)).length - digits.length)), digits }
}

export function countText(s, ses, now) {
  const { pad, digits } = countParts(s, ses, now)
  return pad + digits
}

/** 0 → 1 through the current phase. */
export function phaseProgress(s, ses, now) {
  const total = phaseDurationMs(s, ses)
  return total ? 1 - remainingMs(s, now) / total : 0
}

/** Whole length in ms (get ready + every step) of an exercise or a session. */
export function routineMs(ex) {
  return PREP_MS + ex.steps.reduce((sum, st) => sum + st.ms, 0)
}

/** Whole routine length, rounded to 5 s. */
export function routineSeconds(ex) {
  return Math.round(routineMs(ex) / 5000) * 5
}

/** The round you're in (or heading into, during a rest or a get-ready), within the current exercise. */
export function currentRound(s, ses) {
  const part = partIndex(s, ses)
  const from = s.phase === 'step' ? s.step : 0
  for (let i = from; i < ses.steps.length && ses.steps[i].part === part; i++)
    if (ses.steps[i].round != null) return ses.steps[i].round
  return 0
}

/** What the figure should show right now. */
export function currentPose(s, ses) {
  return s.phase === 'step' ? ses.steps[s.step].pose : ses.prepPose
}

/** The figure to show right now: the current exercise's pose ('id/pose'). */
export function currentFigure(s, ses) {
  const part = s.phase === 'step' ? ses.parts[ses.steps[s.step].part] : ses.parts[0]
  return part ? figureKey(part.id, currentPose(s, ses)) : null
}

/**
 * The routine bar, for the current exercise only: one segment per round (a
 * rest between rounds gets its own), weighted by duration, each filled
 * 0 → 1. `first`/`last` are the step indexes it covers; `label` is a rest's
 * bar label (rounds use the exercise's `rounds`). A "next up" step isn't on
 * the bar (like the first get-ready).
 * @returns {{ round: number | null, weight: number, fill: number, first: number, last: number, label: string | null }[]}
 */
export function routineSegments(s, ses, now) {
  const p = phaseProgress(s, ses, now)
  const part = partIndex(s, ses)
  const out = []
  ses.steps.forEach((st, i) => {
    if (st.part !== part || st.intro) return
    const fill =
      s.phase === 'done' || (s.phase === 'step' && i < s.step) ? 1 : s.phase === 'step' && i === s.step ? p : 0
    const last = out[out.length - 1]
    if (last && st.round != null && last.round === st.round) {
      last.filled += fill * st.ms
      last.weight += st.ms
      last.last = i
    } else
      out.push({
        round: st.round,
        weight: st.ms,
        filled: fill * st.ms,
        first: i,
        last: i,
        label: st.round == null ? st.barLabel || st.label : null
      })
  })
  return out.map(({ filled, ...seg }) => ({ ...seg, fill: filled / seg.weight }))
}

/** Large layout while an exercise is underway. */
export function isLargePhase(phase) {
  return phase === 'prep' || phase === 'step'
}
