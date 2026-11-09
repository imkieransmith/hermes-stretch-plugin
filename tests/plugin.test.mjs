// register(ctx) against fake host atoms, a fake ctx and a controllable clock.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { clock, fakeCtx, modelOf, renderTree } from './helpers.mjs'
import plugin from '../src/plugin.jsx'
import { DONE_LINGER_MS, EXIT_MS, HIDE_DELAY_MS } from '../src/config.js'
import { BOX_BREATHING, EXERCISES, NECK_TILT } from '../src/exercises/index.js'
import { BREATHER_COOLDOWN_MIN } from '../src/policy.js'
import { PREP_MS, REST_MS } from '../src/timing.js'
import { STALLED_MS, routineMs } from '../src/routine.js'
import { sessionOf } from '../src/session.js'
import { lengthText, menuPlan, planMenu } from '../src/plan-session.js'
import { OFFER_TILE_PX, OfferLayout } from '../src/ui/OfferLayout.jsx'
import { EXERCISE_TILE_PX, TileRow, tileSize } from '../src/ui/tile.jsx'
import { Figure } from '../src/ui/parts.jsx'
import { FIGURE_ART } from '../src/figure-art.js'
import { DONE_FIGURE, OFFER_FIGURE } from '../src/figures.js'
import { DONE_NEXT } from '../src/ui/StretchDone.jsx'
import { Button, host } from '@hermes/plugin-sdk'

const busy = map => host.state.busyBySession.set(map)
const HOLD = NECK_TILT.steps[0].ms
/** Start → done for the neck tilt (get ready + every step). */
const PREP_MS_TOTAL = PREP_MS + NECK_TILT.steps.reduce((sum, st) => sum + st.ms, 0)
/** Start → done for the `length` session the card offers (its picks, the eye closer, breathing: on by default). */
const sessionMs = (ctx, length = 'short') => routineMs(sessionOf(menuPlan(modelOf(ctx).$ui.get().menu, length, true)))
/** A breather: one breathing exercise with no holds. */
const isBreather = plan => plan.length === 1 && EXERCISES[plan[0]].type === 'breathing' && EXERCISES[plan[0]].breather

beforeEach(() => {
  busy({})
  host.state.busy.set(false)
  host.state.focusedSessionId.set(null)
})

/** Register, start a turn in session `a`, use a tool, and pass the offer delay. */
function offered(stored = {}) {
  const ctx = fakeCtx(stored)
  plugin.register(ctx)
  busy({ a: true })
  ctx.advance(1_000)
  ctx.emit('tool.start', { session_id: 'a' })
  ctx.advance(9_000) // 10s into the turn
  return ctx
}

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

// ── when to offer ───────────────────────────────────────────────────────────

test('offer: no card while idle, or for a busy turn that never uses a tool', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  assert.equal(ctx.card(), undefined)
  busy({ a: true })
  ctx.advance(60_000)
  assert.equal(ctx.card(), undefined, 'chat-only turn, however long')
  ctx.dispose()
})

test('offer: tool use + 10s → the session picker, which never starts by itself', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, $ui, actions } = modelOf(ctx)
  busy({ a: true })
  ctx.emit('tool.start', { session_id: 'a' })
  ctx.advance(9_800)
  assert.equal(ctx.card(), undefined, 'not before the delay')
  ctx.advance(300)
  assert.ok(ctx.card(), 'offered at 10s')
  assert.equal($routine.get().phase, 'idle')
  assert.equal($routine.get().picker, true)
  assert.equal($ui.get().offered, true)
  assert.doesNotMatch(texts(expand(ctx.card().render())).join(' '), /\(\d\)/, 'no countdown')
  ctx.advance(5 * 60_000)
  assert.equal($routine.get().phase, 'idle', 'still waiting for a pick, however long')
  assert.ok(ctx.card())
  actions.startSession('medium')
  assert.equal($routine.get().phase, 'prep', 'a pick → get ready')
  ctx.advance(PREP_MS + 200) // + one driver tick
  assert.equal($routine.get().phase, 'step')
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
  assert.equal(ctx.card(), undefined)
  ctx.dispose()
})

test('offer: Hermes finishing before you pick withdraws it quietly (no cooldown)', () => {
  const ctx = offered()
  const { $routine, $ui } = modelOf(ctx)
  assert.equal($ui.get().offered, true)
  busy({})
  assert.equal($routine.get().phase, 'idle')
  ctx.advance(EXIT_MS + 100) // no grace period for a withdrawn offer
  assert.equal(ctx.card(), undefined)
  assert.equal(ctx.stored().lastBreakAt, undefined, 'no cooldown recorded')

  busy({ a: true }) // next long task offers again
  ctx.emit('tool.start')
  ctx.advance(10_100)
  assert.ok(ctx.card())
  ctx.dispose()
})

