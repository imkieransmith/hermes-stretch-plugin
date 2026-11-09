// Pure logic: no SDK, no timers.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BOX_BREATHING } from './fixtures/box-breathing.mjs'
import { EXERCISES, SPECS } from '../src/exercises/index.js'
import { expand } from '../src/exercises/expand.js'
import { NECK_TILT } from './fixtures/neck-tilt.mjs'
import { anyBusy, inCooldown, shouldOffer, shouldShowCard } from '../src/policy.js'
import { STALLED_MS, isStalled, routineMs } from '../src/routine.js'
import { advanceRoutine, countParts, countText, currentFigure, currentPose, currentRound, displayCount, displaySeconds, idleRoutine, isLargePhase, isRoutineActive, isTimed, pauseRoutine, phaseProgress, remainingMs, resumeRoutine, routineSeconds, routineSegments, skipRoutine, startRoutine, tickRoutine } from '../src/routine.js'
import { buildSession, partIndex, sessionOf } from '../src/session.js'
import { ACTIVE_GAP_MS, lastMovedAt, movedTitle, sinceText, spellEnded, spellStarted } from '../src/active.js'
import { MAX_STANDING, SESSION_IDS, SESSION_LENGTHS, approxText, estimateMs, isBody, lengthText, menuPlan, pickBody, pickBreather, planMenu } from '../src/plan-session.js'
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings.js'
import { LAST_TICKS, soundPlan } from '../src/sound/plan.js'
import { createSound } from '../src/sound/player.js'
import { SOUND_CUES, SOUND_PEAK, renderCue } from '../src/sound/synth.js'
import {
  TENSION_MAX_CHARS,
  TENSION_SWEAR_ALONE,
  TENSION_WINDOW_MS,
  ownWords,
  tensionScore,
  tensionSignals,
  tensionTotal,
  tensionUptick
} from '../src/tension.js'
import { NEXT_MS, PREP_MS, REST_MS } from '../src/timing.js'
import { DITHER_DENSITY, DITHER_PERIOD_PX, DITHER_RAMP_PX, DITHER_TILE_PX, ditherDensity, ditherMask, rampMask, tileMask } from '../src/ui/dither.js'
import { tileSize } from '../src/ui/tile.jsx'
import { DONE_FIGURE, OFFER_FIGURE, figureArt, figureKey } from '../src/figures.js'
import { readdirSync, existsSync } from 'node:fs'

// ── busy + card + offer policy ─────────────────────────────────────────────

test('anyBusy', () => {
  assert.equal(anyBusy({ a: false, b: true }), true)
  assert.equal(anyBusy({ a: false }), false)
  assert.equal(anyBusy(undefined), false)
})

test('shouldShowCard', () => {
  assert.equal(shouldShowCard({}), false)
  assert.equal(shouldShowCard({ offered: true }), true)
  assert.equal(shouldShowCard({ opened: true }), true)
  assert.equal(shouldShowCard({ routineActive: true }), true)
})

test('normalizeSettings: defaults, valid overrides, junk dropped', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings('nope'), DEFAULT_SETTINGS)
  const s = normalizeSettings({ autoStart: true, cooldownMin: 0, offerDelaySec: 30, offersEnabled: 'yes', extra: 1 })
  assert.deepEqual(s, { ...DEFAULT_SETTINGS, cooldownMin: 0, offerDelaySec: 30 }, 'the old autoStart is dropped')
  assert.equal('autoStart' in DEFAULT_SETTINGS, false, 'nothing ever starts by itself')
  assert.equal(normalizeSettings({ offerDelaySec: -5 }).offerDelaySec, DEFAULT_SETTINGS.offerDelaySec)
  assert.equal(normalizeSettings({ cooldownMin: NaN }).cooldownMin, DEFAULT_SETTINGS.cooldownMin)
})

test('inCooldown', () => {
  assert.equal(inCooldown(null, 20, 0), false)
  assert.equal(inCooldown(0, 20, 20 * 60_000 - 1), true)
  assert.equal(inCooldown(0, 20, 20 * 60_000), false)
  assert.equal(inCooldown(0, 0, 1), false, '0 = no cooldown')
})

test('shouldOffer: needs a tool, the delay, offers on, idle routine, no cooldown', () => {
  const base = {
    spell: { startedAt: 0, toolSeen: true, offered: false },
    settings: DEFAULT_SETTINGS,
    lastBreakAt: null,
    routinePhase: 'idle',
    now: 10_000
  }
  assert.equal(shouldOffer(base), true)
  assert.equal(shouldOffer({ ...base, spell: null }), false)
  assert.equal(shouldOffer({ ...base, now: 9_999 }), false, 'before the delay')
  assert.equal(shouldOffer({ ...base, spell: { ...base.spell, toolSeen: false } }), false, 'no tool yet')
  assert.equal(shouldOffer({ ...base, spell: { ...base.spell, offered: true } }), false, 'once per spell')
  assert.equal(shouldOffer({ ...base, settings: { ...DEFAULT_SETTINGS, offersEnabled: false } }), false)
  assert.equal(shouldOffer({ ...base, routinePhase: 'hold' }), false, 'already stretching')
  assert.equal(shouldOffer({ ...base, lastBreakAt: 5_000 }), false, 'cooldown')
  assert.equal(shouldOffer({ ...base, lastBreakAt: 5_000, settings: { ...DEFAULT_SETTINGS, cooldownMin: 0 } }), true)
})

// ── routine ─────────────────────────────────────────────────────────────────

/** The engine runs sessions: a single exercise is a one-part session. */
const NT = buildSession([NECK_TILT])
const BB = buildSession([BOX_BREATHING])
const EXERCISE = NT
const HOLD = EXERCISE.steps[0].ms
const phases = s => `${s.phase}:${s.step}`

test('routine: neck tilt runs prep → left hold → rest → right hold → done', () => {
  let s = startRoutine(EXERCISE.plan, 0)
  assert.equal(phases(s), 'prep:0')
  assert.deepEqual(s.plan, ['neck-side-tilt'])
  assert.deepEqual(EXERCISE.steps.map(st => st.ms), [20_000, REST_MS, 20_000], 'timings unchanged from b11')
  s = tickRoutine(s, EXERCISE, PREP_MS - 1)
  assert.equal(phases(s), 'prep:0', 'not yet')
  s = tickRoutine(s, EXERCISE, PREP_MS)
  assert.equal(phases(s), 'step:0')
  assert.equal(s.endsAt, PREP_MS + HOLD, 'chained from the previous end, not from tick time')
  s = tickRoutine(s, EXERCISE, PREP_MS + HOLD + 1)
  assert.equal(phases(s), 'step:1')
  s = tickRoutine(s, EXERCISE, PREP_MS + HOLD + REST_MS)
  assert.equal(phases(s), 'step:2')
  s = tickRoutine(s, EXERCISE, PREP_MS + 2 * HOLD + REST_MS)
  assert.equal(phases(s), 'done:2')
  assert.deepEqual(s.plan, ['neck-side-tilt'], 'done remembers the plan')
  assert.equal(isRoutineActive(s), false)
  assert.equal(tickRoutine(s, EXERCISE, 1e12), s, 'done is terminal')
})

test('routine: an offer (idle) never starts by itself', () => {
  const s = idleRoutine(EXERCISE.plan)
  assert.equal(isTimed(s), false)
  assert.equal(isRoutineActive(s), false)
  assert.equal(tickRoutine(s, EXERCISE, 1e12), s, 'however long it waits')
  assert.equal(skipRoutine(s, EXERCISE, 1), s)
})

