// Pure logic: no SDK, no timers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import plugin, {
  DEFAULT_SETTINGS,
  EXERCISE,
  OFFER_MS,
  PREP_MS,
  REST_MS,
  advanceRoutine,
  anyBusy,
  applyTransitions,
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

const HOLD = EXERCISE.holdMs
const phases = s => `${s.phase}:${s.rep}`

test('routine: full run prep → hold → rest → hold → done', () => {
  let s = startRoutine(EXERCISE, 0)
  assert.equal(phases(s), 'prep:0')
  assert.equal(EXERCISE.reps.length, 2)
  s = tickRoutine(s, EXERCISE, PREP_MS - 1)
  assert.equal(phases(s), 'prep:0', 'not yet')
  s = tickRoutine(s, EXERCISE, PREP_MS)
  assert.equal(phases(s), 'hold:0')
  assert.equal(s.endsAt, PREP_MS + HOLD, 'chained from the previous end, not from tick time')
  s = tickRoutine(s, EXERCISE, PREP_MS + HOLD + 1)
  assert.equal(phases(s), 'rest:0')
  s = tickRoutine(s, EXERCISE, PREP_MS + HOLD + REST_MS)
  assert.equal(phases(s), 'hold:1')
  s = tickRoutine(s, EXERCISE, PREP_MS + 2 * HOLD + REST_MS)
  assert.equal(phases(s), 'done:1')
  assert.equal(isRoutineActive(s), false)
  assert.equal(tickRoutine(s, EXERCISE, 1e12), s, 'done is terminal')
})

test('routine: the offer countdown leads straight into the first hold', () => {
  let s = offerRoutine(0)
  assert.equal(s.phase, 'offer')
  assert.equal(isTimed(s), true)
  assert.equal(isRoutineActive(s), false, 'an offer is not a commitment')
  s = tickRoutine(s, EXERCISE, OFFER_MS)
  assert.equal(phases(s), 'hold:0')
  assert.equal(phases(skipRoutine(offerRoutine(0), EXERCISE, 1)), 'hold:0', 'start now')
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
  let s = tickRoutine(startRoutine(EXERCISE, 0), EXERCISE, PREP_MS) // hold:0, ends PREP+HOLD
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
  assert.equal(phases(s), 'hold:0')
  assert.equal(s.endsAt, 1_000 + HOLD)
  s = skipRoutine(pauseRoutine(s, 2_000), EXERCISE, 3_000)
  assert.equal(phases(s), 'rest:0')
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
  for (const p of ['prep', 'hold', 'rest']) assert.equal(isLargePhase(p), true, p)
  for (const p of ['idle', 'offer', 'done']) assert.equal(isLargePhase(p), false, p)
})

test('routine bar: a segment per hold, a rest between, filled in order', () => {
  const HOLD = EXERCISE.holdMs
  const fills = s => routineSegments(s, EXERCISE, at).map(x => Math.round(x.fill * 100) / 100)
  let at = 0
  let s = startRoutine(EXERCISE, 0)
  assert.deepEqual(routineSegments(s, EXERCISE, 0).map(x => x.kind), ['hold', 'rest', 'hold'])
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