test('offer: "not now" closes at once, starts the cooldown, and is once per spell', () => {
  const ctx = offered()
  const { actions, $settings } = modelOf(ctx)
  actions.notNow()
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.card(), undefined)
  assert.equal(ctx.stored().lastBreakAt, clock.t - (EXIT_MS + 100))

  actions.updateSettings({ cooldownMin: 0 })
  ctx.advance(30_000)
  assert.equal(ctx.card(), undefined, 'same busy spell: not offered twice')

  actions.updateSettings({ cooldownMin: $settings.get().cooldownMin || 20 })
  busy({})
  busy({ a: true })
  ctx.emit('tool.start')
  ctx.advance(30_000)
  assert.equal(ctx.card(), undefined, 'new spell, but within the cooldown')

  busy({})
  ctx.advance(20 * 60_000)
  busy({ a: true })
  ctx.emit('tool.start')
  ctx.advance(10_100)
  assert.ok(ctx.card(), 'offered again after the cooldown')
  ctx.dispose()
})

test('offer: a completed stretch starts the cooldown, which persists across reloads', () => {
  const ctx = offered()
  const { $routine, actions } = modelOf(ctx)
  actions.startSession('short')
  ctx.advance(sessionMs(ctx) + 100)
  assert.equal($routine.get().phase, 'done')
  const stored = ctx.stored()
  assert.ok(stored.lastBreakAt)
  ctx.dispose()

  busy({})
  const reloaded = offered(stored) // e.g. app restart a minute later
  assert.equal(reloaded.card(), undefined, 'still cooling down')
  reloaded.dispose()
})

test('offer: paused offers never auto-show; ⌘K still opens the card', () => {
  const ctx = offered({ settings: { offersEnabled: false } })
  assert.equal(ctx.card(), undefined)
  ctx.contributions.find(c => c.area === 'palette').data.run()
  assert.ok(ctx.card())
  assert.equal(modelOf(ctx).$routine.get().phase, 'idle', 'the session picker')
  ctx.dispose()
})

test('⌘K: opens the session picker (no countdown), which stays until a pick or Not now', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, $ui, actions } = modelOf(ctx)
  const open = () => ctx.contributions.find(c => c.area === 'palette').data.run()
  open()
  assert.ok(ctx.card())
  assert.equal($routine.get().phase, 'idle')
  assert.equal($routine.get().picker, true)
  const shown = texts(expand(ctx.card().render())).join(' ')
  assert.ok(shown.includes(lengthText('medium')))
  assert.doesNotMatch(shown, /\(\d\)/, 'no countdown')
  ctx.advance(60_000)
  assert.ok(ctx.card(), 'stays up while you decide')
  actions.notNow()
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.card(), undefined)
  assert.equal(ctx.stored().lastBreakAt, undefined, 'hiding what you opened is not a declined offer')

  open()
  actions.startSession('short')
  ctx.advance(sessionMs(ctx) + 200) // + one driver tick
  assert.equal($routine.get().phase, 'done')
  ctx.advance(DONE_LINGER_MS + EXIT_MS + 200)
  assert.equal(ctx.card(), undefined, 'well done still leaves by itself')
  assert.equal($ui.get().opened, false)
  ctx.dispose()
})

test('offer layout: the same element tree narrow or wide (the text is never remounted)', () => {
  // Swapping the outer element at the breakpoint remounted the text, and the
  // tile went on sizing itself from the old (detached) element's height.
  const props = { figure: 'a/b', title: 't', copy: 'c', buttons: [] }
  for (const stacked of [false, true]) {
    const el = OfferLayout({ ...props, stacked })
    assert.equal(el.type, TileRow, `stacked ${stacked}: through TileRow`)
    assert.equal(el.props.stacked, stacked)
  }
  const narrow = TileRow({ figure: null, stacked: true, text: 'x' })
  const wide = TileRow({ figure: null, stacked: false, text: 'x' })
  const kids = el => [].concat(el.props.children)
  assert.equal(kids(narrow)[0].type, kids(wide)[0].type, 'narrow: the artwork too, stacked above')
  assert.equal(kids(narrow)[0].props.stacked, true, 'spanning the column')
  assert.equal(kids(narrow)[1].type, kids(wide)[1].type, 'the column sits in the same slot')
  const edge = kids(wide).at(-1)
  assert.equal(edge.type.name, 'DitherEdge', 'the left dither is last (no slot shift)')
  assert.equal(edge.props.tile, kids(wide)[0].props.size, 'its hole is the tile’s size (the tile’s fill is translucent)')
})