test('routine: a big gap (sleep, missed ticks) catches up in one tick', () => {
  const s = tickRoutine(startRoutine(EXERCISE.plan, 0), EXERCISE, 10 * 60_000)
  assert.equal(s.phase, 'done')
})

test('routine: stalled = a running phase left long past its end (the computer slept); never while paused or idle', () => {
  const st = startRoutine(NT.plan, 0)
  assert.equal(isStalled(st, PREP_MS + 200), false, 'the driver is only a tick behind')
  assert.equal(isStalled(st, PREP_MS + STALLED_MS), false)
  assert.equal(isStalled(st, PREP_MS + STALLED_MS + 1), true)
  assert.equal(isStalled(pauseRoutine(st, 1_000), 60 * 60_000), false, 'paused: time is frozen')
  assert.equal(isStalled(idleRoutine(), 60 * 60_000), false)
  const done = tickRoutine(st, NT, routineMs(NT))
  assert.equal(done.phase, 'done')
  assert.equal(isStalled(done, 60 * 60_000), false)
})

test('routine: tick returns the same object when nothing changes', () => {
  const s = startRoutine(EXERCISE.plan, 0)
  assert.equal(tickRoutine(s, EXERCISE, 1), s)
  assert.equal(tickRoutine(idleRoutine(), EXERCISE, 1e9).phase, 'idle')
})

test('routine: pause freezes time, resume shifts the deadline', () => {
  let s = tickRoutine(startRoutine(EXERCISE.plan, 0), EXERCISE, PREP_MS) // step:0, ends PREP+HOLD
  s = pauseRoutine(s, PREP_MS + 5_000)
  assert.equal(remainingMs(s, PREP_MS + 5_000), HOLD - 5_000)
  assert.equal(remainingMs(s, PREP_MS + 60_000), HOLD - 5_000, 'frozen while paused')
  assert.equal(tickRoutine(s, EXERCISE, 1e9), s, 'no progress while paused')
  assert.equal(pauseRoutine(s, 0), s, 'pausing twice is a no-op')
  s = resumeRoutine(s, PREP_MS + 65_000) // paused for 60s
  assert.equal(s.pausedAt, null)
  assert.equal(remainingMs(s, PREP_MS + 65_000), HOLD - 5_000)
  assert.ok(Math.abs(phaseProgress(s, EXERCISE, PREP_MS + 65_000) - 5_000 / HOLD) < 1e-9)
})

test('routine: skip advances one phase from now, and clears a pause', () => {
  let s = startRoutine(EXERCISE.plan, 0)
  s = skipRoutine(s, EXERCISE, 1_000)
  assert.equal(phases(s), 'step:0')
  assert.equal(s.endsAt, 1_000 + HOLD)
  s = skipRoutine(pauseRoutine(s, 2_000), EXERCISE, 3_000)
  assert.equal(phases(s), 'step:1')
  assert.equal(s.pausedAt, null)
  s = skipRoutine(skipRoutine(s, EXERCISE, 4_000), EXERCISE, 5_000)
  assert.equal(s.phase, 'done')
  assert.equal(skipRoutine(s, EXERCISE, 6_000), s)
  assert.equal(advanceRoutine(idleRoutine(), EXERCISE, 0).phase, 'idle')
})

test('layout: large while stretching, compact otherwise', () => {
  for (const p of ['prep', 'step']) assert.equal(isLargePhase(p), true, p)
  for (const p of ['idle', 'done']) assert.equal(isLargePhase(p), false, p)
})

test('routine bar: a segment per hold, a rest between, filled in order', () => {
  const fills = s => routineSegments(s, EXERCISE, at).map(x => Math.round(x.fill * 100) / 100)
  let at = 0
  let s = startRoutine(EXERCISE.plan, 0)
  assert.deepEqual(routineSegments(s, EXERCISE, 0).map(x => x.round), [0, null, 1])
  assert.deepEqual(fills(s), [0, 0, 0], 'getting ready: empty')
  at = PREP_MS + HOLD / 2
  s = tickRoutine(s, EXERCISE, at)
  assert.deepEqual(fills(s), [0.5, 0, 0], 'halfway through the left hold')
  at = PREP_MS + HOLD + REST_MS / 2
  s = tickRoutine(s, EXERCISE, at)
  assert.deepEqual(fills(s), [1, 0.5, 0], 'halfway through the rest')
  at = PREP_MS + HOLD + REST_MS + HOLD / 4
  s = tickRoutine(s, EXERCISE, at)
  assert.deepEqual(fills(s), [1, 1, 0.25], 'a quarter into the right hold')
  at = PREP_MS + 2 * HOLD + REST_MS
  s = tickRoutine(s, EXERCISE, at)
  assert.equal(s.phase, 'done')
  assert.deepEqual(fills(s), [1, 1, 1])
})

test('figure: shows what you should be doing now', () => {
  const pose = at => currentPose(tickRoutine(startRoutine(EXERCISE.plan, 0), EXERCISE, at), EXERCISE)
  assert.equal(pose(0), 'centre', 'getting ready: upright')
  assert.equal(pose(PREP_MS + 1), 'left')
  assert.equal(pose(PREP_MS + HOLD + 1), 'centre', 'between sides: upright')
  assert.equal(pose(PREP_MS + HOLD + REST_MS + 1), 'right')
})

test('round: the one you are in, or heading into during a rest / get ready', () => {
  const round = at => currentRound(tickRoutine(startRoutine(EXERCISE.plan, 0), EXERCISE, at), EXERCISE)
  assert.equal(round(0), 0)
  assert.equal(round(PREP_MS + 1), 0)
  assert.equal(round(PREP_MS + HOLD + 1), 1, 'rest: heading into the right side')
  assert.equal(NECK_TILT.roundText(1), 'Rep 2 of 2 · Right side')
  assert.equal(routineSeconds(EXERCISE), 50, '5 get ready + 20 + 5 switch + 20')
})

test('box breathing: 4 rounds of in / hold / out / hold, 4 s each', () => {
  const ex = BB
  assert.equal(ex.steps.length, 16)
  assert.ok(ex.steps.every(st => st.ms === 4_000))
  assert.deepEqual(ex.steps.slice(0, 4).map(st => st.label), ['breathe in', 'hold', 'breathe out', 'hold'])
  let s = startRoutine(ex.plan, 0)
  assert.equal(currentPose(s, ex), 'ready')
  s = tickRoutine(s, ex, PREP_MS + 4_000 * 5 + 1) // round 2, second step
  assert.equal(phases(s), 'step:5')
  assert.equal(currentPose(s, ex), 'hold')
  assert.equal(currentRound(s, ex), 1)
  assert.equal(BOX_BREATHING.roundText(1), 'Round 2 of 4')
  assert.equal(Math.ceil(remainingMs(s, PREP_MS + 4_000 * 5 + 1) / 1000), 4, 'counts each step down 4, 3, 2, 1')
  assert.equal(phases(skipRoutine(s, ex, 30_000)), 'step:8', 'skip jumps the rest of the breath, to the next round')
  assert.equal(skipRoutine(tickRoutine(s, ex, PREP_MS + 4_000 * 12 + 1), ex, 70_000).phase, 'done', 'skipping the last breath finishes')
  const segs = routineSegments(s, ex, PREP_MS + 4_000 * 5 + 1)
  assert.deepEqual(segs.map(x => x.round), [0, 1, 2, 3], 'one bar segment per round')
  assert.equal(segs[0].fill, 1)
  assert.ok(segs[1].fill > 0.25 && segs[1].fill < 0.26)
  s = tickRoutine(s, ex, 1e9)
  assert.equal(s.phase, 'done')
  assert.equal(sessionOf(s), sessionOf(s), 'the same session object every time')
  assert.deepEqual(sessionOf({ plan: ['nope', BOX_BREATHING.id] }).plan, [BOX_BREATHING.id], 'unknown ids dropped')
})

