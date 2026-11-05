import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import plugin, {
  anyBusy,
  applyTransitions,
  diffBusy,
  emptyActivity,
  filterLog,
  formatDuration,
  shortId,
  shouldShowPane
} from '../desktop/plugin.js'
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
  assert.equal(shortId('local-1a2b3c4d5e776b'), '…5e776b')
  assert.equal(shortId(null), '—')
})

test('filterLog: this chat vs all chats', () => {
  const log = [
    { at: 1, sessionId: 'a', kind: 'start' },
    { at: 2, sessionId: 'b', kind: 'start' },
    { at: 3, sessionId: 'a', kind: 'finish' }
  ]
  assert.deepEqual(filterLog(log, 'chat', 'a').map(e => e.at), [1, 3])
  assert.deepEqual(filterLog(log, 'chat', null), [])
  assert.equal(filterLog(log, 'all', 'a').length, 3)
})

// ── register(ctx) against fake host atoms ───────────────────────────────────

function fakeCtx() {
  const disposers = []
  const contributions = []
  const timers = new Set()
  const add = c => {
    contributions.push(c)
    return () => {
      const i = contributions.indexOf(c)
      if (i >= 0) contributions.splice(i, 1)
    }
  }
  return {
    contributions,
    pane: () => contributions.find(c => c.area === 'panes'),
    /** Run pending timers (and any they schedule) until none are left. */
    flushTimers: () => {
      for (let i = 0; i < 10 && timers.size; i++) [...timers].forEach(t => (timers.delete(t), t()))
    },
    /** Run only the timers pending right now (one step of a chain). */
    stepTimers: () => [...timers].forEach(t => (timers.delete(t), t())),
    dispose: () => disposers.splice(0).forEach(fn => fn()),
    register: add,
    registerMany: cs => {
      const ds = cs.map(add)
      return () => ds.forEach(d => d())
    },
    onDispose: fn => disposers.push(fn),
    onEvent: () => () => {},
    setInterval: () => () => {},
    setTimeout: fn => {
      timers.add(fn)
      return () => timers.delete(fn)
    }
  }
}

/** The shared model every render gets (via the always-present status chip). */
function modelOf(ctx) {
  return ctx.contributions.find(c => c.id === 'chip').render().props.model
}

test('register: tracks turns per session; focus switches are not transitions', () => {
  host.state.busyBySession.set({})
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $activity } = modelOf(ctx)

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
  host.state.busyBySession.set({})
})

test('register: a turn already running at load is seeded as started', () => {
  host.state.busyBySession.set({ z: true })
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $activity, actions } = modelOf(ctx)
  assert.equal($activity.get().sessions.z.busy, true)
  assert.ok(ctx.pane(), 'pane shows for an in-flight turn at load')
  actions.clear()
  assert.equal($activity.get().log.length, 0)
  assert.equal($activity.get().sessions.z.busy, true, 'clear keeps in-flight turns')
  ctx.dispose()
  host.state.busyBySession.set({})
})

// ── pane visibility ─────────────────────────────────────────────────────────

test('shouldShowPane', () => {
  assert.equal(shouldShowPane({ anyBusy: false, pinned: false, dismissed: false }), false)
  assert.equal(shouldShowPane({ anyBusy: true, pinned: false, dismissed: false }), true)
  assert.equal(shouldShowPane({ anyBusy: true, pinned: false, dismissed: true }), false)
  assert.equal(shouldShowPane({ anyBusy: false, pinned: true, dismissed: false }), true)
  assert.equal(anyBusy({ a: false, b: true }), true)
  assert.equal(anyBusy(undefined), false)
})

test('pane: absent when idle, appears on work, lingers, animates out, then goes', () => {
  host.state.busyBySession.set({})
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $paneOpen, $closing } = modelOf(ctx)
  assert.equal(ctx.pane(), undefined, 'idle: no pane')

  host.state.busyBySession.set({ a: true })
  assert.ok(ctx.pane(), 'working: pane registered')
  assert.equal(ctx.pane().data.height, '50vh')
  assert.equal($paneOpen.get(), true)

  host.state.busyBySession.set({ a: false })
  assert.ok(ctx.pane(), 'still there during the grace period')
  host.state.busyBySession.set({ a: true }) // next turn starts within the grace period
  ctx.flushTimers()
  assert.ok(ctx.pane(), 'cancelled hide: no flash between turns')

  host.state.busyBySession.set({ a: false })
  ctx.stepTimers() // grace period ends → exit animation starts
  assert.ok(ctx.pane(), 'still registered while animating out')
  assert.equal($closing.get(), true)
  ctx.stepTimers() // exit animation ends
  assert.equal(ctx.pane(), undefined, 'gone after the exit animation')
  assert.equal($closing.get(), false)
  assert.equal($paneOpen.get(), false)
  ctx.dispose()
})