test('offer layout: the picker and the breather are the same height side by side', () => {
  const { size } = OfferLayout({ figure: null, title: 't', copy: 'c', buttons: [], stacked: false }).props
  assert.equal(size, OFFER_TILE_PX, 'before measuring')
  // Text heights measured in Chromium: picker 140 px (two lines of copy,
  // buttons, tick box), breather 108 px. Both get the same tile.
  assert.equal(tileSize(140, OFFER_TILE_PX), tileSize(108, OFFER_TILE_PX))
  assert.ok(OFFER_TILE_PX >= 140, 'the picker’s text fits the shared tile')
  assert.equal(tileSize(220, OFFER_TILE_PX), 220, 'taller text (bigger text scale) grows it')
  assert.equal(tileSize(900, OFFER_TILE_PX), 280, 'capped')
})

test('exercise text: the same height for every exercise (a label line under the bar, two lines of safety)', () => {
  // Overhead side bend (Left / Switch / Right under its bar) was a line
  // taller than seated adductor (no sides): the card's height and its
  // buttons moved between them, under your cursor.
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  const shape = node => {
    // Every element's type and sizing style, text left out.
    if (Array.isArray(node)) return node.map(shape).filter(n => n !== null)
    if (!node || typeof node !== 'object') return null
    if (typeof node.type === 'function') return shape(node.type(node.props || {}))
    const { fontSize, lineHeight, minHeight, height, marginTop } = (node.props && node.props.style) || {}
    // The countdown is one line (lineHeight 1) whatever its digits (some pad a dimmed zero).
    const kids = fontSize === 56 ? null : shape(node.props && node.props.children)
    return [node.type, fontSize, lineHeight, minHeight, height, marginTop, kids]
  }
  const shapes = new Map()
  for (const ex of Object.values(EXERCISES)) {
    actions.startExercise(ex)
    actions.skip() // into the first step
    const s = $routine.get()
    const ses = sessionOf(s)
    // One segment's worth of bar, so exercises with more rounds compare equal.
    const tree = expand(ctx.card().render())
    const bar = findGroup(tree)
    bar.props.children = [].concat(bar.props.children).slice(0, 1)
    shapes.set(ex.id, JSON.stringify(shape(tree)))
    assert.ok(ses.parts[0].safety, `${ex.id}: has a safety line`)
    actions.stop()
    ctx.advance(EXIT_MS + 100)
  }
  const [first] = shapes.values()
  for (const [id, sh] of shapes) assert.equal(sh, first, `${id}: same layout as ${[...shapes.keys()][0]}`)
  ctx.dispose()
})

/** The routine bar's element (role="group") in an expanded tree. */
function findGroup(node) {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findGroup(n)
      if (hit) return hit
    }
    return null
  }
  if (!node || typeof node !== 'object' || !node.props) return null
  if (node.props.role === 'group') return node
  return findGroup(node.props.children)
}

/** The size of every figure tile in a rendered tree. */
function tileSizes(node, out = []) {
  if (Array.isArray(node)) node.forEach(n => tileSizes(n, out))
  else if (node && typeof node === 'object') {
    if (typeof node.type === 'function') {
      if (node.type.name === 'FigureTile') out.push(node.props.size)
      tileSizes(node.type(node.props || {}), out)
    } else tileSizes(node.props && node.props.children, out)
  }
  return out
}

test('exercise tile: the same size for every exercise and step, and well done', () => {
  // It followed the text column's height, so it shrank for an exercise
  // with no labels under its bar (slow blinks).
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  const sizes = new Set()
  for (const ex of Object.values(EXERCISES)) {
    actions.startExercise(ex)
    for (let i = 0; i < 3 && $routine.get().phase !== 'done'; i++) {
      tileSizes(ctx.card().render()).forEach(n => sizes.add(n))
      actions.skip()
    }
    while ($routine.get().phase !== 'done') actions.skip()
    tileSizes(ctx.card().render()).forEach(n => sizes.add(n))
    actions.dismissDone()
    ctx.advance(EXIT_MS + 100)
  }
  assert.deepEqual([...sizes], [EXERCISE_TILE_PX])
  ctx.dispose()
})