test('copy: every exercise has a get-ready line, a safety line and a cue for every step', () => {
  for (const ex of Object.values(EXERCISES)) {
    assert.ok(ex.setup && ex.setup.length > 0, `${ex.id}: setup`)
    assert.ok(ex.safety && ex.safety.length > 0, `${ex.id}: safety`)
    ex.steps.forEach((st, i) => assert.ok(st.cue && st.cue.length > 0, `${ex.id}: step ${i} cue`))
  }
})

test('library: every spec expands; ids unique; fields valid; words fit the card', () => {
  assert.equal(Object.keys(EXERCISES).length, SPECS.length, 'no two specs share a name')
  const allowed = {
    type: ['stretch', 'mobility', 'eyes', 'breathing'],
    area: ['neck', 'shoulders', 'spine', 'wrists', 'legs', 'eyes', 'breathing'],
    position: ['seated', 'standing']
  }
  for (const ex of Object.values(EXERCISES)) {
    for (const [k, list] of Object.entries(allowed)) assert.ok(list.includes(ex[k]), `${ex.id}: ${k} ${ex[k]}`)
    assert.ok(ex.name.length <= 22, `${ex.id}: name ≤ 22`)
    assert.ok(ex.safety.length <= 110, `${ex.id}: safety ≤ 110`)
    assert.ok(ex.sources.length > 0, `${ex.id}: sources`)
    assert.ok(ex.prepPose, `${ex.id}: start pose`)
    for (const line of [ex.setup, ...ex.steps.map(st => st.cue)]) assert.ok(line.length <= 72, `${ex.id}: one line: ${line}`) // ~460px at 14px: fits the 518px column
    for (const st of ex.steps) {
      assert.ok(st.pose && st.label && st.label.length <= 14, `${ex.id}: pose and a short caption`)
      assert.ok(st.ms >= 1000 && st.ms < 100_000, `${ex.id}: whole seconds, two digits at most`)
      assert.ok(st.round == null || st.round < ex.rounds.length, `${ex.id}: round in range`)
    }
    const total = ex.steps.reduce((n, st) => n + st.ms, 0)
    assert.ok(total >= 30_000 && total <= 90_000, `${ex.id}: ${total / 1000} s`)
  }
})

test('expand: a hold per side with the switch between', () => {
  const ex = EXERCISES['neck-side-tilt']
  assert.deepEqual(ex.rounds, ['Left', 'Right'])
  assert.deepEqual(ex.steps.map(st => [st.round, st.label, st.pose]), [
    [0, 'seconds left', 'left'],
    [null, 'switch sides', 'centre'],
    [1, 'seconds left', 'right']
  ])
  assert.equal(ex.steps[1].ms, REST_MS)
  assert.equal(ex.steps[1].between, true)
  assert.equal(ex.count, undefined, 'counts down')
})

