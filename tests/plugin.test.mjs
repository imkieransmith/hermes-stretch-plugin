// register(ctx) against fake host atoms, a fake ctx and a controllable clock.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { clock, fakeCtx, modelOf, renderTree } from './helpers.mjs'
import plugin, { DEV, NECK_TILT, BOX_BREATHING, BREATHER_COOLDOWN_MIN, EXIT_MS, DONE_LINGER_MS, HIDE_DELAY_MS, OFFER_MS, REST_MS } from '../desktop/plugin.js'
import { host } from '@hermes/plugin-sdk'

// Tests exercise the real show/hide behaviour, not the dev "always open" mode.
DEV.keepPaneOpen = false

const busy = map => host.state.busyBySession.set(map)
const HOLD = NECK_TILT.steps[0].ms
/** Start → done for the neck tilt (get ready + every step). */
const PREP_MS_TOTAL = 3_000 + NECK_TILT.steps.reduce((sum, st) => sum + st.ms, 0)

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
  assert.equal(ctx.pane().area, 'composer.underside', 'default: card below the input')
  assert.equal($routine.get().phase, 'offer')
  ctx.advance(OFFER_MS)
  assert.equal($routine.get().phase, 'step', 'countdown → first hold')
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
  ctx.advance(OFFER_MS + 2 * HOLD + REST_MS + 100) // countdown + both reps + rest
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
  ctx.advance(HOLD - 10_000 + REST_MS + HOLD)
  assert.equal($routine.get().phase, 'done')
  ctx.advance(DONE_LINGER_MS - 500)
  assert.ok(ctx.pane(), '"Well done" lingers')
  assert.equal($routine.get().phase, 'done')
  ctx.advance(600)
  assert.equal($closing.get(), true, 'animating out')
  assert.equal($routine.get().phase, 'done', 'still "well done" while it fades')
  ctx.advance(EXIT_MS)
  assert.equal(ctx.pane(), undefined)
  assert.equal($routine.get().phase, 'idle', 'reset once gone')
  ctx.dispose()
})

test('well done: Close leaves at once; it leaves even if the card was opened by hand', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, $closing, actions } = modelOf(ctx)
  actions.showPane() // opened by hand (pinned)
  actions.startStretch()
  ctx.advance(PREP_MS_TOTAL)
  assert.equal($routine.get().phase, 'done')
  renderTree(ctx.pane().render())
  actions.dismissDone()
  assert.equal($closing.get(), true, 'Close: straight to the exit fade')
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.pane(), undefined)

  actions.showPane()
  actions.startStretch()
  ctx.advance(PREP_MS_TOTAL + DONE_LINGER_MS + EXIT_MS + 200)
  assert.equal(ctx.pane(), undefined, 'pinned or not, well done leaves by itself')
  ctx.dispose()
})

test('DEV.keepPaneOpen: well done returns to the offer card, alternating exercises', () => {
  DEV.keepPaneOpen = true
  try {
    const ctx = fakeCtx()
    plugin.register(ctx)
    const { $routine, actions } = modelOf(ctx)
    assert.equal($routine.get().exId, 'neck-side-tilt')
    actions.startStretch()
    ctx.advance(PREP_MS_TOTAL + DONE_LINGER_MS + 200)
    assert.equal($routine.get().phase, 'idle', 'back to the compact card')
    assert.equal($routine.get().exId, 'box-breathing', 'next exercise')
    assert.ok(ctx.pane(), 'never closes in dev')
    actions.notNow()
    assert.equal($routine.get().exId, 'neck-side-tilt', 'hiding also moves on')
    ctx.dispose()
  } finally {
    DEV.keepPaneOpen = false
  }
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
  const ctx = offered({ settings: { placement: 'pane' } })
  const { actions, $routine } = modelOf(ctx)
  assert.equal(ctx.pane().data.height, '50vh')
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
  for (const name of ['StatusChip', 'Dot', 'StretchPane', 'StretchBody', 'StretchCompact', 'StretchLarge', 'RoutineBar', 'Bar', 'Figure', 'StretchDone', 'Tick', 'SoundToggle', 'DebugView', 'SettingsPage']) {
    assert.ok(seen.includes(name), `rendered ${name}`)
  }
  ctx.dispose()
})

// ── PROTOTYPE placements ────────────────────────────────────────────────────

const areasOf = ctx =>
  ctx.contributions
    .filter(c => c.area === 'panes' || (c.area.startsWith('composer.') && c.area !== 'composer.middleware'))
    .map(c => `${c.area}:${c.id}`)
    .sort()

