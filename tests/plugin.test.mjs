// register(ctx) against fake host atoms, a fake ctx and a controllable clock.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { clock, fakeCtx, modelOf, renderTree } from './helpers.mjs'
import plugin, { DEV, EXERCISE, EXIT_MS, HIDE_DELAY_MS, OFFER_MS, REST_MS } from '../desktop/plugin.js'
import { host } from '@hermes/plugin-sdk'

// Tests exercise the real show/hide behaviour, not the dev "always open" mode.
DEV.keepPaneOpen = false

const busy = map => host.state.busyBySession.set(map)

beforeEach(() => {
  busy({})
  host.state.busy.set(false)
  host.state.focusedSessionId.set(null)
})

/** Register, start a turn in session `a`, use a tool, and pass the offer delay. */
function offered(stored) {
  const ctx = fakeCtx(stored)
  plugin.register(ctx)
  busy({ a: true })
  ctx.advance(1_000)
  ctx.emit('tool.start', { session_id: 'a' })
  ctx.advance(9_000) // 10s into the turn
  return ctx
}

// ── activity tracking ───────────────────────────────────────────────────────

test('tracks turns per session; focus switches are not transitions', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $activity } = modelOf(ctx)

  busy({ a: true }) // turn starts in A
  host.state.focusedSessionId.set('b') // user switches to B: no busy change
  busy({ a: true, b: true }) // B starts too
  busy({ a: false, b: true }) // A finishes
  busy({ b: false }) // B finishes (A key dropped)

  const kinds = $activity.get().log.map(e => `${e.kind}:${e.sessionId}`)
  assert.deepEqual(kinds, ['start:a', 'start:b', 'finish:a', 'finish:b'])
  assert.equal($activity.get().sessions.a.turns, 1)

  ctx.dispose()
  busy({ a: true })
  assert.equal($activity.get().log.length, 4, 'no updates after dispose')
})

test('a turn already running at load is tracked; clear keeps it', () => {
  busy({ z: true })
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $activity, actions } = modelOf(ctx)
  assert.equal($activity.get().sessions.z.busy, true)
  actions.clear()
  assert.equal($activity.get().log.length, 0)
  assert.equal($activity.get().sessions.z.busy, true)
  ctx.dispose()
})

// ── when to offer ───────────────────────────────────────────────────────────

test('offer: no pane while idle, or for a busy turn that never uses a tool', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  assert.equal(ctx.pane(), undefined)
  busy({ a: true })
  ctx.advance(60_000)
  assert.equal(ctx.pane(), undefined, 'chat-only turn, however long')
  ctx.dispose()
})

test('offer: tool use + 10s → pane with a countdown that starts the stretch', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine } = modelOf(ctx)
  busy({ a: true })
  ctx.emit('tool.start', { session_id: 'a' })
  ctx.advance(9_800)
  assert.equal(ctx.pane(), undefined, 'not before the delay')
  ctx.advance(300)
  assert.ok(ctx.pane(), 'offered at 10s')
  assert.equal(ctx.pane().data.height, '50vh')
  assert.equal($routine.get().phase, 'offer')
  ctx.advance(OFFER_MS)
  assert.equal($routine.get().phase, 'hold', 'countdown → first hold')
  ctx.dispose()
})

test('offer: a short task with a tool ends before the delay → nothing shows', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  busy({ a: true })
  ctx.emit('tool.start')
  ctx.advance(8_000)
  busy({})
  ctx.advance(60_000)
  assert.equal(ctx.pane(), undefined)
  ctx.dispose()
})

test('offer: Hermes finishing during the countdown withdraws it quietly (no cooldown)', () => {
  const ctx = offered()
  const { $routine } = modelOf(ctx)
  assert.equal($routine.get().phase, 'offer')
  busy({})
  assert.equal($routine.get().phase, 'idle')
  ctx.advance(EXIT_MS + 100) // no grace period for a withdrawn offer
  assert.equal(ctx.pane(), undefined)
  assert.equal(ctx.stored().lastBreakAt, undefined, 'no cooldown recorded')

  busy({ a: true }) // next long task offers again
  ctx.emit('tool.start')
  ctx.advance(10_100)
  assert.ok(ctx.pane())
  ctx.dispose()
})

test('offer: "not now" closes at once, starts the cooldown, and is once per spell', () => {
  const ctx = offered()
  const { actions, $settings } = modelOf(ctx)
  actions.notNow()
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.pane(), undefined)
  assert.equal(ctx.stored().lastBreakAt, clock.t - (EXIT_MS + 100))

  actions.updateSettings({ cooldownMin: 0 })
  ctx.advance(30_000)
  assert.equal(ctx.pane(), undefined, 'same busy spell: not offered twice')

  actions.updateSettings({ cooldownMin: $settings.get().cooldownMin || 20 })
  busy({})
  busy({ a: true })
  ctx.emit('tool.start')
  ctx.advance(30_000)
  assert.equal(ctx.pane(), undefined, 'new spell, but within the cooldown')

  busy({})
  ctx.advance(20 * 60_000)
  busy({ a: true })
  ctx.emit('tool.start')
  ctx.advance(10_100)
  assert.ok(ctx.pane(), 'offered again after the cooldown')
  ctx.dispose()
})

test('offer: a completed stretch starts the cooldown, which persists across reloads', () => {
  const ctx = offered()
  ctx.advance(OFFER_MS + 2 * EXERCISE.holdMs + 10_000) // countdown + both reps + rest
  const { $routine } = modelOf(ctx)
  assert.equal($routine.get().phase, 'done')
  const stored = ctx.stored()
  assert.ok(stored.lastBreakAt)
  ctx.dispose()

  busy({})
  const reloaded = offered(stored) // e.g. app restart a minute later
  assert.equal(reloaded.pane(), undefined, 'still cooling down')
  reloaded.dispose()
})