test('⌘K breathing: box breathing on its own, no countdown; Not now is no cooldown; done is a breather', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  const breathe = () => ctx.contributions.find(c => c.data && c.data.id === 'openchi.breathe').data.run()
  breathe()
  assert.ok(ctx.card())
  assert.ok(isBreather($routine.get().plan), 'a breathing exercise with no holds')
  assert.equal($routine.get().picker, false)
  assert.equal($routine.get().phase, 'idle', 'no countdown')
  const shown = texts(expand(ctx.card().render())).join(' ')
  assert.match(shown, /Take a breather\?/)
  assert.match(shown, /Start ~1m/)
  assert.match(shown, /Not now/)
  assert.doesNotMatch(shown, /Box breathing|4-4-4-4/, 'about breathing in general')
  ctx.advance(60_000)
  assert.ok(ctx.card(), 'stays up while you decide')
  actions.notNow()
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.card(), undefined)
  assert.equal(ctx.stored().lastBreatherAt, undefined, 'hiding what you opened is not a declined offer')

  breathe()
  actions.start()
  ctx.advance(routineMs(sessionOf($routine.get())) + 200)
  assert.equal($routine.get().phase, 'done')
  assert.ok(ctx.stored().lastBreatherAt, 'counts as a breather')
  assert.equal(ctx.stored().lastBreakAt, undefined)
  ctx.dispose()
})

test('⌘K: leaves an exercise or the same card alone; switches between picker and breathing', () => {
  const ctx = offered()
  const { $routine, $ui, actions } = modelOf(ctx)
  const open = () => ctx.contributions.find(c => c.area === 'palette').data.run()
  const breathe = () => ctx.contributions.find(c => c.data && c.data.id === 'openchi.breathe').data.run()
  const offer = $routine.get()
  open()
  assert.equal($routine.get(), offer, 'the picker already up: untouched')
  breathe()
  assert.ok(isBreather($routine.get().plan), 'asked for breathing: switches')
  assert.equal($ui.get().offered, false, 'yours now: Not now starts no cooldown')
  const breathing = $routine.get()
  breathe()
  assert.equal($routine.get(), breathing, 'already up: untouched')
  open()
  assert.equal($routine.get().picker, true, 'and back to the picker')
  actions.startSession('short')
  ctx.advance(1_000)
  const running = $routine.get()
  open()
  breathe()
  assert.equal($routine.get(), running, 'exercise untouched')
  ctx.dispose()
})

// ── stretch in progress / closing ───────────────────────────────────────────

test('a stretch underway keeps the card after Hermes finishes; done → linger → leave', () => {
  const ctx = offered()
  const { $routine, $closing, actions } = modelOf(ctx)
  actions.startSession('short')
  ctx.advance(PREP_MS) // into the first hold
  busy({}) // Hermes done mid-stretch
  ctx.advance(10_000)
  assert.ok(ctx.card(), 'stays while stretching')

  // The rest of the session → exactly done.
  ctx.advance(sessionMs(ctx) - PREP_MS - 10_000)
  assert.equal($routine.get().phase, 'done')
  ctx.advance(DONE_LINGER_MS - 500)
  assert.ok(ctx.card(), '"Well done" lingers')
  assert.equal($routine.get().phase, 'done')
  ctx.advance(600)
  assert.equal($closing.get(), true, 'animating out')
  assert.equal($routine.get().phase, 'done', 'still "well done" while it fades')
  ctx.advance(EXIT_MS)
  assert.equal(ctx.card(), undefined)
  assert.equal($routine.get().phase, 'idle', 'reset once gone')
  ctx.dispose()
})

test('well done: Close leaves at once; it leaves by itself after a direct start too', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, $closing, actions } = modelOf(ctx)
  actions.startExercise(NECK_TILT) // started by hand

  ctx.advance(PREP_MS_TOTAL)
  assert.equal($routine.get().phase, 'done')
  renderTree(ctx.card().render())
  const text = []
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (typeof n === 'string') return text.push(n)
    if (!n || typeof n !== 'object') return
    if (typeof n.type === 'function') return walk(n.type(n.props || {}))
    walk(n.props && n.props.children)
  }
  walk(ctx.card().render())
  assert.ok(text.includes('All done') && text.includes(DONE_NEXT), 'done: heading + the get-up nudge')
  actions.dismissDone()
  assert.equal($closing.get(), true, 'Close: straight to the exit fade')
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.card(), undefined)

  actions.startExercise(NECK_TILT)
  ctx.advance(PREP_MS_TOTAL + DONE_LINGER_MS + EXIT_MS + 200)
  assert.equal(ctx.card(), undefined, 'well done leaves by itself')
  ctx.dispose()
})

test('stop: the card starts fading out before the routine resets (it fades out as it was)', () => {
  const ctx = offered()
  const { actions, $routine, $closing } = modelOf(ctx)
  actions.startSession('short')
  ctx.advance(PREP_MS + 1_000) // mid-stretch
  const order = []
  $closing.listen(c => c && order.push('closing'))
  $routine.listen(r => order.push(r.phase))
  actions.stop()
  assert.deepEqual(order, ['closing', 'idle'])
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.card(), undefined)
  ctx.dispose()
})