test('placement: below-input card by default; switching to the pane swaps in place', () => {
  const ctx = offered()
  const { actions } = modelOf(ctx)
  assert.deepEqual(areasOf(ctx), ['composer.underside:composer-below'])
  renderTree(ctx.contributions.find(c => c.id === 'composer-below').render())

  actions.nextPlacement()
  assert.deepEqual(areasOf(ctx), ['panes:pane'])
  actions.nextPlacement()
  assert.deepEqual(areasOf(ctx), ['composer.underside:composer-below'], 'cycles back round')

  actions.notNow()
  ctx.advance(EXIT_MS + 100)
  assert.deepEqual(areasOf(ctx), [], 'hiding removes whichever surface is showing')
  actions.updateSettings({ placement: 'pane' })
  assert.deepEqual(areasOf(ctx), [], 'switching while hidden shows nothing')
  ctx.dispose()
})

test('placement: dropped prototypes fall back to the below-input card', () => {
  for (const placement of ['composer', 'pill', 'sidebar', 'nope']) {
    const ctx = fakeCtx({ settings: { placement } })
    plugin.register(ctx)
    assert.equal(modelOf(ctx).$settings.get().placement, 'below')
    ctx.dispose()
  }
})

test('placement: "Show debug panel" switches to the pane', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  ctx.contributions.find(c => c.id === 'debug').data.run()
  assert.equal(ctx.pane().area, 'panes')
  assert.equal(modelOf(ctx).$ui.get().view, 'debug')
  ctx.dispose()
})

test('placement: compact card renders every phase', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { actions } = modelOf(ctx)
  actions.showPane()
  const render = () => renderTree(ctx.contributions.find(c => c.id === 'composer-below').render())
  render() // idle
  actions.startStretch()
  render() // prep
  ctx.advance(3_100)
  render() // hold
  actions.pauseStretch()
  render() // paused
  actions.resumeStretch()
  actions.skipStretch()
  render() // rest
  actions.skipStretch()
  actions.skipStretch()
  render() // done
  ctx.dispose()
})

test('preview offer (⌘K) shows the offer but never starts a cooldown', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  ctx.contributions.find(c => c.id === 'preview').data.run()
  assert.ok(ctx.pane(), 'preview shows the offer')
  modelOf(ctx).actions.notNow()
  assert.equal(ctx.stored().lastBreakAt, undefined)
  ctx.dispose()
})

// ── breathers (tension → box breathing) ─────────────────────────────────────

/** The middleware handler, as the app would call it on send. */
const send = (ctx, text) => {
  const mw = ctx.contributions.find(c => c.area === 'composer.middleware')
  return mw.data.handler({ text, attachments: [] })
}

test('middleware: every draft passes through untouched, and nothing is stored', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  for (const text of ['hello', 'wtf is this', 'WHAT ARE YOU DOING!!!', '']) {
    const draft = { text, attachments: [{ id: 'x' }] }
    const mw = ctx.contributions.find(c => c.area === 'composer.middleware')
    assert.equal(mw.data.handler(draft), draft, 'same object back')
    assert.deepEqual(draft, { text, attachments: [{ id: 'x' }] }, 'not modified')
  }
  const saved = JSON.stringify(ctx.stored())
  assert.doesNotMatch(saved, /wtf|WHAT ARE YOU/, 'message text never persisted')
  const mw = ctx.contributions.find(c => c.area === 'composer.middleware')
  assert.equal(mw.data.handler(undefined), undefined, 'odd drafts never throw')
  assert.equal(mw.data.handler({}).text, undefined)
  ctx.dispose()
})

test('breather: one tense message does nothing; two + Hermes working → box breathing offer', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, $ui } = modelOf(ctx)
  send(ctx, 'wtf')
  busy({ a: true })
  ctx.advance(10_000)
  assert.equal(ctx.pane(), undefined, 'one-off ignored (and no tool → no stretch)')
  busy({})
  ctx.advance(60_000)

  send(ctx, 'what are you doing??')
  busy({ a: true })
  ctx.advance(2_000)
  assert.equal(ctx.pane(), undefined, 'waits ~3 s')
  ctx.advance(1_500)
  assert.ok(ctx.pane(), 'offered')
  assert.equal($ui.get().offered, true)
  assert.equal($routine.get().exId, 'box-breathing')
  assert.equal($routine.get().phase, 'offer')

  ctx.emit('tool.start', { session_id: 'a' })
  ctx.advance(15_000)
  assert.equal($routine.get().exId, 'box-breathing', 'the spell’s stretch offer is replaced')
  ctx.dispose()
})