test('pane: work resuming mid-exit cancels the exit', () => {
  host.state.busyBySession.set({})
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $closing } = modelOf(ctx)
  host.state.busyBySession.set({ a: true })
  host.state.busyBySession.set({ a: false })
  ctx.stepTimers() // → closing
  assert.equal($closing.get(), true)
  host.state.busyBySession.set({ a: true })
  assert.equal($closing.get(), false, 'animating back in')
  ctx.flushTimers()
  assert.ok(ctx.pane(), 'pane stays')
  ctx.dispose()
  host.state.busyBySession.set({})
})

test('pane: hide during work stays hidden for that spell, returns next task', () => {
  host.state.busyBySession.set({})
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { actions } = modelOf(ctx)

  host.state.busyBySession.set({ a: true })
  actions.hidePane()
  ctx.flushTimers() // exit animation (no grace period for an explicit hide)
  assert.equal(ctx.pane(), undefined, 'hidden')
  host.state.busyBySession.set({ a: true, b: true }) // more work in the same spell
  assert.equal(ctx.pane(), undefined, 'stays hidden')

  host.state.busyBySession.set({})
  host.state.busyBySession.set({ a: true }) // next task
  assert.ok(ctx.pane(), 'back for the next task')
  ctx.dispose()
  host.state.busyBySession.set({})
})

test('pane: chip toggle pins it open while idle, debug command opens debug view', () => {
  host.state.busyBySession.set({})
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { actions, $ui } = modelOf(ctx)

  actions.togglePane()
  assert.ok(ctx.pane(), 'pinned open while idle')
  ctx.flushTimers()
  assert.ok(ctx.pane(), 'pinned pane does not auto-hide')
  actions.togglePane()
  ctx.flushTimers()
  assert.equal(ctx.pane(), undefined, 'toggled closed')

  ctx.contributions.find(c => c.id === 'debug').data.run()
  assert.ok(ctx.pane())
  assert.equal($ui.get().view, 'debug')
  ctx.dispose()
})

// ── render smoke test ───────────────────────────────────────────────────────

/** Expand every function component (stub hooks are plain values), so a
 *  missing import or bad prop access throws here rather than in the app. */
function renderTree(node, seen = []) {
  if (Array.isArray(node)) return node.forEach(n => renderTree(n, seen))
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'function') {
    seen.push(node.type.name)
    return renderTree(node.type(node.props || {}), seen)
  }
  if (node.type === undefined) throw new Error('element with undefined type (missing import?)')
  renderTree(node.props && node.props.children, seen)
  return seen
}

test('render: chip and both pane views render without throwing', () => {
  host.state.busyBySession.set({ a: true })
  host.state.focusedSessionId.set('a')
  host.state.busy.set(true)
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { actions } = modelOf(ctx)
  const seen = []
  renderTree(ctx.contributions.find(c => c.id === 'chip').render(), seen)
  renderTree(ctx.pane().render(), seen)
  actions.setView('debug')
  renderTree(ctx.pane().render(), seen)
  for (const name of ['StatusChip', 'Dot', 'StretchPane', 'StretchView', 'DebugView', 'AgentStatus']) {
    assert.ok(seen.includes(name), `rendered ${name}`)
  }
  ctx.dispose()
  host.state.busyBySession.set({})
  host.state.busy.set(false)
})

// ── loader constraints ──────────────────────────────────────────────────────

test('desktop/plugin.js only imports the three allowed specifiers', () => {
  const src = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
  const specs = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1])
  for (const s of specs) assert.ok(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'].includes(s), s)
  assert.doesNotMatch(src, /\bimport\s*\(/, 'no dynamic import()')
  assert.equal(plugin.id, 'stretch-break')
})