test('expand: reps in phases: one strip per rep, the rep number on every phase', () => {
  const ex = EXERCISES['chin-tucks'] // 6 reps of tuck 5 s + let go 3 s
  assert.equal(ex.count, 'reps')
  assert.equal(ex.rounds.length, 6)
  assert.equal(ex.steps.length, 12)
  assert.deepEqual(ex.steps.slice(0, 3).map(st => [st.rep, st.round, st.ms, st.pose, st.label]), [
    [1, 0, 5_000, 'tuck', 'of 6'],
    [1, 0, 3_000, 'centre', 'of 6'],
    [2, 1, 5_000, 'tuck', 'of 6']
  ])
  const rolls = EXERCISES['shoulder-rolls'] // one phase: sec_per_rep
  assert.deepEqual(rolls.steps.map(st => st.rep), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.throws(() => expand({ name: 'X', pattern: 'reps', sides: 'left_right', reps: 2, secPerRep: 2 }), /per-side/)
  assert.throws(() => expand({ name: 'X', pattern: 'nope' }), /unknown pattern/)
})

test('expand: breathing cycles count up; plain steps share strips and keep rests apart', () => {
  const sigh = EXERCISES['cyclic-sigh']
  assert.equal(sigh.count, 'up')
  assert.equal(sigh.rounds.length, 6)
  assert.deepEqual(sigh.steps.slice(0, 3).map(st => [st.round, st.label, st.ms]), [
    [0, 'breathe in', 3_000],
    [0, 'top up', 1_000],
    [0, 'breathe out', 6_000]
  ])
  const circles = EXERCISES['ankle-circles']
  assert.deepEqual(circles.rounds, ['Left', 'Right'], 'sided: the strips are labelled')
  assert.deepEqual(circles.steps.map(st => st.round), [0, 0, null, 1, 1])
  assert.equal(circles.steps[2].barLabel, 'switch')
  const chin = EXERCISES['chin-to-chest']
  assert.deepEqual(chin.rounds, [null, null], 'not sided: no labels')
  assert.deepEqual(chin.steps.map(st => [st.round, !!st.between]), [[0, false], [null, true], [1, false]])
  const palming = EXERCISES.palming
  assert.deepEqual(palming.steps.map(st => st.round), [0, 1], 'no rests: two strips')
})

// ── tension detection ───────────────────────────────────────────────────────

test('tension: frustrated messages score', () => {
  for (const msg of [
    'the fuck are you doing',
    'wtf why did it delete the tests',
    'ffs',
    'what are you doing??',
    'I told you not to touch that file',
    'for the third time, use pnpm',
    'it still doesn’t work',
    "it still doesn't work",
    'WHY DID YOU DELETE THE CONFIG',
    'no!!!',
    'are you serious',
    'this is bullshit'
  ]) {
    assert.ok(tensionScore(msg) > 0, msg)
  }
})

test('tension: weights: aimed at the agent counts fully, a swear on its own barely', () => {
  for (const [msg, score] of [
    ['ffs', TENSION_SWEAR_ALONE],
    ['wtf why did it delete the tests', TENSION_SWEAR_ALONE],
    ['no!!!', 0.5],
    ['I told you not to touch that file', 1],
    ['this is bullshit', 1.5], // aimed at it: phrase + swear
    ['WHY DID YOU DELETE THE CONFIG', 1.5], // phrase + shouting
    ['wtf, I told you already', 1.5], // a swear beside a phrase counts half
    ['what are you doing?!', 1.5]
  ])
    assert.equal(tensionScore(msg), score, msg)
})

test('tension: phrases aimed at the agent, and their neutral lookalikes', () => {
  for (const msg of [
    'that’s not what I asked',
    'how many times do I have to say it',
    'you keep breaking the build',
    'stop it!',
    'stop doing that',
    'you broke it again',
    'you’ve made it worse',
    'this is a joke',
    'I didn’t ask for comments',
    'i said don’t touch it',
    'did you even read the file',
    'it still isn’t working',
    'not again',
    'why are you still changing that file',
    'I give up'
  ])
    assert.equal(tensionSignals(msg).phrase, true, msg)
  for (const msg of [
    'stop the dev server',
    'stop it from crashing when the list is empty',
    'you keep the config in one place, right?',
    'did you do the migration?',
    'are you doing the refactor next?',
    'this doesn’t work on Safari',
    'how many times should it retry?',
    'I said yes to the second option',
    'not working on Windows is fine for now',
    'fix the wrong import again please',
    'the debugger shows a parse error'
  ])
    assert.equal(tensionScore(msg), 0, msg)
})

test('tension: a casual swearer does not trigger it; clear frustration does', () => {
  const now = 100 * 60_000
  const log = msgs => msgs.map((m, i) => ({ at: now - (msgs.length - i) * 60_000, score: tensionScore(m) }))
  const casual = ['this shit compiles now, nice', 'damn it, forgot the import, add it', 'crap, also the tests', 'ok ffs one more']
  assert.equal(tensionUptick(log(casual), now), false, '4 casual swears in 4 minutes')
  const sweary = ['holy shit that was fast', 'ugh, typo', 'bollocks, wrong branch', 'fuck yeah, ship it', 'wtf that actually worked']
  assert.equal(tensionUptick(log([...casual, ...sweary]), now), false, 'a swear in every message, 9 minutes running')
  assert.equal(tensionUptick(log(['fuck this', 'piece of shit']), now), true, 'swearing AT it is not casual')
  assert.equal(tensionUptick(log(['wtf, I told you already', 'what are you doing?!']), now), true, 'two clear ones')
  assert.equal(tensionUptick(log(['I told you to use pnpm', 'are you serious']), now), false, 'two phrases: not yet')
  assert.equal(tensionUptick(log(['I told you to use pnpm', 'are you serious', 'it still doesn’t work']), now), true, 'three')
})

test('tension: calm messages, pasted code and logs do not', () => {
  for (const msg of [
    'can you add a test for the parser?',
    'kill the process on port 3000',
    'add shiitake and shitake to the recipe list',
    'update the README API URL section',
    'fix it please',
    'stop the dev server',
    'remove the useless imports',
    'here is the error:\n```\nError: what the hell happened\n  at fuck (x.js:1)\n```',
    'the log says `wtf: fatal`',
    '> what are you doing\nthat was the old message, ignore it',
    'look at /Users/me/shit/notes.txt',
    'see https://example.com/fuck-it',
    'traceback:\n    raise WTFError("ffs")',
    'Thanks! That worked.'
  ]) {
    assert.equal(tensionScore(msg), 0, msg)
  }
})

test('tension: fast on anything pasted (it runs while a message is sent); a long message is checked at both ends', () => {
  const n = 200_000
  for (const [what, text] of [
    ['hex', 'a1b2c3d4'.repeat(n / 8)],
    ['minified json', '{"a":1,"b":[1,2,3],"c":"x"}'.repeat(n / 25)],
    ['dotted names', 'abc.def-'.repeat(n / 8)],
    ['blank lines', '\n'.repeat(n)],
    ['spaces', ' '.repeat(n)],
    ['backticks', '`'.repeat(n)],
    ['one letter', 'f'.repeat(n)],
    ['punctuation', '?!'.repeat(n / 2)],
    ['slashes', 'a/'.repeat(n / 2)]
  ]) {
    const started = performance.now()
    tensionScore(text)
    const took = performance.now() - started
    // A few ms in practice; these took 24–40 s before every pattern was made linear.
    assert.ok(took < 500, `${what}: ${took.toFixed(0)} ms`)
  }
  const long = 'word '.repeat(TENSION_MAX_CHARS)
  assert.equal(tensionScore(`what are you doing?! ${long}`), 1.5, 'the start of a long message')
  assert.equal(tensionScore(`${long} what are you doing?!`), 1.5, 'and its end')
  assert.equal(tensionScore('here:\n```\n' + 'fuck '.repeat(20_000) + '\n```\nthanks'), 0, 'a long fenced paste is still dropped whole')
})

test('tension: a message counts once however many signals it has', () => {
  const sig = tensionSignals('WHAT THE FUCK ARE YOU DOING!!!')
  assert.deepEqual(sig, { swear: true, phrase: true, shouting: true, punctuation: true })
  assert.equal(tensionScore('WHAT THE FUCK ARE YOU DOING!!!'), 1.5)
  assert.equal(tensionScore(''), 0)
  assert.equal(tensionScore(undefined), 0)
  assert.match(ownWords('see `rm -rf` and src/app.ts'), /^see\s+and\s+$/)
})

test('tension: an uptick is a score of 3 within 10 minutes', () => {
  const now = 100 * 60_000
  assert.equal(tensionUptick([{ at: now, score: 1.5 }], now), false, 'one-offs are ignored')
  assert.equal(tensionUptick([{ at: now - 60_000, score: 1.5 }, { at: now, score: 1.5 }], now), true)
  const old = { at: now - TENSION_WINDOW_MS, score: 1.5 }
  assert.equal(tensionUptick([old, { at: now, score: 1.5 }], now), false, 'outside the window')
  assert.equal(tensionTotal([old, { at: now - 1, score: 1.5 }], now), 1.5)
})

test('offers: a finished exercise still on screen does not block the next offer', () => {
  const base = {
    spell: { startedAt: 0, toolSeen: true, offered: false },
    settings: DEFAULT_SETTINGS,
    lastBreakAt: null,
    now: 60_000
  }
  assert.equal(shouldOffer({ ...base, routinePhase: 'done' }), true)
  assert.equal(shouldOffer({ ...base, routinePhase: 'step' }), false)
  assert.equal(shouldOffer({ ...base, routinePhase: 'prep' }), false)
})

test('countdown: shows N … 1 and never 0', () => {
  const ex = BB
  const s = tickRoutine(startRoutine(ex.plan, 0), ex, PREP_MS) // first 4 s step
  const shown = [0, 999, 1_000, 2_500, 3_000, 3_999, 4_000].map(t => displaySeconds(s, PREP_MS + t))
  assert.deepEqual(shown, [4, 4, 3, 2, 1, 1, 1], 'clamped at 1 even past the end')
  const next = tickRoutine(s, ex, PREP_MS + 4_000)
  assert.equal(next.step, 1)
  assert.equal(displaySeconds(next, PREP_MS + 4_000), 4, 'the next step starts at 4')
})

test('count: breathing counts up 1 … 4; stretches and get-ready count down', () => {
  const ex = BB
  const prep = startRoutine(ex.plan, 0)
  assert.deepEqual([0, 1_000, 4_999].map(t => displayCount(prep, ex, t)), [5, 4, 1], 'get ready counts down')
  const s = tickRoutine(prep, ex, PREP_MS)
  const shown = [0, 999, 1_000, 2_000, 3_000, 3_999, 4_000].map(t => displayCount(s, ex, PREP_MS + t))
  assert.deepEqual(shown, [1, 1, 2, 3, 4, 4, 4], 'never 0, never 5')
  const paused = pauseRoutine(s, PREP_MS + 2_500)
  assert.equal(displayCount(paused, ex, PREP_MS + 60_000), 3, 'holds while paused')

  const hold = tickRoutine(startRoutine(NT.plan, 0), NT, PREP_MS)
  assert.equal(displayCount(hold, NT, PREP_MS), 20, 'stretch hold counts down')
  assert.equal(displayCount(hold, NT, PREP_MS + 19_500), 1)
})

// ── sound ───────────────────────────────────────────────────────────────────

test('sound cues render clean: finite, at their level, end on silence, same every time', () => {
  for (const rate of [44_100, 48_000]) {
    for (const [name, recipe] of Object.entries(SOUND_CUES)) {
      const x = renderCue(recipe, rate)
      let peak = 0
      for (const v of x) {
        assert.ok(Number.isFinite(v), name)
        peak = Math.max(peak, Math.abs(v))
      }
      const want = SOUND_PEAK * 10 ** ((recipe.level ?? 0) / 20)
      assert.ok(Math.abs(peak - want) < 1e-6, `${name} peaks at its level`)
      assert.ok(x[x.length - 1] === 0, `${name} ends on silence`)
      assert.ok(x.length / rate < 2, `${name} is short`)
    }
  }
  assert.deepEqual(renderCue(SOUND_CUES.tick, 48_000), renderCue(SOUND_CUES.tick, 48_000))
})

test('soundPlan: breathing: ready 3-2-1, then go on each 1 and tick on 2, 3, 4; ends on a chime', () => {
  const ex = BB
  const plan = soundPlan(startRoutine(ex.plan, 0), ex)
  assert.deepEqual(
    plan.slice(0, 8).map(b => b.cue),
    ['ready', 'ready', 'ready', 'go', 'tick', 'tick', 'tick', 'go']
  )
  const beats = plan.filter(b => b.cue !== 'chime').map(b => b.at)
  assert.equal(beats.length, LAST_TICKS + 16 * 4)
  const gaps = new Set(beats.slice(1).map((t, i) => t - beats[i]))
  assert.deepEqual([...gaps], [1_000], 'one even beat throughout')
  const total = PREP_MS + ex.steps.reduce((n, st) => n + st.ms, 0)
  assert.deepEqual(plan[plan.length - 1], { at: total, cue: 'chime' })
})

test('soundPlan: stretch: ready on get ready and switch sides, go as each side starts, ticks to finish it', () => {
  const ex = NT
  const plan = soundPlan(startRoutine(ex.plan, 0), ex)
  const [hold, rest] = [ex.steps[0].ms, ex.steps[1].ms]
  const last3 = (end, cue) => [3, 2, 1].map(k => ({ at: end - k * 1_000, cue }))
  const left = PREP_MS
  const right = PREP_MS + hold + rest
  assert.deepEqual(plan, [
    ...last3(PREP_MS, 'ready'),
    { at: left, cue: 'go' },
    ...last3(left + hold, 'tick'),
    ...last3(right, 'ready'),
    { at: right, cue: 'go' },
    ...last3(right + hold, 'tick'),
    { at: right + hold, cue: 'chime' }
  ])
})

test('soundPlan: mid-step starts from that step; nothing paused, offered or idle', () => {
  const ex = BB
  const s = tickRoutine(startRoutine(ex.plan, 0), ex, PREP_MS + 5_000) // step 1 (hold), started at 7 s
  assert.equal(s.step, 1)
  assert.equal(soundPlan(s, ex)[0].at, PREP_MS + 4_000)
  assert.deepEqual(soundPlan(pauseRoutine(s, PREP_MS + 5_000), ex), [])
  assert.deepEqual(soundPlan(idleRoutine(ex.plan), ex), [])
})

/** A tiny stand-in for Web Audio: records start/stop on the audio clock. */
function fakeAudio() {
  const log = []
  class Param {
    setTargetAtTime() {}
  }
  class Node {
    connect(n) {
      return n
    }
    disconnect() {}
  }
  class FakeContext {
    constructor() {
      this.state = 'running'
      this.currentTime = 100
      this.sampleRate = 8_000
      this.destination = new Node()
    }
    createGain() {
      return Object.assign(new Node(), { gain: new Param() })
    }
    createBuffer(_c, length) {
      return { length, copyToChannel() {} }
    }
    createBufferSource() {
      const src = Object.assign(new Node(), {
        start: t => log.push(['start', t]),
        stop: () => {
          src.stopped = true
          log.push(['stop'])
        }
      })
      return src
    }
    resume() {
      return Promise.resolve()
    }
    close() {
      return Promise.resolve()
    }
  }
  return { Ctor: FakeContext, log }
}

test('createSound: schedules ahead on the audio clock; a step moving on keeps the schedule', () => {
  const { Ctor, log } = fakeAudio()
  let t = 0
  const sound = createSound({ Ctor, now: () => t })
  const ex = BB
  let s = startRoutine(ex.plan, 0)
  sound.sync(soundPlan(s, ex))
  const first = sound.scheduled()
  assert.equal(first.length, LAST_TICKS + 64 + 1)
  assert.deepEqual(log.slice(0, 2), [['start', 102], ['start', 103]], 'beat at t+2 s → audio clock +2 s (get ready ticks its last 3)')

  t = PREP_MS + 50 // the driver notices the get-ready ended
  s = tickRoutine(s, ex, t)
  const before = log.length
  sound.sync(soundPlan(s, ex))
  assert.equal(log.length, before, 'nothing cancelled or re-added')

  s = pauseRoutine(s, t)
  sound.sync(soundPlan(s, ex))
  assert.ok(log.some(([k]) => k === 'stop'), 'pause cancels what has not started')
  assert.ok(sound.scheduled().every(k => Number(k.split('@')[1]) <= t), 'only started beats remain')

  t += 10_000
  s = resumeRoutine(s, t)
  sound.sync(soundPlan(s, ex))
  assert.ok(sound.scheduled().some(k => Number(k.split('@')[1]) > t), 'resume schedules the rest')

  sound.silence()
  assert.deepEqual(sound.scheduled(), [], 'mute drops everything')
  sound.close()
})

test('createSound: late beats are dropped, not bunched; inert without Web Audio', () => {
  const { Ctor, log } = fakeAudio()
  const sound = createSound({ Ctor, now: () => 10_000 })
  sound.sync([{ at: 1_000, cue: 'tick' }, { at: 9_980, cue: 'tick' }, { at: 11_000, cue: 'chime' }])
  assert.deepEqual(sound.scheduled(), ['tick@9980', 'chime@11000'])
  assert.deepEqual(log[0], ['start', 100], 'a few ms late plays now')
  const none = createSound({ Ctor: undefined })
  none.sync([{ at: 0, cue: 'tick' }])
  none.wake()
  assert.deepEqual(none.scheduled(), [])
})

test('countText: pads to the exercise width, so the number never changes width', () => {
  const st = startRoutine(NT.plan, 0)
  assert.equal(countText(st, NT, 0), '05', 'get ready matches the 20 s holds')
  assert.deepEqual(countParts(st, NT, 0), { pad: '0', digits: '5' })
  const hold = tickRoutine(st, NT, PREP_MS)
  assert.equal(countText(hold, NT, PREP_MS), '20')
  assert.equal(countText(hold, NT, PREP_MS + 11_500), '09')
  assert.equal(countText(hold, NT, PREP_MS + 19_900), '01')
  const rest = tickRoutine(hold, NT, PREP_MS + 20_000)
  assert.equal(countText(rest, NT, PREP_MS + 20_000), '05', 'switch sides')
  assert.equal(countText(startRoutine(BB.plan, 0), BB, 0), '5', 'breathing never needs two digits')
  const breath = tickRoutine(startRoutine(BB.plan, 0), BB, PREP_MS)
  assert.equal(countText(breath, BB, PREP_MS + 2_500), '3')
})

test('tileSize: an offer’s text height, within bounds', () => {
  assert.equal(tileSize(null, 152), 152, 'before measuring')
  assert.equal(tileSize(100, 152), 152, 'never smaller than the offer’s')
  assert.equal(tileSize(214, 152), 214, 'fills the card height')
  assert.equal(tileSize(900, 152), 280, 'capped')
})


test('dither: anchored left; thickens with distance, flat after the ramp; tiles seamlessly', () => {
  const avg = x0 => {
    let sum = 0
    for (let y = 0; y < DITHER_PERIOD_PX; y++) for (let x = x0; x < x0 + 20; x++) sum += ditherDensity(x, y)
    return sum / (DITHER_PERIOD_PX * 20)
  }
  assert.ok(avg(0) < 0.01, 'nothing at the start')
  assert.ok(avg(DITHER_RAMP_PX / 4) < avg(DITHER_RAMP_PX / 2), 'thicker further right')
  assert.ok(avg(DITHER_RAMP_PX / 2) < avg(DITHER_RAMP_PX - 20))
  for (const y of [0, 37, 121, 200]) {
    const flat = ditherDensity(DITHER_RAMP_PX, y)
    assert.ok(flat >= DITHER_DENSITY && flat <= 1)
    assert.ok(Math.abs(ditherDensity(DITHER_RAMP_PX - 0.01, y) - flat) < 0.01, 'ramp meets the flat part')
    assert.equal(ditherDensity(DITHER_RAMP_PX + 5_000, y), flat, 'flat however wide')
    for (const x of [50, 300, 700]) {
      assert.ok(Math.abs(ditherDensity(x, y) - ditherDensity(x, y + DITHER_PERIOD_PX)) < 1e-9, 'repeats every period')
    }
  }
  const tile = tileMask(2)
  assert.deepEqual([tile.w, tile.h], [DITHER_TILE_PX * 2, DITHER_PERIOD_PX * 2])
  assert.deepEqual(ditherMask(DITHER_RAMP_PX + DITHER_TILE_PX * 3, DITHER_TILE_PX, 2).alpha, tile.alpha, 'the tile repeats seamlessly')
  const ramp = rampMask(1)
  assert.ok(ramp.alpha.every(a => a === 0 || a === 255))
  assert.deepEqual(rampMask(1).alpha, ramp.alpha, 'deterministic')
  const inked = x => ramp.alpha.filter((a, i) => i % ramp.w === x && a).length
  assert.equal(inked(0), 0)
  assert.ok(inked(ramp.w - 1) > 0)
})

// ── sessions ────────────────────────────────────────────────────────────────

/** Neck tilt, then box breathing: a stretch and a wellness closer. */
const MIX = buildSession([NECK_TILT, BOX_BREATHING])
const TILT_MS = NECK_TILT.steps.reduce((n, st) => n + st.ms, 0)

test('session: steps in order, a "next up" get-ready between exercises, each with its own count style', () => {
  assert.equal(MIX.steps.length, NECK_TILT.steps.length + 1 + BOX_BREATHING.steps.length)
  const next = MIX.steps[NECK_TILT.steps.length]
  assert.equal(next.intro, true)
  assert.equal(next.between, true, 'sounds like a get-ready')
  assert.equal(next.ms, NEXT_MS)
  assert.equal(next.part, 1, 'belongs to the exercise it introduces')
  assert.equal(next.cue, BOX_BREATHING.setup)
  assert.equal(MIX.steps[0].count, 'down')
  assert.equal(MIX.steps.at(-1).count, 'up')
  assert.equal(routineMs(MIX), PREP_MS + TILT_MS + NEXT_MS + 64_000)
  assert.equal(sessionOf(MIX.plan), sessionOf(MIX.plan), 'cached: the same object for the same plan')
  assert.deepEqual(buildSession([]).steps, [])
})

test('session: ticks through both exercises; part, bar and count follow the current one', () => {
  let s = startRoutine(MIX.plan, 0)
  assert.equal(partIndex(s, MIX), 0)
  s = tickRoutine(s, MIX, PREP_MS + TILT_MS + 1) // "next up"
  assert.equal(MIX.steps[s.step].intro, true)
  assert.equal(partIndex(s, MIX), 1)
  assert.equal(currentPose(s, MIX), BOX_BREATHING.prepPose)
  assert.equal(countText(s, MIX, PREP_MS + TILT_MS + 1), '5', 'breathing’s width, not the stretch’s')
  assert.deepEqual(routineSegments(s, MIX, PREP_MS + TILT_MS + 1).map(x => x.round), [0, 1, 2, 3], 'the breathing bar')
  assert.equal(currentRound(s, MIX), 0)
  const breathAt = PREP_MS + TILT_MS + NEXT_MS
  s = tickRoutine(s, MIX, breathAt + 1)
  assert.equal(displayCount(s, MIX, breathAt + 1), 1, 'counts up')
  s = tickRoutine(s, MIX, 1e9)
  assert.equal(s.phase, 'done')
  assert.equal(partIndex(s, MIX), 1, 'done: the last exercise')
})

test('session: skip ends the round, never crosses into the next exercise’s round; pause holds', () => {
  let s = tickRoutine(startRoutine(MIX.plan, 0), MIX, PREP_MS + TILT_MS - 1_000) // last second of the right side
  s = skipRoutine(s, MIX, 50_000)
  assert.equal(MIX.steps[s.step].intro, true, 'to "next up", not past it')
  s = skipRoutine(s, MIX, 51_000)
  assert.equal(s.step, NECK_TILT.steps.length + 1, 'next up → first breath')
  s = pauseRoutine(s, 52_000)
  assert.equal(tickRoutine(s, MIX, 1e9), s)
})

test('session: sound plan runs across exercises; ready on "next up"; one chime at the end', () => {
  const plan = soundPlan(startRoutine(MIX.plan, 0), MIX)
  const nextAt = PREP_MS + TILT_MS
  assert.deepEqual(
    plan.filter(b => b.at > nextAt && b.at < nextAt + NEXT_MS).map(b => b.cue),
    ['ready', 'ready', 'ready'],
    '"next up" counts in like a get-ready'
  )
  assert.deepEqual(plan.find(b => b.at === nextAt + NEXT_MS), { at: nextAt + NEXT_MS, cue: 'go' })
  assert.deepEqual(plan.filter(b => b.cue === 'chime'), [{ at: routineMs(MIX), cue: 'chime' }])
})

test('session: a picked length starts with the get-ready; an empty plan never runs', () => {
  const s = startRoutine(MIX.plan, 0, 'medium')
  assert.equal(s.phase, 'prep')
  assert.equal(s.picker, true)
  assert.equal(s.length, 'medium')
  const empty = sessionOf([])
  assert.equal(tickRoutine(startRoutine([], 0), empty, 1e9).phase, 'idle')
  assert.equal(idleRoutine().picker, true, 'no plan: the picker')
  assert.equal(idleRoutine([BOX_BREATHING.id]).picker, false)
})

// ── planning ────────────────────────────────────────────────────────────────

/** A fake library: `n` stretches of `ms` each, and two wellness exercises. */
const AREAS = ['neck', 'shoulders', 'spine', 'wrists', 'legs']

/** n seated body exercises (stretch / mobility, areas in turn), `standing` standing ones, and the closers. */
function fakeLibrary(n, { standing = 0, ms = 20_000 } = {}) {
  const ex = (id, type, more = {}) => ({ id, type, area: type, position: 'seated', steps: [{ ms, round: 0 }], prepPose: 'x', ...more })
  return [
    ...Array.from({ length: n }, (_, i) => ex(`s${i}`, i % 2 ? 'mobility' : 'stretch', { area: AREAS[i % AREAS.length] })),
    ...Array.from({ length: standing }, (_, i) => ex(`up${i}`, 'stretch', { area: AREAS[i % AREAS.length], position: 'standing' })),
    ex('e0', 'eyes'),
    ex('w0', 'breathing'),
    ex('w1', 'breathing', { breather: true })
  ]
}

/** A seeded random (mulberry32), so picks are repeatable. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The session rules, checked on a list of exercises. */
function assertSessionRules(list, why) {
  assert.equal(new Set(list).size, list.length, `${why}: no repeats`)
  list.forEach((ex, i) => i && assert.notEqual(ex.area, list[i - 1].area, `${why}: ${ex.area} twice in a row`))
  const firstUp = list.findIndex(ex => ex.position === 'standing')
  if (firstUp >= 0) {
    assert.ok(list.slice(firstUp).every(ex => ex.position === 'standing'), `${why}: standing ones last`)
    assert.ok(list.length - firstUp <= MAX_STANDING, `${why}: at most ${MAX_STANDING} standing`)
  }
}

test('planMenu: 2 / 4 / 6 body exercises, then the eye exercise, then breathing when asked', () => {
  const library = fakeLibrary(30)
  for (let seed = 1; seed <= 20; seed++) {
    const menu = planMenu({ library, random: seeded(seed) })
    assert.deepEqual(SESSION_IDS.map(id => menu[id].length), [2, 4, 6])
    assert.equal(menu.eyes, 'e0')
    assert.ok(['w0', 'w1'].includes(menu.windDown), 'any breathing closes a session')
    for (const id of SESSION_IDS) {
      assert.ok(menu[id].every(x => x.startsWith('s')), 'stretch and mobility only')
      assert.deepEqual(menuPlan(menu, id, false), [...menu[id], 'e0'])
      assert.deepEqual(menuPlan(menu, id, true), [...menu[id], 'e0', menu.windDown])
    }
  }
  const none = { short: ['a'], medium: ['b'], long: ['c'], eyes: null, windDown: null }
  assert.deepEqual(menuPlan(none, 'long', true), ['c'], 'no closers in the library: nothing added')
})

test('pickBody: no repeats, no area twice in a row, standing ones last and at most two', () => {
  const library = fakeLibrary(30, { standing: 4 })
  const byId = Object.fromEntries(library.map(ex => [ex.id, ex]))
  let sawStanding = 0
  for (let seed = 1; seed <= 300; seed++) {
    const list = pickBody(6, { library, random: seeded(seed) }).map(id => byId[id])
    assert.equal(list.length, 6)
    assertSessionRules(list, `seed ${seed}`)
    if (list.some(ex => ex.position === 'standing')) sawStanding++
  }
  assert.ok(sawStanding > 0, 'standing ones do get picked')
  // Too few to follow the rules: still fills it, never the same one back to back.
  const plan = pickBody(6, { library: fakeLibrary(2), random: seeded(7) })
  assert.equal(plan.length, 6)
  plan.forEach((id, i) => assert.notEqual(id, plan[i + 1], `no ${id} twice in a row`))
  assert.deepEqual(pickBody(3, { library: [] }), [])
})

test('the real library: every session follows the rules', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const menu = planMenu({ random: seeded(seed) })
    for (const id of SESSION_IDS) {
      const list = menu[id].map(x => EXERCISES[x])
      assert.ok(list.every(isBody), 'stretch and mobility only')
      assertSessionRules(list, `seed ${seed} ${id}`)
    }
    assert.equal(EXERCISES[menu.eyes].type, 'eyes')
    assert.equal(EXERCISES[menu.windDown].type, 'breathing')
  }
})

