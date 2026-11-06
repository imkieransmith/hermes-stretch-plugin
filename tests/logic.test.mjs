// Pure logic: no SDK, no timers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import plugin, {
  DEFAULT_SETTINGS,
  BOX_BREATHING,
  TENSION_WINDOW_MS,
  ownWords,
  tensionScore,
  tensionSignals,
  tensionTotal,
  tensionUptick,
  NECK_TILT,
  currentRound,
  displayCount,
  countText,
  countParts,
  tileSize,
  LAST_TICKS,
  SOUND_CUES,
  SOUND_PEAK,
  createSound,
  renderCue,
  soundPlan,
  displaySeconds,
  exerciseOf,
  routineSeconds,
  OFFER_MS,
  PREP_MS,
  REST_MS,
  advanceRoutine,
  anyBusy,
  applyTransitions,
  currentPose,
  diffBusy,
  emptyActivity,
  filterLog,
  formatDuration,
  idleRoutine,
  inCooldown,
  isLargePhase,
  isRoutineActive,
  isTimed,
  normalizeSettings,
  offerRoutine,
  pauseRoutine,
  phaseProgress,
  remainingMs,
  resumeRoutine,
  routineSegments,
  shortId,
  shouldOffer,
  shouldShowPane,
  skipRoutine,
  startRoutine,
  tickRoutine
} from '../desktop/plugin.js'

// ── activity tracking ───────────────────────────────────────────────────────

test('diffBusy: start, finish, missing keys count as idle', () => {
  assert.deepEqual(diffBusy({}, { a: true }), [{ sessionId: 'a', kind: 'start' }])
  assert.deepEqual(diffBusy({ a: true }, {}), [{ sessionId: 'a', kind: 'finish' }])
  assert.deepEqual(diffBusy({ a: true }, { a: false }), [{ sessionId: 'a', kind: 'finish' }])
  assert.deepEqual(diffBusy({ a: true }, { a: true, b: false }), [])
  assert.deepEqual(diffBusy(undefined, null), [])
})

test('applyTransitions: repeated turns record durations and counts', () => {
  let s = emptyActivity()
  s = applyTransitions(s, [{ sessionId: 'a', kind: 'start' }], 1_000)
  assert.equal(s.sessions.a.busy, true)
  s = applyTransitions(s, [{ sessionId: 'a', kind: 'finish' }], 31_000)
  assert.deepEqual(s.sessions.a, { busy: false, startedAt: null, lastDurationMs: 30_000, turns: 1 })
  s = applyTransitions(s, [{ sessionId: 'a', kind: 'start' }], 40_000)
  s = applyTransitions(s, [{ sessionId: 'a', kind: 'finish' }], 45_000)
  assert.equal(s.sessions.a.turns, 2)
  assert.equal(s.sessions.a.lastDurationMs, 5_000)
  assert.equal(s.log.length, 4)
})

test('applyTransitions: finish without a known start has null duration', () => {
  const s = applyTransitions(emptyActivity(), [{ sessionId: 'x', kind: 'finish' }], 5)
  assert.equal(s.log[0].durationMs, null)
})

test('formatDuration / shortId / anyBusy / filterLog', () => {
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(75_000), '1:15')
  assert.equal(formatDuration(3_725_000), '1:02:05')
  assert.equal(formatDuration(null), '–')
  assert.equal(shortId('abc'), 'abc')
  assert.equal(shortId('local-1a2b3c4d5e776b'), '…5e776b')
  assert.equal(shortId(null), '—')
  assert.equal(anyBusy({ a: false, b: true }), true)
  assert.equal(anyBusy(undefined), false)
  const log = [
    { at: 1, sessionId: 'a', kind: 'start' },
    { at: 2, sessionId: 'b', kind: 'start' },
    { at: 3, sessionId: 'a', kind: 'finish' }
  ]
  assert.deepEqual(filterLog(log, 'chat', 'a').map(e => e.at), [1, 3])
  assert.deepEqual(filterLog(log, 'chat', null), [])
  assert.equal(filterLog(log, 'all', 'a').length, 3)
})

// ── pane + offer policy ─────────────────────────────────────────────────────