test('withdrawn offer: fades out showing the offer, then resets', () => {
  const ctx = offered()
  const { $routine, $closing } = modelOf(ctx)
  const order = []
  $closing.listen(c => c && order.push('closing'))
  $routine.listen(r => order.push(r.phase))
  busy({})
  assert.deepEqual(order, ['closing', 'idle'])
  ctx.dispose()
})

test('⌘K while the card fades out: it comes back once the fade ends', () => {
  const ctx = offered()
  const { actions } = modelOf(ctx)
  actions.notNow()
  ctx.contributions.find(c => c.area === 'palette').data.run()
  ctx.advance(EXIT_MS + 100)
  assert.ok(ctx.card(), 'opened again')
  ctx.dispose()
})

test('sleep mid-exercise: the session stops on waking (no race to "All done"), as Stop does', () => {
  const ctx = offered()
  const { actions, $routine, $closing } = modelOf(ctx)
  actions.startSession('long')
  ctx.advance(PREP_MS + 3_000) // mid-stretch
  const before = $routine.get()
  const phases = []
  $routine.listen(r => phases.push(r.phase))

  clock.t += 45 * 60_000 // the lid closes: no timers run
  const shown = texts(expand(ctx.card().render()))
  assert.ok(!shown.includes('All done'), 'the card does not fast-forward either')
  assert.ok(shown.includes(sessionOf(before).parts[0].name), 'still the exercise it was on')

  const woke = clock.t
  ctx.advance(200) // awake: the driver's next tick
  assert.deepEqual(phases, ['idle'], 'stopped: never stepped through the rest, never "done"')
  assert.equal($closing.get(), true, 'the card leaves')
  assert.ok(ctx.stored().lastBreakAt > woke, 'counts as a break (from when you woke it), like Stop')
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.card(), undefined)

  // Paused over the sleep: still paused on waking, nothing lost.
  actions.open()
  actions.startSession('short')
  ctx.advance(PREP_MS + 1_000)
  actions.pause()
  clock.t += 45 * 60_000
  ctx.advance(1_000)
  assert.equal($routine.get().phase, 'step')
  assert.notEqual($routine.get().pausedAt, null)

  // A short stall (well under STALLED_MS) just catches up.
  actions.resume()
  const step = $routine.get().step
  clock.t += STALLED_MS / 2
  ctx.advance(200)
  assert.ok(['step', 'done'].includes($routine.get().phase))
  assert.ok($routine.get().step >= step)
  ctx.dispose()
})

test('stop closes immediately (exit fade only) and resets the routine', () => {
  const ctx = offered()
  const { actions, $routine, $closing } = modelOf(ctx)
  actions.startSession('short')
  actions.stop()
  assert.equal($routine.get().phase, 'idle')
  assert.equal($closing.get(), true)
  ctx.advance(EXIT_MS)
  assert.equal(ctx.card(), undefined)
  ctx.dispose()
})

test('Hermes starting again mid-exit cancels the exit', () => {
  const ctx = offered()
  const { $closing } = modelOf(ctx)
  modelOf(ctx).actions.startSession('short')
  ctx.advance(sessionMs(ctx)) // done
  ctx.advance(DONE_LINGER_MS + 50)
  assert.equal($closing.get(), true, 'fading out')
  modelOf(ctx).actions.startExercise(NECK_TILT) // changed my mind
  assert.equal($closing.get(), false)
  ctx.advance(EXIT_MS * 2)
  assert.ok(ctx.card())
  ctx.dispose()
})

// ── settings ────────────────────────────────────────────────────────────────

test('settings: page registered; updates are normalised and persisted', () => {
  const ctx = fakeCtx({ settings: { cooldownMin: 45, junk: true } })
  plugin.register(ctx)
  assert.equal(ctx.settingsPages.length, 1)
  assert.equal(ctx.settingsPages[0].title, 'OpenChi')
  const { $settings, actions } = modelOf(ctx)
  assert.equal($settings.get().cooldownMin, 45)
  assert.equal($settings.get().junk, undefined)
  actions.updateSettings({ soundOn: false, offerDelaySec: -1 })
  assert.equal(ctx.stored().settings.soundOn, false)
  assert.equal(ctx.stored().settings.offerDelaySec, 10, 'invalid value ignored')
  ctx.dispose()
})

// ── render smoke test ───────────────────────────────────────────────────────