test('pickBreather: only breathing with no holds', () => {
  assert.equal(pickBreather({ library: fakeLibrary(3), random: seeded(1) }), 'w1')
  const seen = new Set(Array.from({ length: 200 }, (_, i) => pickBreather({ random: seeded(i) })))
  assert.deepEqual([...seen].sort(), ['cyclic-sigh', 'even-breathing', 'long-exhale'])
  for (const id of seen) assert.ok(EXERCISES[id].steps.every(st => st.label !== 'hold'), `${id}: no holds`)
  assert.equal(EXERCISES['box-breathing'].breather, false, 'box breathing only closes sessions')
})

test('approxText: whole minutes, never ~0m', () => {
  assert.deepEqual([20_000, 69_000, 100_000, 420_000].map(approxText), ['~1m', '~1m', '~2m', '~7m'])
})

test('estimates: get ready, the body exercises and the eye closer from average lengths, with "next up" between', () => {
  const library = fakeLibrary(4) // every exercise 20 s
  assert.equal(estimateMs('short', library), PREP_MS + 2 * 20_000 + 20_000 + 2 * NEXT_MS)
  assert.equal(estimateMs('long', library), PREP_MS + 6 * 20_000 + 20_000 + 6 * NEXT_MS)
  assert.deepEqual(SESSION_IDS.map(lengthText), ['Short ~3m', 'Medium ~4m', 'Long ~6m'], 'today’s library')
  assert.deepEqual(SESSION_IDS.map(id => SESSION_LENGTHS[id].exercises), [2, 4, 6])
})