test('shouldShowPane', () => {
  assert.equal(shouldShowPane({}), false)
  assert.equal(shouldShowPane({ offered: true }), true)
  assert.equal(shouldShowPane({ pinned: true }), true)
  assert.equal(shouldShowPane({ routineActive: true }), true)
})

test('normalizeSettings: defaults, valid overrides, junk dropped', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings('nope'), DEFAULT_SETTINGS)
  const s = normalizeSettings({ autoStart: false, cooldownMin: 0, offerDelaySec: 30, offersEnabled: 'yes', extra: 1 })
  assert.deepEqual(s, { ...DEFAULT_SETTINGS, autoStart: false, cooldownMin: 0, offerDelaySec: 30 })
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

const EXERCISE = NECK_TILT
const HOLD = EXERCISE.steps[0].ms
const phases = s => `${s.phase}:${s.step}`

test('routine: neck tilt runs prep → left hold → rest → right hold → done', () => {
  let s = startRoutine(EXERCISE, 0)
  assert.equal(phases(s), 'prep:0')
  assert.equal(s.exId, 'neck-side-tilt')
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
  assert.equal(s.exId, 'neck-side-tilt', 'done remembers the exercise (for "Again")')
  assert.equal(isRoutineActive(s), false)
  assert.equal(tickRoutine(s, EXERCISE, 1e12), s, 'done is terminal')
})

test('routine: the offer countdown leads straight into the first hold', () => {
  let s = offerRoutine(EXERCISE, 0)
  assert.equal(s.phase, 'offer')
  assert.equal(isTimed(s), true)
  assert.equal(isRoutineActive(s), false, 'an offer is not a commitment')
  s = tickRoutine(s, EXERCISE, OFFER_MS)
  assert.equal(phases(s), 'step:0')
  assert.equal(phases(skipRoutine(offerRoutine(EXERCISE, 0), EXERCISE, 1)), 'step:0', 'start now')
})

test('routine: a big gap (sleep, missed ticks) catches up in one tick', () => {
  const s = tickRoutine(startRoutine(EXERCISE, 0), EXERCISE, 10 * 60_000)
  assert.equal(s.phase, 'done')
})

test('routine: tick returns the same object when nothing changes', () => {
  const s = startRoutine(EXERCISE, 0)
  assert.equal(tickRoutine(s, EXERCISE, 1), s)
  assert.equal(tickRoutine(idleRoutine(), EXERCISE, 1e9).phase, 'idle')
})