test('render: every card phase and the settings page render', () => {
  const ctx = offered()
  const { actions, $routine } = modelOf(ctx)
  const seen = []
  const card = () => renderTree(ctx.card().render(), seen)
  card() // offer
  busy({})
  busy({ b: true })
  actions.updateSettings({ cooldownMin: 0 })
  ctx.emit('tool.start')
  ctx.advance(10_100)
  assert.equal($routine.get().phase, 'idle')
  card() // offered, waiting for a pick
  actions.startSession('short')
  card() // prep
  actions.skip()
  actions.pause()
  card() // hold, paused
  actions.skip()
  card() // rest
  actions.skip()
  actions.skip()
  card() // next up
  while ($routine.get().phase !== 'done') actions.skip()
  card() // done
  renderTree(ctx.settingsPages[0].render(), seen)
  for (const name of ['ComposerCard', 'StretchBody', 'SessionPicker', 'StretchLarge', 'RoutineBar', 'Bar', 'Figure', 'StretchDone', 'Tick', 'SoundToggle', 'DitherPanel', 'DitherEdge', 'SettingsPage']) {
    assert.ok(seen.includes(name), `rendered ${name}`)
  }
  ctx.dispose()
})

test('the card is the only surface: below the input; two ⌘K commands', () => {
  const ctx = offered({ settings: { placement: 'pane' } })
  const surfaces = ctx.contributions.filter(c => c.area === 'panes' || c.area.startsWith('statusBar') || (c.area.startsWith('composer.') && c.area !== 'composer.middleware'))
  assert.deepEqual(surfaces.map(c => `${c.area}:${c.id}`), ['composer.underside:composer-below'])
  assert.equal(modelOf(ctx).$settings.get().placement, undefined, 'old placement setting dropped')
  assert.deepEqual(
    ctx.contributions.filter(c => c.area === 'palette').map(c => c.data.label),
    ['OpenChi: Start stretch session', 'OpenChi: Start breathing session']
  )
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

test('breather: one tense message does nothing; two clear ones + Hermes working → box breathing offer', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, $ui } = modelOf(ctx)
  send(ctx, 'wtf, I told you already')
  busy({ a: true })
  ctx.advance(10_000)
  assert.equal(ctx.card(), undefined, 'one-off ignored (and no tool → no stretch)')
  busy({})
  ctx.advance(60_000)

  send(ctx, 'what are you doing?!')
  busy({ a: true })
  ctx.advance(2_000)
  assert.equal(ctx.card(), undefined, 'waits ~3 s')
  ctx.advance(1_500)
  assert.ok(ctx.card(), 'offered')
  assert.equal($ui.get().offered, true)
  const breather = $routine.get().plan
  assert.ok(isBreather(breather), 'a breathing exercise with no holds')
  assert.equal($routine.get().picker, false, 'its own offer, not the picker')
  assert.equal($routine.get().phase, 'idle', 'waits for Start')
  assert.ok(renderTree(ctx.card().render()).includes('StretchCompact'))
  const shown = texts(expand(ctx.card().render())).join(' | ')
  assert.match(shown, /Take a breather\?/)
  assert.match(shown, /Start ~1m/)
  assert.doesNotMatch(shown, /\(\d\)/, 'no countdown')
  assert.match(shown, /Not now/)

  ctx.emit('tool.start', { session_id: 'a' })
  ctx.advance(15_000)
  assert.deepEqual($routine.get().plan, breather, 'the spell’s stretch offer is replaced')
  ctx.dispose()
})

test('breather: keeps running after Hermes finishes; done starts its own cooldown only', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine } = modelOf(ctx)
  send(ctx, 'ffs, I told you already')
  send(ctx, 'are you serious?!')
  busy({ a: true })
  ctx.advance(3_500) // offered
  modelOf(ctx).actions.start()
  ctx.advance(PREP_MS + 200) // + one driver tick
  assert.equal($routine.get().phase, 'step')
  busy({})
  ctx.advance(10_000)
  assert.equal($routine.get().phase, 'step', 'still breathing')
  ctx.advance(55_000) // 64 s of breathing in all
  assert.equal($routine.get().phase, 'done')
  assert.ok(ctx.stored().lastBreatherAt, 'breather cooldown started')
  assert.equal(ctx.stored().lastBreakAt, undefined, 'stretch cooldown untouched')
  ctx.advance(DONE_LINGER_MS + EXIT_MS + 500)
  assert.equal(ctx.card(), undefined, 'lingers, then leaves')
  assert.equal($routine.get().phase, 'idle', 'and resets for next time')

  // Within the breather cooldown: another rough patch → no breather, but a
  // long tool task still gets a stretch.
  send(ctx, 'wtf, are you serious')
  send(ctx, 'I told you already!!!')
  busy({ a: true })
  ctx.advance(1_000)
  ctx.emit('tool.start', { session_id: 'a' })
  ctx.advance(9_500)
  assert.equal($routine.get().picker, true, 'the session picker')
  assert.equal(modelOf(ctx).$ui.get().offered, true)
  ctx.dispose()
})