// ── since you last moved ────────────────────────────────────────────────────

test('active: a stint starts after a quiet gap; short gaps and restarts keep it; a break counts', () => {
  const none = { activeSince: null, lastActiveAt: null }
  let a = spellStarted(none, 1_000)
  assert.deepEqual(a, { activeSince: 1_000, lastActiveAt: 1_000 })
  a = spellEnded(a, 60_000)
  a = spellStarted(a, 60_000 + ACTIVE_GAP_MS - 1)
  assert.equal(a.activeSince, 1_000, 'a short gap: same stint')
  a = spellEnded(a, 2 * ACTIVE_GAP_MS)
  assert.equal(lastMovedAt(a, { busy: false, lastBreakAt: null, now: 2 * ACTIVE_GAP_MS + 5 }), 1_000)
  assert.equal(lastMovedAt(a, { busy: false, lastBreakAt: 500_000, now: 2 * ACTIVE_GAP_MS + 5 }), 500_000, 'since the break')
  assert.equal(lastMovedAt(a, { busy: false, lastBreakAt: null, now: 3 * ACTIVE_GAP_MS }), null, 'quiet too long: unknown')
  assert.equal(lastMovedAt(a, { busy: true, lastBreakAt: null, now: 9 * ACTIVE_GAP_MS }), 1_000, 'a long busy spell is still the stint')
  assert.equal(spellStarted(a, 3 * ACTIVE_GAP_MS).activeSince, 3 * ACTIVE_GAP_MS, 'a new stint')
  assert.equal(lastMovedAt(none, { busy: true, lastBreakAt: 5, now: 10 }), null)
})