test('offer: auto-start off shows the Start screen; Hermes finishing withdraws it', () => {
  const ctx = offered({ settings: { autoStart: false } })
  const { $routine, $ui } = modelOf(ctx)
  assert.ok(ctx.pane())
  assert.equal($routine.get().phase, 'idle', 'waits for Start')
  assert.equal($ui.get().offered, true)
  busy({})
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.pane(), undefined)
  ctx.dispose()
})

test('offer: paused offers never auto-show; the chip still opens the pane', () => {
  const ctx = offered({ settings: { offersEnabled: false } })
  assert.equal(ctx.pane(), undefined)
  modelOf(ctx).actions.togglePane()
  assert.ok(ctx.pane())
  ctx.dispose()
})

// ── stretch in progress / closing ───────────────────────────────────────────

test('a stretch underway keeps the pane after Hermes finishes; done → linger → leave', () => {
  const ctx = offered()
  const { $routine, $closing } = modelOf(ctx)
  ctx.advance(OFFER_MS) // into the first hold
  busy({}) // Hermes done mid-stretch
  ctx.advance(10_000)
  assert.ok(ctx.pane(), 'stays while stretching')

  // 10s left of hold 1, the switch, then hold 2 → exactly done.
  ctx.advance(EXERCISE.holdMs - 10_000 + REST_MS + EXERCISE.holdMs)
  assert.equal($routine.get().phase, 'done')
  ctx.advance(HIDE_DELAY_MS - 500)
  assert.ok(ctx.pane(), '"Nice one" lingers')
  ctx.advance(600)
  assert.equal($closing.get(), true, 'animating out')
  ctx.advance(EXIT_MS)
  assert.equal(ctx.pane(), undefined)
  ctx.dispose()
})

test('stop closes immediately (exit fade only) and resets the routine', () => {
  const ctx = offered()
  const { actions, $routine, $closing } = modelOf(ctx)
  ctx.advance(OFFER_MS)
  actions.stopStretch()
  assert.equal($routine.get().phase, 'idle')
  assert.equal($closing.get(), true)
  ctx.advance(EXIT_MS)
  assert.equal(ctx.pane(), undefined)
  ctx.dispose()
})

test('chip toggle pins the pane open while idle; reopening mid-exit cancels the exit', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { actions, $ui, $closing } = modelOf(ctx)
  actions.togglePane()
  assert.ok(ctx.pane(), 'pinned open while idle')
  ctx.advance(60_000)
  assert.ok(ctx.pane(), 'pinned pane does not auto-hide')
  actions.togglePane()
  assert.equal($closing.get(), true)
  actions.togglePane() // changed my mind
  assert.equal($closing.get(), false)
  ctx.advance(EXIT_MS * 2)
  assert.ok(ctx.pane())

  ctx.contributions.find(c => c.id === 'debug').data.run()
  assert.equal($ui.get().view, 'debug')
  ctx.dispose()
})

test('DEV.keepPaneOpen keeps the pane up while idle and after stop', () => {
  DEV.keepPaneOpen = true
  try {
    const ctx = fakeCtx()
    plugin.register(ctx)
    assert.ok(ctx.pane(), 'open while idle')
    modelOf(ctx).actions.stopStretch()
    ctx.advance(10_000)
    assert.ok(ctx.pane(), 'still open after stop')
    ctx.dispose()
  } finally {
    DEV.keepPaneOpen = false
  }
})

// ── settings ────────────────────────────────────────────────────────────────

test('settings: page registered; updates are normalised and persisted', () => {
  const ctx = fakeCtx({ settings: { cooldownMin: 45, junk: true } })
  plugin.register(ctx)
  assert.equal(ctx.settingsPages.length, 1)
  assert.equal(ctx.settingsPages[0].title, 'Stretch Break')
  const { $settings, actions } = modelOf(ctx)
  assert.equal($settings.get().cooldownMin, 45)
  assert.equal($settings.get().junk, undefined)
  actions.updateSettings({ autoStart: false, offerDelaySec: -1 })
  assert.equal(ctx.stored().settings.autoStart, false)
  assert.equal(ctx.stored().settings.offerDelaySec, 10, 'invalid value ignored')
  ctx.contributions.find(c => c.id === 'offers').data.run()
  assert.equal($settings.get().offersEnabled, false, '⌘K pause offers')
  ctx.dispose()
})

// ── render smoke test ───────────────────────────────────────────────────────

test('render: chip, every pane phase, debug view and settings page render', () => {
  host.state.busy.set(true)
  host.state.focusedSessionId.set('a')
  const ctx = offered()
  const { actions, $routine } = modelOf(ctx)
  const seen = []
  const pane = () => renderTree(ctx.pane().render(), seen)
  renderTree(ctx.contributions.find(c => c.id === 'chip').render(), seen)
  pane() // offer
  actions.stopStretch()
  actions.togglePane()
  pane() // idle (Start)
  actions.startStretch()
  pane() // prep
  actions.skipStretch()
  actions.pauseStretch()
  pane() // hold, paused
  actions.skipStretch()
  pane() // rest
  actions.skipStretch()
  actions.skipStretch()
  assert.equal($routine.get().phase, 'done')
  pane() // done
  actions.setView('debug')
  pane()
  renderTree(ctx.settingsPages[0].render(), seen)
  for (const name of ['StatusChip', 'Dot', 'StretchPane', 'StretchView', 'Ring', 'RepDots', 'DebugView', 'AgentStatus', 'SettingsPage']) {
    assert.ok(seen.includes(name), `rendered ${name}`)
  }
  ctx.dispose()
})