test('breather: cooldown expires; Hermes finishing first withdraws it quietly; disabled → nothing', () => {
  const ctx = fakeCtx({ lastBreatherAt: Date.now() - (BREATHER_COOLDOWN_MIN * 60_000 + 1) })
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  send(ctx, 'wtf, I told you already')
  send(ctx, 'are you serious?!')
  busy({ a: true })
  ctx.advance(3_500)
  assert.ok(isBreather($routine.get().plan), 'cooldown over → offered')
  busy({})
  ctx.advance(EXIT_MS + 100)
  assert.equal(ctx.card(), undefined, 'withdrawn')
  assert.equal($routine.get().phase, 'idle')
  assert.equal($routine.get().picker, true, 'back to the picker')
  assert.ok(Date.now() - ctx.stored().lastBreatherAt > BREATHER_COOLDOWN_MIN * 60_000, 'no new cooldown')

  actions.updateSettings({ breathersEnabled: false })
  send(ctx, 'wtf, I told you already')
  send(ctx, 'are you serious?!')
  busy({ a: true })
  ctx.advance(5_000)
  assert.equal(ctx.card(), undefined, 'detection off')
  ctx.dispose()
})

test('breather: an uptick with no work following expires after 2 minutes', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  send(ctx, 'wtf, I told you already')
  send(ctx, 'are you serious?!')
  ctx.advance(2 * 60_000 + 500)
  busy({ a: true })
  ctx.advance(5_000)
  assert.equal(ctx.card(), undefined)
  ctx.dispose()
})

test('render: box breathing renders through every phase', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  actions.startExercise(BOX_BREATHING)
  assert.deepEqual($routine.get().plan, [BOX_BREATHING.id])
  assert.equal($routine.get().phase, 'prep')
  while ($routine.get().phase !== 'done') {
    renderTree(ctx.card().render())
    ctx.advance(2_000)
  }
  renderTree(ctx.card().render())
  ctx.dispose()
})

test('card: draws the step that is actually running, even before the driver ticks', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  actions.startExercise(BOX_BREATHING)
  ctx.advance(PREP_MS + 4_000 - 100) // 0.1 s left of "breathe in"
  assert.equal($routine.get().step, 0)
  // Step boundary passes; the store still holds the finished step.
  clock.t += 150
  assert.equal($routine.get().step, 0, 'driver has not caught up yet')
  const shown = texts(expand(ctx.card().render()))
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
  actions.startSession('short') // no Web Audio in Node: must not throw
  ctx.advance(5_000)
  actions.toggleSound()
  assert.equal($settings.get().soundOn, true)
  ctx.dispose()
})


// ── sessions ────────────────────────────────────────────────────────────────

test('picker: estimates, all alike; a pick starts its planned exercises', () => {
  const ctx = offered()
  const { $routine, $ui, actions } = modelOf(ctx)
  const { menu } = $ui.get()
  assert.deepEqual(
    ['short', 'medium', 'long'].map(id => menu[id].length),
    [2, 4, 6],
    'body exercises per length'
  )
  const shown = texts(expand(ctx.card().render())).join(' | ')
  for (const id of ['short', 'medium', 'long']) assert.ok(shown.includes(lengthText(id)), lengthText(id))
  assert.doesNotMatch(shown, /\(\d\)/, 'no countdown')
  assert.match(shown, /Not now/)
  const picker = ctx.card().render()
  const variants = []
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    if (n.type === Button) variants.push(n.props.variant)
    walk(typeof n.type === 'function' ? n.type(n.props || {}) : n.props && n.props.children)
  }
  walk(picker)
  assert.deepEqual(variants, ['secondary', 'secondary', 'secondary', 'outline'], 'no length is the recommended one; Not now')
  actions.startSession('long')
  assert.equal($routine.get().phase, 'prep')
  assert.equal($routine.get().length, 'long')
  assert.deepEqual($routine.get().plan, [...menu.long, menu.eyes, menu.windDown], 'the picks it was offered with')
  ctx.dispose()
})

test('breathing at the end: on by default; unticking drops it, and persists', () => {
  const ctx = offered()
  const { $routine, $ui, $settings, actions } = modelOf(ctx)
  const { menu } = $ui.get()
  assert.equal($settings.get().windDown, true, 'on by default')
  assert.match(texts(expand(ctx.card().render())).join(' '), /End with a breathing exercise \(\+1m\)/)
  actions.startSession('medium')
  assert.deepEqual($routine.get().plan, [...menu.medium, menu.eyes, menu.windDown])
  actions.stop()
  actions.setWindDown(false)
  assert.equal(ctx.stored().settings.windDown, false)
  actions.startSession('short')
  assert.deepEqual($routine.get().plan, [...menu.short, menu.eyes], 'any length; the eye exercise stays')
  actions.setWindDown(true)
  actions.startSession('long')
  assert.deepEqual($routine.get().plan, [...menu.long, menu.eyes, menu.windDown])
  ctx.dispose()
})