test('sinceText: friendly, rounded', () => {
  const min = m => m * 60_000
  assert.deepEqual(
    [2, 7, 25, 54, 60, 80, 100, 120, 150].map(m => sinceText(min(m))),
    ['a few minutes', '7 minutes', '25 minutes', '54 minutes', 'an hour', 'an hour and a half', 'an hour and a half', '2 hours', '2½ hours']
  )
  assert.equal(movedTitle(0, min(25)), 'It’s been 25 minutes since you last moved')
  assert.equal(movedTitle(null, 0), 'Time to move a little?')
})

// ── reps ────────────────────────────────────────────────────────────────────

/** A paced reps exercise (fixture, not in the library): n reps of `ms`, optionally per side. */
const repsExercise = (n, ms, sides = false) => {
  const reps = (round0, pose) =>
    Array.from({ length: n }, (_, i) => ({ ms, rep: i + 1, round: round0 + i, label: `of ${n}`, pose, cue: 'Roll.' }))
  return {
    id: `test-reps-${n}-${sides}`,
    kind: 'stretch',
    name: 'Shoulder rolls',
    setup: 'Sit tall.',
    safety: 'Gently.',
    prepPose: 'centre',
    count: 'reps',
    rounds: Array(sides ? 2 * n : n).fill(null),
    roundText: i => `Rep ${i + 1}`,
    steps: sides
      ? [...reps(0, 'left'), { ms: REST_MS, label: 'switch sides', pose: 'centre', round: null, between: true, cue: 'Switch.' }, ...reps(n, 'right')]
      : reps(0, 'roll')
  }
}