test('breather: keeps running after Hermes finishes; done starts its own cooldown only', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine } = modelOf(ctx)
  send(ctx, 'ffs')
  send(ctx, 'I told you already')
  busy({ a: true })
  ctx.advance(3_500 + 5_000) // offer + countdown
  assert.equal($routine.get().phase, 'step')
  busy({})
  ctx.advance(10_000)
  assert.equal($routine.get().phase, 'step', 'still breathing')
  ctx.advance(55_000) // 64 s of breathing in all
  assert.equal($routine.get().phase, 'done')
  assert.ok(ctx.stored().lastBreatherAt, 'breather cooldown started')
  assert.equal(ctx.stored().lastBreakAt, undefined, 'stretch cooldown untouched')
  ctx.advance(DONE_LINGER_MS + EXIT_MS + 500)
  assert.equal(ctx.pane(), undefined, 'lingers, then leaves')
  assert.equal($routine.get().phase, 'idle', 'and resets for next time')

  // Within the breather cooldown: another rough patch → no breather, but a
  // long tool task still gets a stretch.
  send(ctx, 'wtf')
  send(ctx, 'are you serious')
  busy({ a: true })
  ctx.advance(1_000)
  ctx.emit('tool.start', { session_id: 'a' })
  ctx.advance(9_500)
  assert.equal($routine.get().exId, 'neck-side-tilt')
  assert.equal($routine.get().phase, 'offer')
  ctx.dispose()
})

test('breather: cooldown expires; Hermes finishing first withdraws it quietly; disabled → nothing', () => {
  const ctx = fakeCtx({ lastBreatherAt: Date.now() - (BREATHER_COOLDOWN_MIN * 60_000 + 1) })
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  send(ctx, 'wtf')
  send(ctx, 'ffs')
  busy({ a: true })
  ctx.advance(3_500)
  assert.equal($routine.get().exId, 'box-breathing', 'cooldown over → offered')
  busy({})
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.pane(), undefined, 'withdrawn')
  assert.equal($routine.get().phase, 'idle')
  assert.equal($routine.get().exId, 'neck-side-tilt', 'back to the default')
  assert.ok(Date.now() - ctx.stored().lastBreatherAt > BREATHER_COOLDOWN_MIN * 60_000, 'no new cooldown')

  actions.updateSettings({ breathersEnabled: false })
  send(ctx, 'wtf')
  send(ctx, 'ffs')
  busy({ a: true })
  ctx.advance(5_000)
  assert.equal(ctx.pane(), undefined, 'detection off')
  ctx.dispose()
})

test('breather: an uptick with no work following expires after 2 minutes', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $tension } = modelOf(ctx)
  send(ctx, 'wtf')
  send(ctx, 'ffs')
  assert.ok($tension.get().armedAt)
  ctx.advance(2 * 60_000 + 500)
  assert.equal($tension.get().armedAt, null)
  busy({ a: true })
  ctx.advance(5_000)
  assert.equal(ctx.pane(), undefined)
  ctx.dispose()
})

test('render: box breathing renders through every phase; ⌘K starts it', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine } = modelOf(ctx)
  const run = id => ctx.contributions.find(c => c.data && c.data.id === `stretch-break.${id}`).data.run()
  run('breathe')
  assert.equal($routine.get().exId, BOX_BREATHING.id)
  assert.equal($routine.get().phase, 'prep')
  while ($routine.get().phase !== 'done') {
    renderTree(ctx.pane().render())
    ctx.advance(2_000)
  }
  renderTree(ctx.pane().render())
  run('preview-breather')
  renderTree(ctx.pane().render())
  ctx.dispose()
})

/** Expand function components into plain elements (stub hooks), for text checks. */
function expand(node) {
  if (Array.isArray(node)) return node.map(expand)
  if (!node || typeof node !== 'object') return node
  if (typeof node.type === 'function') return expand(node.type(node.props || {}))
  return { ...node, props: { ...node.props, children: expand(node.props && node.props.children) } }
}
function texts(node, out = []) {
  if (Array.isArray(node)) node.forEach(n => texts(n, out))
  else if (typeof node === 'string' || typeof node === 'number') out.push(String(node))
  else if (node && node.props) texts(node.props.children, out)
  return out
}

test('card: draws the step that is actually running, even before the driver ticks', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  actions.startExercise(BOX_BREATHING)
  ctx.advance(3_000 + 4_000 - 100) // 0.1 s left of "breathe in"
  assert.equal($routine.get().step, 0)
  // Step boundary passes; the store still holds the finished step.
  clock.t += 150
  assert.equal($routine.get().step, 0, 'driver has not caught up yet')
  const shown = texts(expand(ctx.pane().render()))
  assert.ok(shown.includes('hold'), 'already on the next step')
  assert.ok(shown.includes('1'), 'counting up from 1')
  assert.ok(!shown.includes('0'), 'never a 0')
  ctx.dispose()
})

test('sound: on by default; the card toggle mutes, persists, and turns back on', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $settings, actions } = modelOf(ctx)
  assert.equal($settings.get().soundOn, true)
  actions.toggleSound()
  assert.equal($settings.get().soundOn, false)
  assert.equal(ctx.stored().settings.soundOn, false, 'saved')
  actions.startStretch() // no Web Audio in Node: must not throw
  ctx.advance(5_000)
  actions.toggleSound()
  assert.equal($settings.get().soundOn, true)
  ctx.dispose()
})