test('session: runs every exercise in turn, "2 of 3" on the card, one done at the end', () => {
  const ctx = fakeCtx()
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  actions.startSession('medium')
  const parts = $routine.get().plan.length
  assert.ok(parts > 1)
  ctx.advance(PREP_MS + PREP_MS_TOTAL) // well into the second exercise
  assert.equal($routine.get().phase, 'step')
  const shown = texts(expand(ctx.card().render())).join(' | ')
  assert.match(shown, new RegExp(`2 of ${parts}`))
  ctx.advance(routineMs(sessionOf($routine.get())) - (PREP_MS + PREP_MS_TOTAL) + 200)
  assert.equal($routine.get().phase, 'done')
  ctx.dispose()
})

test('session: a long one closing on breathing is a stretch break (breather cooldown untouched)', () => {
  const ctx = fakeCtx({ settings: { windDown: true } })
  plugin.register(ctx)
  const { $routine, actions } = modelOf(ctx)
  actions.startSession('long')
  ctx.advance(20 * 60_000)
  assert.equal($routine.get().phase, 'idle', 'done, lingered, gone')
  assert.ok(ctx.stored().lastBreakAt)
  assert.equal(ctx.stored().lastBreatherAt, undefined)
  ctx.dispose()
})

test('since you last moved: counts from the stint start, persists, and resets after a break', () => {
  const start = Date.now()
  const ctx = offered({ settings: { cooldownMin: 0 } })
  const { $ui, actions } = modelOf(ctx)
  assert.equal($ui.get().movedAt, start, 'the stint began with this busy spell')
  assert.equal(ctx.stored().activeSince, start)
  assert.match(texts(expand(ctx.card().render())).join(' '), /since you last moved/)
  actions.notNow() // counts as a break
  const breakAt = Date.now()
  busy({})
  ctx.advance(60_000)
  actions.open()
  assert.equal($ui.get().movedAt, breakAt, 'from the break')
  ctx.dispose()

  const reloaded = fakeCtx(ctx.stored()) // restart soon after: same stint
  plugin.register(reloaded)
  busy({ a: true })
  modelOf(reloaded).actions.open()
  assert.equal(modelOf(reloaded).$ui.get().movedAt, breakAt)
  reloaded.dispose()
})

test('figure tile: every figure sits on the tile’s bottom edge, padded above and beside', () => {
  FIGURE_ART['x/a'] = 'data:image/png;base64,X'
  try {
    for (const stacked of [false, true]) {
      const t = TileRow({ figure: 'x/a', stacked, size: 200, text: null }).props.children[0]
      const el = t.type(t.props)
      assert.equal(el.props.style.padding, '14px 14px 0', 'no padding under the figure')
      assert.equal(el.props.style.alignItems, 'flex-end')
      assert.equal(el.props.style.overflow, 'hidden')
      assert.equal(el.props.style.height, t.props.size)
      assert.equal(el.props.children.props.size, t.props.size - 14)
      assert.equal(Figure(el.props.children.props).props.style.maskImage, undefined, 'never faded')
    }
  } finally {
    delete FIGURE_ART['x/a']
  }
})

test('figure: the drawing as an image, or the placeholder without art', () => {
  FIGURE_ART['x/left'] = 'data:image/png;base64,C'
  try {
    const img = Figure({ figure: 'x/left', size: 120 })
    assert.equal(img.type, 'img')
    assert.equal(img.props.src, 'data:image/png;base64,C')
    assert.equal(img.props.alt, '')
    assert.equal(img.props['aria-hidden'], 'true')
    assert.equal(img.props.width, 120)
    const none = Figure({ figure: 'x/right', size: 120 })
    assert.equal(none.type.name, 'FigurePlaceholder')
    assert.equal(none.props.label, 'right')
  } finally {
    delete FIGURE_ART['x/left']
  }
})

test('figure: the card asks for the current exercise and pose', () => {
  const ctx = offered()
  const { actions, $routine } = modelOf(ctx)
  const figures = () => {
    const found = []
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return
      if (node.type === Figure) found.push(node.props.figure)
      if (typeof node.type === 'function') return walk(node.type(node.props || {}))
      walk(node.props && node.props.children)
    }
    walk(ctx.card().render())
    return found
  }
  assert.deepEqual(figures(), [OFFER_FIGURE], 'the picker')
  actions.startSession('short')
  const ses = sessionOf($routine.get())
  assert.deepEqual(figures(), [`${ses.parts[0].id}/${ses.parts[0].prepPose}`], 'get ready')
  while ($routine.get().phase !== 'done') actions.skip()
  assert.deepEqual(figures(), [DONE_FIGURE], 'done')
  ctx.dispose()
})