test('routine: pause freezes time, resume shifts the deadline', () => {
  let s = tickRoutine(startRoutine(EXERCISE, 0), EXERCISE, PREP_MS) // step:0, ends PREP+HOLD
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
  let s = startRoutine(EXERCISE, 0)
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

// ── loader constraints ──────────────────────────────────────────────────────

test('desktop/plugin.js only imports the three allowed specifiers', () => {
  const src = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
  const specs = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1])
  assert.ok(specs.length >= 3)
  for (const s of specs) assert.ok(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'].includes(s), s)
  assert.doesNotMatch(src, /\bimport\s*\(/, 'no dynamic import()')
  assert.equal(plugin.id, 'stretch-break')
})

test('no native title= on buttons (Hermes DESIGN.md; core has the same test)', () => {
  const src = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /jsxs?\(\s*Button,\s*\{[^}]*\btitle:/, 'Button with title')
  assert.doesNotMatch(src, /jsxs?\(\s*'button',\s*\{[^}]*\btitle:/, 'button with title')
})

test('layout: large while stretching, compact otherwise', () => {
  for (const p of ['prep', 'step']) assert.equal(isLargePhase(p), true, p)
  for (const p of ['idle', 'offer', 'done']) assert.equal(isLargePhase(p), false, p)
})

test('routine bar: a segment per hold, a rest between, filled in order', () => {
  const fills = s => routineSegments(s, EXERCISE, at).map(x => Math.round(x.fill * 100) / 100)
  let at = 0
  let s = startRoutine(EXERCISE, 0)
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
  const pose = at => currentPose(tickRoutine(startRoutine(EXERCISE, 0), EXERCISE, at), EXERCISE)
  assert.equal(pose(0), 'centre', 'getting ready: upright')
  assert.equal(pose(PREP_MS + 1), 'left')
  assert.equal(pose(PREP_MS + HOLD + 1), 'centre', 'between sides: upright')
  assert.equal(pose(PREP_MS + HOLD + REST_MS + 1), 'right')
})

test('round: the one you are in, or heading into during a rest / get ready', () => {
  const round = at => currentRound(tickRoutine(startRoutine(EXERCISE, 0), EXERCISE, at), EXERCISE)
  assert.equal(round(0), 0)
  assert.equal(round(PREP_MS + 1), 0)
  assert.equal(round(PREP_MS + HOLD + 1), 1, 'rest: heading into the right side')
  assert.equal(EXERCISE.roundText(1), 'Rep 2 of 2 · Right side')
  assert.equal(routineSeconds(EXERCISE), 45)
})

test('box breathing: 4 rounds of in / hold / out / hold, 4 s each', () => {
  const ex = BOX_BREATHING
  assert.equal(ex.steps.length, 16)
  assert.ok(ex.steps.every(st => st.ms === 4_000))
  assert.deepEqual(ex.steps.slice(0, 4).map(st => st.label), ['breathe in', 'hold', 'breathe out', 'hold'])
  let s = startRoutine(ex, 0)
  assert.equal(currentPose(s, ex), 'ready')
  s = tickRoutine(s, ex, PREP_MS + 4_000 * 5 + 1) // round 2, second step
  assert.equal(phases(s), 'step:5')
  assert.equal(currentPose(s, ex), 'hold')
  assert.equal(currentRound(s, ex), 1)
  assert.equal(ex.roundText(1), 'Round 2 of 4')
  assert.equal(Math.ceil(remainingMs(s, PREP_MS + 4_000 * 5 + 1) / 1000), 4, 'counts each step down 4, 3, 2, 1')
  const segs = routineSegments(s, ex, PREP_MS + 4_000 * 5 + 1)
  assert.deepEqual(segs.map(x => x.round), [0, 1, 2, 3], 'one bar segment per round')
  assert.equal(segs[0].fill, 1)
  assert.ok(segs[1].fill > 0.25 && segs[1].fill < 0.26)
  s = tickRoutine(s, ex, 1e9)
  assert.equal(s.phase, 'done')
  assert.equal(exerciseOf(s), ex)
  assert.equal(exerciseOf({ exId: 'nope' }), NECK_TILT, 'unknown ids fall back to the stretch')
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
    assert.equal(tensionScore(msg), 1, msg)
  }
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

test('tension: a message counts once however many signals it has', () => {
  const sig = tensionSignals('WHAT THE FUCK ARE YOU DOING!!!')
  assert.deepEqual(sig, { swear: true, phrase: true, shouting: true, punctuation: true })
  assert.equal(tensionScore('WHAT THE FUCK ARE YOU DOING!!!'), 1)
  assert.equal(tensionScore(''), 0)
  assert.equal(tensionScore(undefined), 0)
  assert.match(ownWords('see `rm -rf` and src/app.ts'), /^see\s+and\s+$/)
})

test('tension: an uptick is 2 tense messages within 10 minutes', () => {
  const now = 100 * 60_000
  assert.equal(tensionUptick([{ at: now, score: 1 }], now), false, 'one-offs are ignored')
  assert.equal(tensionUptick([{ at: now - 60_000, score: 1 }, { at: now, score: 1 }], now), true)
  const old = { at: now - TENSION_WINDOW_MS, score: 1 }
  assert.equal(tensionUptick([old, { at: now, score: 1 }], now), false, 'outside the window')
  assert.equal(tensionTotal([old, { at: now - 1, score: 1 }], now), 1)
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
  assert.equal(shouldOffer({ ...base, routinePhase: 'offer' }), false)
})

test('countdown: shows N … 1 and never 0', () => {
  const ex = BOX_BREATHING
  const s = tickRoutine(startRoutine(ex, 0), ex, PREP_MS) // first 4 s step
  const shown = [0, 999, 1_000, 2_500, 3_000, 3_999, 4_000].map(t => displaySeconds(s, PREP_MS + t))
  assert.deepEqual(shown, [4, 4, 3, 2, 1, 1, 1], 'clamped at 1 even past the end')
  const next = tickRoutine(s, ex, PREP_MS + 4_000)
  assert.equal(next.step, 1)
  assert.equal(displaySeconds(next, PREP_MS + 4_000), 4, 'the next step starts at 4')
})

test('count: breathing counts up 1 … 4; stretches and get-ready count down', () => {
  const ex = BOX_BREATHING
  const prep = startRoutine(ex, 0)
  assert.deepEqual([0, 1_000, 2_999].map(t => displayCount(prep, ex, t)), [3, 2, 1], 'get ready counts down')
  const s = tickRoutine(prep, ex, PREP_MS)
  const shown = [0, 999, 1_000, 2_000, 3_000, 3_999, 4_000].map(t => displayCount(s, ex, PREP_MS + t))
  assert.deepEqual(shown, [1, 1, 2, 3, 4, 4, 4], 'never 0, never 5')
  const paused = pauseRoutine(s, PREP_MS + 2_500)
  assert.equal(displayCount(paused, ex, PREP_MS + 60_000), 3, 'holds while paused')

  const hold = tickRoutine(startRoutine(NECK_TILT, 0), NECK_TILT, PREP_MS)
  assert.equal(displayCount(hold, NECK_TILT, PREP_MS), 20, 'stretch hold counts down')
  assert.equal(displayCount(hold, NECK_TILT, PREP_MS + 19_500), 1)
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
  const ex = BOX_BREATHING
  const plan = soundPlan(startRoutine(ex, 0), ex)
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
  const ex = NECK_TILT
  const plan = soundPlan(startRoutine(ex, 0), ex)
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
  const ex = BOX_BREATHING
  const s = tickRoutine(startRoutine(ex, 0), ex, PREP_MS + 5_000) // step 1 (hold), started at 7 s
  assert.equal(s.step, 1)
  assert.equal(soundPlan(s, ex)[0].at, PREP_MS + 4_000)
  assert.deepEqual(soundPlan(pauseRoutine(s, PREP_MS + 5_000), ex), [])
  assert.deepEqual(soundPlan(offerRoutine(ex, 0), ex), [])
  assert.deepEqual(soundPlan(idleRoutine(ex), ex), [])
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
  const ex = BOX_BREATHING
  let s = startRoutine(ex, 0)
  sound.sync(soundPlan(s, ex))
  const first = sound.scheduled()
  assert.equal(first.length, LAST_TICKS + 64 + 1)
  assert.deepEqual(log.slice(0, 2), [['start', 100], ['start', 101]], 'beat at t+1 s → audio clock +1 s')

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
  const st = startRoutine(NECK_TILT, 0)
  assert.equal(countText(st, NECK_TILT, 0), '03', 'get ready matches the 20 s holds')
  assert.deepEqual(countParts(st, NECK_TILT, 0), { pad: '0', digits: '3' })
  const hold = tickRoutine(st, NECK_TILT, PREP_MS)
  assert.equal(countText(hold, NECK_TILT, PREP_MS), '20')
  assert.equal(countText(hold, NECK_TILT, PREP_MS + 11_500), '09')
  assert.equal(countText(hold, NECK_TILT, PREP_MS + 19_900), '01')
  const rest = tickRoutine(hold, NECK_TILT, PREP_MS + 20_000)
  assert.equal(countText(rest, NECK_TILT, PREP_MS + 20_000), '04', 'switch sides')
  assert.equal(countText(startRoutine(BOX_BREATHING, 0), BOX_BREATHING, 0), '3', 'breathing never needs two digits')
  const breath = tickRoutine(startRoutine(BOX_BREATHING, 0), BOX_BREATHING, PREP_MS)
  assert.equal(countText(breath, BOX_BREATHING, PREP_MS + 2_500), '3')
})

test('tileSize: matches the text column, within bounds; fixed when stacked', () => {
  assert.equal(tileSize(null, false), 156, 'before measuring')
  assert.equal(tileSize(100, false), 156, 'never smaller than before')
  assert.equal(tileSize(214, false), 214, 'fills the card height')
  assert.equal(tileSize(900, false), 280, 'capped')
  assert.equal(tileSize(214, true), 220, 'own line')
})

