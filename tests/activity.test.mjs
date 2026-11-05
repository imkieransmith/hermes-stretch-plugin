import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import plugin, { applyTransitions, diffBusy, emptyActivity, formatDuration, shortId } from '../desktop/plugin.js'
import { host } from '@hermes/plugin-sdk'

// ── pure logic ──────────────────────────────────────────────────────────────

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

test('formatDuration / shortId', () => {
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(75_000), '1:15')
  assert.equal(formatDuration(3_725_000), '1:02:05')
  assert.equal(formatDuration(null), '–')
  assert.equal(shortId('abc'), 'abc')
  assert.equal(shortId('20261105_abcdef123456'), '2026…3456')
})

// ── register(ctx) against fake host atoms ───────────────────────────────────

function fakeCtx() {
  const disposers = []
  const contributions = []
  return {
    contributions,
    dispose: () => disposers.splice(0).forEach(fn => fn()),
    register: c => (contributions.push(c), () => {}),
    registerMany: cs => (contributions.push(...cs), () => {}),
    onDispose: fn => disposers.push(fn),
    onEvent: () => () => {},
    setInterval: () => () => {},
    setTimeout: () => () => {}
  }
}

function paneStores(ctx) {
  const pane = ctx.contributions.find(c => c.area === 'panes')
  return pane.render().props // { $activity, $events, $bySession, clear }
}

test('register: tracks turns per session; focus switches are not transitions', () => {
  host.state.busyBySession.set({})
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $activity } = paneStores(ctx)

  host.state.busyBySession.set({ a: true }) // turn starts in A
  host.state.focusedSessionId.set('b') // user switches to B: no busy change
  host.state.busyBySession.set({ a: true, b: true }) // B starts too
  host.state.busyBySession.set({ a: false, b: true }) // A finishes
  host.state.busyBySession.set({ b: false }) // B finishes (A key dropped)

  const kinds = $activity.get().log.map(e => `${e.kind}:${e.sessionId}`)
  assert.deepEqual(kinds, ['start:a', 'start:b', 'finish:a', 'finish:b'])
  assert.equal($activity.get().sessions.a.turns, 1)

  ctx.dispose()
  host.state.busyBySession.set({ a: true })
  assert.equal($activity.get().log.length, 4, 'no updates after dispose')
})

test('register: a turn already running at load is seeded as started', () => {
  host.state.busyBySession.set({ z: true })
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $activity, clear } = paneStores(ctx)
  assert.equal($activity.get().sessions.z.busy, true)
  clear()
  assert.equal($activity.get().log.length, 0)
  assert.equal($activity.get().sessions.z.busy, true, 'clear keeps in-flight turns')
  ctx.dispose()
  host.state.busyBySession.set({})
})

// ── loader constraints ──────────────────────────────────────────────────────

test('desktop/plugin.js only imports the three allowed specifiers', () => {
  const src = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
  const specs = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1])
  for (const s of specs) assert.ok(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'].includes(s), s)
  assert.doesNotMatch(src, /\bimport\s*\(/, 'no dynamic import()')
  assert.equal(plugin.id, 'stretch-break')
})