test('reps: the big number is the rep, for the whole rep; each rep has its own strip', () => {
  const ses = buildSession([repsExercise(8, 4_000)])
  const prep = startRoutine(ses.plan, 0)
  assert.deepEqual([0, 4_999].map(t => displayCount(prep, ses, t)), [5, 1], 'get ready counts down')
  let s = tickRoutine(prep, ses, PREP_MS)
  assert.deepEqual([0, 1_500, 3_999].map(t => displayCount(s, ses, PREP_MS + t)), [1, 1, 1], 'rep 1 throughout')
  s = tickRoutine(s, ses, PREP_MS + 4_000)
  assert.equal(displayCount(s, ses, PREP_MS + 4_000), 2)
  const segs = routineSegments(s, ses, PREP_MS + 6_000)
  assert.equal(segs.length, 8, 'one strip per rep')
  assert.ok(segs.every(g => g.weight === 4_000))
  assert.deepEqual(segs.slice(0, 3).map(g => g.fill), [1, 0.5, 0], 'rep 1 done, rep 2 half-way')
  assert.equal(currentRound(s, ses), 1)
  const skipped = skipRoutine(s, ses, PREP_MS + 5_000)
  assert.equal(displayCount(skipped, ses, PREP_MS + 5_000), 3, 'Skip ends this rep only')
  assert.equal(tickRoutine(s, ses, PREP_MS + 8 * 4_000).phase, 'done')
})

test('reps: padded to the widest rep, so the number never changes width', () => {
  const eight = buildSession([repsExercise(8, 3_000)])
  assert.equal(countText(startRoutine(eight.plan, 0), eight, 0), '5', 'get ready: 8 reps fit in one digit')
  const twelve = buildSession([repsExercise(12, 3_000)])
  const prep = startRoutine(twelve.plan, 0)
  assert.equal(countText(prep, twelve, 0), '05')
  assert.deepEqual(countParts(tickRoutine(prep, twelve, PREP_MS), twelve, PREP_MS), { pad: '0', digits: '1' })
  assert.equal(countText(tickRoutine(prep, twelve, PREP_MS + 11 * 3_000), twelve, PREP_MS + 11 * 3_000), '12')
})

test('reps: per side, the switch counts down between the sets; reps restart at 1', () => {
  const ses = buildSession([repsExercise(5, 3_000, true)])
  let s = tickRoutine(startRoutine(ses.plan, 0), ses, PREP_MS + 5 * 3_000)
  assert.equal(ses.steps[s.step].label, 'switch sides')
  assert.deepEqual([0, 4_500].map(t => displayCount(s, ses, PREP_MS + 15_000 + t)), [5, 1])
  s = tickRoutine(s, ses, PREP_MS + 15_000 + REST_MS)
  assert.equal(displayCount(s, ses, PREP_MS + 15_000 + REST_MS), 1)
  assert.equal(currentPose(s, ses), 'right')
  assert.equal(routineSegments(s, ses, PREP_MS + 15_000 + REST_MS).length, 11, '5 reps, the switch, 5 reps')
})

test('soundPlan: reps: ready 3-2-1, one go per rep and nothing between; ends on a chime', () => {
  const ses = buildSession([repsExercise(8, 4_000)])
  const plan = soundPlan(startRoutine(ses.plan, 0), ses)
  assert.deepEqual(plan.map(b => b.cue), ['ready', 'ready', 'ready', ...Array(8).fill('go'), 'chime'])
  assert.deepEqual(
    plan.filter(b => b.cue === 'go').map(b => b.at),
    Array.from({ length: 8 }, (_, i) => PREP_MS + i * 4_000)
  )
  assert.equal(plan[plan.length - 1].at, PREP_MS + 32_000)
})

test('reps: in a session after a hold, each part pads to its own width', () => {
  const ses = buildSession([NECK_TILT, repsExercise(8, 3_000)])
  const end = PREP_MS + 45_000
  const next = tickRoutine(startRoutine(ses.plan, 0), ses, end)
  assert.equal(ses.steps[next.step].intro, true, '"next up"')
  assert.equal(countText(next, ses, end), '5')
  const rep = tickRoutine(next, ses, end + NEXT_MS)
  assert.equal(countText(rep, ses, end + NEXT_MS), '1')
})

// ── figures ────────────────────────────────────────────────────────────────

test('figureArt: the figure’s data URL, or none', () => {
  const art = { 'a/x': 'data:C' }
  assert.equal(figureArt('a/x', art), 'data:C')
  assert.equal(figureArt('c/z', art), null)
  assert.equal(figureArt(null, art), null)
  assert.equal(figureArt('a/x'), null, 'src/ has no art (the build adds it)')
})

test('currentFigure: the pose of the exercise you are on, next up included', () => {
  const ses = buildSession([NECK_TILT, BOX_BREATHING])
  let s = startRoutine(ses.plan, 0)
  assert.equal(currentFigure(s, ses), figureKey(NECK_TILT.id, NECK_TILT.prepPose), 'get ready')
  s = tickRoutine(s, ses, PREP_MS)
  assert.equal(currentFigure(s, ses), `${NECK_TILT.id}/${ses.steps[0].pose}`)
  const next = ses.steps.findIndex(st => st.intro)
  s = { ...s, phase: 'step', step: next }
  assert.equal(currentFigure(s, ses), figureKey(BOX_BREATHING.id, BOX_BREATHING.prepPose), 'next up shows the next exercise')
  assert.equal(currentFigure(idleRoutine(), buildSession([])), null)
})

test('figures: every pose of every exercise has a drawing in assets/figures (plus the offer and done art)', () => {
  const root = new URL('../assets/figures/', import.meta.url)
  const needed = new Set([OFFER_FIGURE, DONE_FIGURE])
  for (const ex of Object.values(EXERCISES)) {
    needed.add(figureKey(ex.id, ex.prepPose))
    for (const st of ex.steps) needed.add(figureKey(ex.id, st.pose))
  }
  const missing = [...needed].filter(key => !existsSync(new URL(`${key}.png`, root)))
  assert.deepEqual(missing, [], 'draw these with the figures toolkit')
  // The build inlines every PNG there, so one nothing shows would ship for nothing.
  const unused = readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .flatMap(d => readdirSync(new URL(`${d.name}/`, root)).map(f => `${d.name}/${f.replace(/\.png$/, '')}`))
    .filter(key => !needed.has(key))
  assert.deepEqual(unused, [], 'not used by any exercise: delete them')
})
