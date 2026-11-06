/**
 * Stretch Break — Hermes Desktop plugin (desktop half of the unified package).
 *
 * What it does:
 *   - Status-bar chip: Idle / Working (+ elapsed) for the focused chat; click
 *     to show/hide the stretch by hand.
 *   - When a task has used a tool and run `offerDelaySec`, a compact card
 *     appears below the input box (COMPOSER_AREAS.underside) offering a short
 *     guided stretch (auto-start countdown or Start button), subject to a
 *     cooldown. A stretch underway stays up after Hermes finishes.
 *     (The older bottom pane is still selectable while we decide; see
 *     docs/notes/bottom-pane-and-placements.md.)
 *   - Settings ▸ Plugins ▸ Stretch Break: offers on/off, delay, auto-start,
 *     cooldown (ctx.storage).
 *   - A debug view (turn transitions, gateway events) for development.
 *
 * Rules (see AGENTS.md):
 *   - Loaded uncompiled: no JSX; only `@hermes/plugin-sdk`, `react`,
 *     `react/jsx-runtime` may be imported. No relative imports either.
 *   - No DOM reach-in. Theme variables only, never hardcoded colours.
 *   - All subscriptions/timers go through ctx (or ctx.onDispose) so hot
 *     reload and disable leave nothing behind.
 *
 * Pure logic is exported at the top of the file and unit-tested in tests/.
 */

import {
  host,
  atom,
  computed,
  useValue,
  pluginSettingsHref,
  STATUSBAR_AREAS,
  PALETTE_AREA,
  COMPOSER_AREAS,
  Button,
  ListRow,
  SegmentedControl,
  Tip,
  ToggleRow
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'

export const PLUGIN_ID = 'stretch-break'

const LOG_LIMIT = 40
const EVENT_LIMIT = 30
/** High-frequency event types we count but don't list individually. */
const NOISY_EVENTS = new Set(['message.delta', 'tool.progress'])
/** Pane height while shown: ~2/3 of the window, leaving the chat (and any
 *  question the agent asks) visible above. Core panes use vh units too. */
const PANE_HEIGHT = '50vh'
/** Grace period after work ends: shows "Hermes finished" briefly (and avoids a
 *  flash between back-to-back turns) before the pane leaves. */
export const HIDE_DELAY_MS = 2500

/**
 * PROTOTYPE — where the stretch UI lives (Settings / ⌘K toggle while we pick one):
 *   below — compact card in the composer's underside strip, below the input
 *           box and outside its frame (chosen)
 *   pane  — pane docked below the conversation (the original; still hosts
 *           the debug view)
 * Tried and dropped: card above the input, offer pill, sidebar pane.
 * See docs/notes/bottom-pane-and-placements.md.
 */
export const PLACEMENTS = [
  ['below', 'Below input'],
  ['pane', 'Bottom pane']
]

/**
 * DEV ONLY — keep the pane open at all times (never auto-hide), so UI work
 * doesn't need a running agent turn. `hide`/`stop` still reset the routine.
 * ⚠️ Set `keepPaneOpen: false` before committing a release / catalog pin.
 * (Mutable object so tests can switch it off.)
 */
export const DEV = { keepPaneOpen: true }
/** DEV ONLY — bump on each change so a stale hot reload is obvious in the UI. */
const DEV_BUILD = 'b8'
/** Exit animation length; the pane is unregistered when it completes. */
export const EXIT_MS = 220
const ENTER_MS = 280
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic (no SDK access) — exported for tests
// ─────────────────────────────────────────────────────────────────────────────

/** Initial tracker state. */
export function emptyActivity() {
  return { sessions: {}, log: [] }
}

/**
 * Compare two busy maps (sessionId → boolean) and return the transitions.
 * A missing key counts as idle.
 * @returns {{ sessionId: string, kind: 'start' | 'finish' }[]}
 */
export function diffBusy(prev, next) {
  const out = []
  const ids = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})])
  for (const sessionId of ids) {
    const was = Boolean(prev && prev[sessionId])
    const is = Boolean(next && next[sessionId])
    if (!was && is) out.push({ sessionId, kind: 'start' })
    else if (was && !is) out.push({ sessionId, kind: 'finish' })
  }
  return out
}

/**
 * Fold transitions into tracker state. Returns a new object (immutable update).
 * Session record: { busy, startedAt, lastDurationMs, turns }.
 * Log entry: { at, sessionId, kind, durationMs? }.
 */
export function applyTransitions(state, transitions, now) {
  if (!transitions.length) return state
  const sessions = { ...state.sessions }
  const log = [...state.log]
  for (const { sessionId, kind } of transitions) {
    const prev = sessions[sessionId] || { busy: false, startedAt: null, lastDurationMs: null, turns: 0 }
    if (kind === 'start') {
      sessions[sessionId] = { ...prev, busy: true, startedAt: now }
      log.push({ at: now, sessionId, kind })
    } else {
      const durationMs = prev.startedAt != null ? now - prev.startedAt : null
      sessions[sessionId] = { ...prev, busy: false, startedAt: null, lastDurationMs: durationMs, turns: prev.turns + 1 }
      log.push({ at: now, sessionId, kind, durationMs })
    }
  }
  return { sessions, log: log.slice(-LOG_LIMIT) }
}

/** 0 → "0:00", 75_000 → "1:15", 3_725_000 → "1:02:05". */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '–'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Session ids share long prefixes (e.g. "local…"), so show the distinctive tail. */
export function shortId(id) {
  if (!id) return '—'
  return id.length > 8 ? `…${id.slice(-6)}` : id
}

/** True if any session in a busy map is mid-turn. */
export function anyBusy(map) {
  return Object.values(map || {}).some(Boolean)
}

/**
 * Should the Stretch Break pane exist right now?
 * - pinned: the user opened it by hand (chip / ⌘K).
 * - offered: we auto-offered a stretch during the current busy spell.
 * - routineActive: a stretch is underway — stays up even after Hermes finishes.
 */
export function shouldShowPane({ pinned = false, offered = false, routineActive = false }) {
  return Boolean(pinned || offered || routineActive)
}

// ── Settings + offer policy (pure) ───────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  /** Master switch for automatic offers (the chip / ⌘K still open it by hand). */
  offersEnabled: true,
  /** A turn must have used a tool and run this long before we offer. */
  offerDelaySec: 10,
  /** Count down and start by itself, vs. wait for the Start button. */
  autoStart: true,
  /** No automatic offer within this long of the last break (0 = every task). */
  cooldownMin: 20,
  /** PROTOTYPE: which surface shows the stretch (see PLACEMENTS). */
  placement: 'below'
}
export const OFFER_DELAY_CHOICES = [10, 20, 30, 60]
export const COOLDOWN_CHOICES = [0, 10, 20, 30, 45]

/** Merge stored settings over the defaults, dropping anything malformed. */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return s
  for (const key of ['offersEnabled', 'autoStart']) if (typeof raw[key] === 'boolean') s[key] = raw[key]
  for (const key of ['offerDelaySec', 'cooldownMin']) {
    const n = raw[key]
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) s[key] = n
  }
  if (PLACEMENTS.some(([id]) => id === raw.placement)) s.placement = raw.placement
  return s
}

export function inCooldown(lastBreakAt, cooldownMin, now) {
  return lastBreakAt != null && cooldownMin > 0 && now - lastBreakAt < cooldownMin * 60_000
}

/**
 * Offer a stretch for this busy spell? `spell` = { startedAt, toolSeen, offered }
 * (one per stretch of time where any chat is working).
 */
export function shouldOffer({ spell, settings, lastBreakAt, routinePhase, now }) {
  return Boolean(
    spell &&
      !spell.offered &&
      spell.toolSeen &&
      now - spell.startedAt >= settings.offerDelaySec * 1000 &&
      settings.offersEnabled &&
      routinePhase === 'idle' &&
      !inCooldown(lastBreakAt, settings.cooldownMin, now)
  )
}

/** Log entries for the pane's scope: 'chat' = focused session only, 'all' = every session. */
export function filterLog(log, scope, focusedId) {
  return scope === 'all' ? log : log.filter(e => e.sessionId === focusedId)
}

// ── Exercise + routine (pure, timestamp-driven) ───────────────────────────────────────

/** Stage 2 ships a single gentle exercise: one rep per side. */
export const EXERCISE = {
  id: 'neck-side-tilt',
  name: 'Neck side tilt',
  summary: 'Eases tension along the sides of your neck.',
  holdMs: 20_000,
  /** Shown while getting ready. */
  setup: 'Sit tall, shoulders relaxed and down.',
  reps: [
    { side: 'Left', cue: 'Let your head tilt toward your left shoulder. Don’t pull it.' },
    { side: 'Right', cue: 'Let your head tilt toward your right shoulder. Don’t pull it.' }
  ]
}

/** "Get ready" before the first rep, and the pause between reps. */
export const PREP_MS = 3_000
export const REST_MS = 4_000
/** Auto-start countdown ("Starting in 5…"); it replaces the get-ready phase. */
export const OFFER_MS = 5_000

/**
 * Routine state. Phases: idle → prep → hold → (rest → hold)* → done,
 * or, auto-started: offer → hold → … (the countdown is the get-ready).
 * `endsAt` is the wall-clock end of the current phase; while paused,
 * `pausedAt` freezes time and resuming shifts `endsAt` by the pause length.
 */
export function idleRoutine() {
  return { phase: 'idle', rep: 0, endsAt: null, pausedAt: null }
}

export function startRoutine(ex, now) {
  return { phase: 'prep', rep: 0, endsAt: now + PREP_MS, pausedAt: null }
}

export function offerRoutine(now) {
  return { phase: 'offer', rep: 0, endsAt: now + OFFER_MS, pausedAt: null }
}

/** A stretch is underway (the user is committed; keep the pane up). */
export function isRoutineActive(s) {
  return s.phase === 'prep' || s.phase === 'hold' || s.phase === 'rest'
}

/** The current phase has a running clock (includes the offer countdown). */
export function isTimed(s) {
  return s.phase === 'offer' || isRoutineActive(s)
}

export function phaseDurationMs(ex, phase) {
  return { offer: OFFER_MS, prep: PREP_MS, hold: ex.holdMs, rest: REST_MS }[phase] || 0
}

/** Move to the next phase, starting it at `at`. */
export function advanceRoutine(s, ex, at) {
  const next = (phase, rep) => ({ phase, rep, endsAt: at + phaseDurationMs(ex, phase), pausedAt: null })
  switch (s.phase) {
    case 'offer':
    case 'prep':
      return next('hold', s.rep)
    case 'hold':
      return s.rep < ex.reps.length - 1 ? next('rest', s.rep) : { phase: 'done', rep: s.rep, endsAt: null, pausedAt: null }
    case 'rest':
      return next('hold', s.rep + 1)
    default:
      return s
  }
}

/** Catch up to `now` (handles missed ticks precisely). Returns `s` itself if nothing changed. */
export function tickRoutine(s, ex, now) {
  let cur = s
  while (isTimed(cur) && cur.pausedAt == null && now >= cur.endsAt) cur = advanceRoutine(cur, ex, cur.endsAt)
  return cur
}

export function pauseRoutine(s, now) {
  return isRoutineActive(s) && s.pausedAt == null ? { ...s, pausedAt: now } : s
}

export function resumeRoutine(s, now) {
  return s.pausedAt == null ? s : { ...s, endsAt: s.endsAt + (now - s.pausedAt), pausedAt: null }
}

/** Skip the rest of the current phase (unpauses). On an offer: start now. */
export function skipRoutine(s, ex, now) {
  return isTimed(s) ? advanceRoutine(s, ex, now) : s
}

export function remainingMs(s, now) {
  if (!isTimed(s)) return 0
  return Math.max(0, s.endsAt - (s.pausedAt ?? now))
}

/** 0 → 1 through the current phase. */
export function phaseProgress(s, ex, now) {
  const total = phaseDurationMs(ex, s.phase)
  return total ? 1 - remainingMs(s, now) / total : 0
}

function clock(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false })
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  muted: { color: 'var(--ui-text-tertiary)' },
  faint: { color: 'var(--ui-text-quaternary)' },
  mono: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' },
  section: { borderTop: '1px solid var(--ui-stroke-tertiary)', paddingTop: 8 }
}

function Dot({ on }) {
  return jsx('span', {
    'aria-hidden': 'true',
    style: {
      display: 'inline-block',
      width: 7,
      height: 7,
      borderRadius: 999,
      background: on ? 'var(--ui-accent)' : 'var(--ui-text-quaternary)',
      boxShadow: on ? '0 0 0 3px color-mix(in srgb, var(--ui-accent) 25%, transparent)' : 'none',
      transition: 'background 160ms ease, box-shadow 160ms ease'
    }
  })
}

/** Re-render every `ms` while `active`. */
function useTicker(active, ms = 1000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setTick(t => t + 1), ms)
    return () => clearInterval(id)
  }, [active, ms])
}

/** Focused-chat status: busy flag + when its current turn started (if known). */
function useFocusedStatus($activity) {
  const busy = useValue(host.state.busy)
  const focusedId = useValue(host.state.focusedSessionId)
  const activity = useValue($activity)
  const rec = focusedId ? activity.sessions[focusedId] : null
  useTicker(busy)
  const elapsed = busy && rec && rec.startedAt != null ? Date.now() - rec.startedAt : null
  return { busy, focusedId, rec, elapsed }
}

function StatusChip({ model }) {
  const { busy, elapsed, rec } = useFocusedStatus(model.$activity)
  const paneOpen = useValue(model.$paneOpen)
  const settings = useValue(model.$settings)
  const label = busy ? `Working${elapsed != null ? ` ${formatDuration(elapsed)}` : ''}` : 'Idle'
  const status = busy
    ? 'Hermes is working on this chat'
    : rec && rec.lastDurationMs != null
      ? `Idle · last turn took ${formatDuration(rec.lastDurationMs)}`
      : 'Idle'
  const offers = settings.offersEnabled ? '' : ' · stretch offers paused'
  return jsx(Tip, {
    label: `${status}${offers} · click to ${paneOpen ? 'hide' : 'show'} Stretch Break`,
    children: jsxs('button', {
      type: 'button',
      onClick: model.actions.togglePane,
      'aria-pressed': paneOpen,
      className: 'inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem]',
      style: {
        ...S.mono,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: busy || paneOpen ? 'var(--ui-text-secondary)' : 'var(--ui-text-tertiary)'
      },
      children: [jsx(Dot, { on: busy }), label]
    })
  })
}

function Row({ label, value }) {
  return jsxs('div', {
    style: { display: 'flex', justifyContent: 'space-between', gap: 12 },
    children: [jsx('span', { style: S.muted, children: label }), jsx('span', { style: S.mono, children: value })]
  })
}

/** Quiet inline action ("Skip", "Not now"): core Button, `text` variant (DESIGN.md). */
function TextButton({ onClick, children }) {
  return jsx(Button, { variant: 'text', size: 'inline', onClick, children })
}

/** Small either/or choice: core SegmentedControl. `options` = [[id, label], …]. */
function Choice({ value, onChange, options }) {
  return jsx(SegmentedControl, { value, onChange, options: options.map(([id, label]) => ({ id, label })) })
}

function DebugView({ model }) {
  const { $activity, $events, $bySession, actions } = model
  const { focusedId } = useFocusedStatus($activity)
  const [scope, setScope] = useState('chat')
  const awaiting = useValue(host.state.awaitingResponse)
  const gateway = useValue(host.state.gateway)
  const bySession = useValue($bySession)
  const activity = useValue($activity)
  const events = useValue($events)
  const busyIds = Object.keys(bySession || {}).filter(k => bySession[k])

  const facts = jsxs('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', columnGap: 24, rowGap: 2 },
    children: [
      jsx(Row, { label: 'this chat', value: shortId(focusedId) }),
      jsx(Row, { label: 'awaiting response', value: String(awaiting) }),
      jsx(Row, { label: 'busy sessions', value: busyIds.length ? busyIds.map(shortId).join(', ') : 'none' }),
      jsx(Row, { label: 'gateway socket', value: String(gateway) })
    ]
  })

  const log = filterLog(activity.log, scope, focusedId).slice(-12).reverse()
  const turnLog = jsxs('div', {
    style: S.section,
    children: [
      jsxs('div', {
        style: { ...S.muted, marginBottom: 4, display: 'flex', gap: 10 },
        children: [
          'Turns (newest first) ·',
          jsx(Choice, { value: scope, onChange: setScope, options: [['chat', 'this chat'], ['all', 'all chats']] }),
          jsx('span', { style: { flex: 1 } }),
          jsx(TextButton, { onClick: actions.clear, children: 'Clear' })
        ]
      }),
      log.length === 0
        ? jsx('div', {
            style: S.faint,
            children: scope === 'all' ? 'Nothing yet — send Hermes a message.' : 'No turns in this chat yet.'
          })
        : log.map((e, i) =>
            jsxs(
              'div',
              {
                style: { ...S.mono, display: 'flex', gap: 10 },
                children: [
                  jsx('span', { style: S.faint, children: clock(e.at) }),
                  jsx('span', { children: e.kind === 'start' ? '▶ start ' : '■ finish' }),
                  jsx('span', { style: S.muted, children: shortId(e.sessionId) }),
                  e.kind === 'finish' ? jsx('span', { children: `after ${formatDuration(e.durationMs)}` }) : null,
                  scope === 'all' && e.sessionId === focusedId
                    ? jsx('span', { style: S.faint, children: '(this chat)' })
                    : null
                ]
              },
              `${e.at}-${i}`
            )
          )
    ]
  })

  const counts = Object.entries(events.counts).sort((a, b) => b[1] - a[1])
  const eventLog = jsxs('div', {
    style: S.section,
    children: [
      jsx('div', { style: { ...S.muted, marginBottom: 4 }, children: 'Gateway events' }),
      jsx('div', {
        style: { ...S.mono, ...S.muted, display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginBottom: 4 },
        children: counts.length ? counts.map(([t, n]) => jsx('span', { children: `${t}×${n}` }, t)) : 'none yet'
      }),
      ...events.recent
        .slice()
        .reverse()
        .slice(0, 12)
        .map((e, i) =>
          jsxs(
            'div',
            {
              style: { ...S.mono, display: 'flex', gap: 10 },
              children: [
                jsx('span', { style: S.faint, children: clock(e.at) }),
                jsx('span', { children: e.type }),
                jsx('span', { style: S.muted, children: shortId(e.sessionId) })
              ]
            },
            `${e.at}-${i}`
          )
        )
    ]
  })

  return jsxs('div', {
    style: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
    children: [facts, turnLog, eventLog]
  })
}

// ── Stretch card: compact (offer / idle / done) and large (while stretching) ──

/** Below this width the large layout shows one figure instead of two. */
const WIDE_MIN_PX = 620
const FIGURE_PX = 128
const FIGURE_NARROW_PX = 104
const THUMB_PX = 44
const FADE_MS = 160

/** Whole routine length (get ready + holds + rests), rounded to 5 s. */
function routineSeconds(ex) {
  const ms = PREP_MS + ex.holdMs * ex.reps.length + REST_MS * (ex.reps.length - 1)
  return Math.round(ms / 5000) * 5
}

/** Large layout for the phases where you're actually stretching. */
export function isLargePhase(phase) {
  return phase === 'prep' || phase === 'hold' || phase === 'rest'
}

/** Width of our own element (ResizeObserver; null until measured). */
function useWidth(ref) {
  const [width, setWidth] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return width
}

/** Soft cross-fade of our own element when `key` changes (not on mount). */
function useFadeOnChange(ref, key) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return undefined
    }
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return undefined
    const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: EASE_OUT })
    return () => anim.cancel()
  }, [key])
}

/**
 * PLACEHOLDER for the exercise illustration (real assets to come).
 * `side` is the rep's side ('Left' / 'Right'). Swap this for the artwork;
 * keep it theme-driven (currentColor / --ui-* vars) for light and dark.
 */
function Figure({ side, size, active = true }) {
  return jsx('div', {
    'aria-hidden': 'true',
    style: {
      width: size,
      height: size,
      flex: 'none',
      display: 'grid',
      placeItems: 'center',
      textAlign: 'center',
      borderRadius: 'var(--radius-lg)',
      border: '1px dashed var(--ui-stroke-secondary)',
      color: 'var(--ui-text-quaternary)',
      fontSize: size >= 80 ? 11 : 9,
      lineHeight: 1.3,
      whiteSpace: 'pre-line',
      opacity: active ? 1 : 0.5,
      transition: 'opacity 200ms ease'
    },
    children: size >= 80 ? `figure\n${side.toLowerCase()}` : side[0]
  })
}

/** Thin progress bar; `fill` 0 → 1. */
function Bar({ fill, dim = false, height = 4 }) {
  return jsx('div', {
    style: { flex: 1, minWidth: 0, height, borderRadius: 999, background: 'var(--ui-stroke-secondary)', overflow: 'hidden' },
    children: jsx('div', {
      style: {
        width: `${Math.round(Math.min(1, Math.max(0, fill)) * 1000) / 10}%`,
        height: '100%',
        borderRadius: 999,
        background: 'var(--ui-accent)',
        opacity: dim ? 0.45 : 1,
        transition: 'width 200ms linear, opacity 200ms ease'
      }
    })
  })
}

/**
 * How full each segment of the routine bar is: a segment per hold, with a
 * short one between holds for the rest. 0 → 1 each.
 */
export function routineSegments(s, ex, now) {
  const p = phaseProgress(s, ex, now)
  const out = []
  ex.reps.forEach((rep, i) => {
    const hold = i < s.rep || (i === s.rep && (s.phase === 'rest' || s.phase === 'done')) ? 1 : i === s.rep && s.phase === 'hold' ? p : 0
    out.push({ kind: 'hold', rep: i, weight: ex.holdMs, fill: hold })
    if (i < ex.reps.length - 1) {
      const rest = i < s.rep || s.phase === 'done' ? 1 : i === s.rep && s.phase === 'rest' ? p : 0
      out.push({ kind: 'rest', rep: i, weight: REST_MS, fill: rest })
    }
  })
  return out
}

/** The routine bar (Left · rest · Right) with side labels under the holds. */
function RoutineBar({ s, ex, now }) {
  const segs = routineSegments(s, ex, now)
  const paused = s.pausedAt != null
  const current = s.phase === 'rest' ? s.rep + 1 : s.rep
  const row = render =>
    jsx('div', {
      style: { display: 'flex', gap: 4 },
      children: segs.map((seg, i) => jsx('div', { style: { flex: `${seg.weight} 1 0`, minWidth: 0, display: 'flex' }, children: render(seg) }, i))
    })
  return jsxs('div', {
    style: { display: 'grid', gap: 6, width: '100%', maxWidth: 440 },
    children: [
      row(seg => jsx(Bar, { fill: seg.fill, dim: paused })),
      row(seg =>
        seg.kind === 'hold'
          ? jsx('span', {
              style: {
                fontSize: 12,
                color: seg.rep === current ? 'var(--ui-text-secondary)' : 'var(--ui-text-tertiary)',
                whiteSpace: 'nowrap'
              },
              children: ex.reps[seg.rep].side
            })
          : null
      )
    ]
  })
}

/** PROTOTYPE chrome: dev build label + placement switch. Remove before release. */
function ProtoBits({ model }) {
  return jsxs('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 8 },
    children: [
      DEV.keepPaneOpen ? jsx('span', { style: { ...S.faint, ...S.mono }, children: `dev ${DEV_BUILD}` }) : null,
      jsx(PlacementCycle, { model })
    ]
  })
}

/** Offer, idle and done: one compact row (~50px), so the chat barely moves. */
function StretchCompact({ model, chrome }) {
  const ex = EXERCISE
  const s = useValue(model.$routine)
  const ui = useValue(model.$ui)
  const a = model.actions
  const now = Date.now()
  const about = `${ex.reps.length} × ${ex.holdMs / 1000} s · about ${routineSeconds(ex)} s`

  let heading, sub, bar = null, actions
  if (s.phase === 'offer') {
    const left = Math.ceil(remainingMs(s, now) / 1000)
    heading = 'Quick stretch while Hermes works?'
    sub = `${ex.name} · ${about}`
    bar = jsxs('div', {
      style: { display: 'flex', alignItems: 'center', gap: 8, maxWidth: 320 },
      children: [
        jsx(Bar, { fill: phaseProgress(s, ex, now), height: 3 }),
        jsx('span', { style: { ...S.muted, ...S.mono, fontSize: 11, whiteSpace: 'nowrap' }, children: `starts in ${left} s` })
      ]
    })
    actions = [
      jsx(Button, { size: 'sm', onClick: a.skipStretch, children: 'Start now' }, 'go'),
      jsx(TextButton, { onClick: a.notNow, children: 'Not now' }, 'no')
    ]
  } else if (s.phase === 'done') {
    heading = 'Nice one'
    sub = `${ex.name} done. Roll your shoulders and carry on.`
    actions = [
      jsx(TextButton, { onClick: a.startStretch, children: 'Again' }, 'again'),
      jsx(TextButton, { onClick: a.hidePane, children: 'Hide' }, 'hide')
    ]
  } else {
    heading = ui.offered ? 'Quick stretch while Hermes works?' : ex.name
    sub = ui.offered ? `${ex.name} · ${about}` : `${ex.summary} ${about}.`
    actions = [
      jsx(Button, { size: 'sm', onClick: a.startStretch, children: 'Start' }, 'go'),
      jsx(TextButton, { onClick: a.notNow, children: ui.offered ? 'Not now' : 'Hide' }, 'no')
    ]
  }

  return jsxs('div', {
    style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px' },
    children: [
      jsx(Figure, { side: ex.reps[0].side, size: THUMB_PX }),
      jsxs('div', {
        style: { flex: '1 1 220px', minWidth: 0, display: 'grid', gap: 3 },
        children: [
          jsxs('div', {
            style: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 },
            children: [
              jsx('span', { style: { fontSize: 13, fontWeight: 600, color: 'var(--ui-text-primary)', whiteSpace: 'nowrap' }, children: heading }),
              jsx('span', {
                style: { ...S.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                children: sub
              })
            ]
          }),
          bar
        ]
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 12, flex: 'none', marginLeft: 'auto' },
        children: [...actions, chrome ? jsx(ProtoBits, { model }, 'proto') : null]
      })
    ]
  })
}

const NUMBER_CAPTION = { prep: 'get ready', hold: 'seconds left', rest: 'switch sides' }

/** Get ready, hold and rest: figure(s), big countdown, routine bar, controls. */
function StretchLarge({ model, chrome, wide }) {
  const ex = EXERCISE
  const s = useValue(model.$routine)
  const a = model.actions
  const now = Date.now()
  const paused = s.pausedAt != null
  const rep = ex.reps[s.rep]
  const next = ex.reps[s.rep + 1]
  // The side you're on (or about to switch to, during the rest).
  const focus = s.phase === 'rest' ? s.rep + 1 : s.rep
  const cue =
    s.phase === 'prep'
      ? `${ex.setup} First: ${rep.side.toLowerCase()} side.`
      : s.phase === 'rest'
        ? `Slowly bring your head back to centre. Next: ${next.side.toLowerCase()} side.`
        : rep.cue

  const figure = i =>
    jsxs(
      'div',
      {
        style: { display: 'grid', justifyItems: 'center', gap: 8 },
        children: [
          jsx(Figure, { side: ex.reps[i].side, size: wide ? FIGURE_PX : FIGURE_NARROW_PX, active: i === focus }),
          jsx('span', {
            style: {
              fontSize: 12,
              fontWeight: i === focus ? 600 : 400,
              color: i === focus ? 'var(--ui-accent)' : 'var(--ui-text-tertiary)'
            },
            children: `${ex.reps[i].side} · rep ${i + 1}`
          })
        ]
      },
      i
    )
  const tile = jsx('div', {
    style: {
      flex: 'none',
      display: 'flex',
      gap: 16,
      padding: 14,
      borderRadius: 'var(--radius-xl)',
      background: 'var(--ui-bg-tertiary)'
    },
    children: wide ? ex.reps.map((_, i) => figure(i)) : [figure(focus)]
  })

  const header = jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: 12 },
    children: [
      jsx('span', { style: { ...S.muted, fontSize: 12, fontWeight: 500 }, children: 'Stretch break' }),
      jsx('span', { style: { flex: 1 } }),
      chrome ? jsx(ProtoBits, { model }) : null
    ]
  })

  const body = jsxs('div', {
    style: { flex: '1 1 260px', minWidth: 0, display: 'grid', alignContent: 'center', gap: 10 },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px' },
        children: [
          jsx('span', { style: { fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ui-text-primary)' }, children: ex.name }),
          jsx('span', { style: { ...S.muted, fontSize: 13 }, children: `Rep ${focus + 1} of ${ex.reps.length} · ${ex.reps[focus].side} side` })
        ]
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'baseline', gap: 10 },
        children: [
          jsx('span', {
            style: {
              fontSize: 56,
              fontWeight: 300,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--ui-text-primary)',
              opacity: paused ? 0.45 : 1
            },
            children: Math.ceil(remainingMs(s, now) / 1000)
          }),
          jsx('span', { style: { ...S.muted, fontSize: 13 }, children: paused ? 'paused' : NUMBER_CAPTION[s.phase] })
        ]
      }),
      jsx(RoutineBar, { s, ex, now }),
      jsx('div', { style: { fontSize: 14, color: 'var(--ui-text-secondary)', lineHeight: 1.45 }, children: cue }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 14 },
        children: [
          jsx(Button, { variant: 'secondary', onClick: paused ? a.resumeStretch : a.pauseStretch, children: paused ? 'Resume' : 'Pause' }),
          jsx(TextButton, { onClick: a.skipStretch, children: 'Skip' }),
          jsx(TextButton, { onClick: a.stopStretch, children: 'Stop' })
        ]
      })
    ]
  })

  return jsxs('div', {
    style: { display: 'grid', gap: 12 },
    children: [header, jsxs('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 }, children: [tile, body] })]
  })
}

/**
 * The stretch UI, sized by phase. `chrome` adds the prototype bits (the pane
 * has its own top bar for those).
 */
function StretchBody({ model, chrome = true }) {
  const s = useValue(model.$routine)
  const ref = useRef(null)
  const width = useWidth(ref)
  const large = isLargePhase(s.phase)
  useTicker(isTimed(s) && s.pausedAt == null, 200)
  useFadeOnChange(ref, large)
  return jsx('div', {
    ref,
    style: { width: '100%', fontSize: 12 },
    children: large
      ? jsx(StretchLarge, { model, chrome, wide: width == null || width >= WIDE_MIN_PX })
      : jsx(StretchCompact, { model, chrome })
  })
}

// ── PROTOTYPE: placement switch ──────────────────────────────────────────────

/** PROTOTYPE: in-panel switch — cycles to the next placement. */
function PlacementCycle({ model }) {
  const { placement } = useValue(model.$settings)
  const label = (PLACEMENTS.find(([id]) => id === placement) || PLACEMENTS[0])[1]
  return jsx(TextButton, { onClick: model.actions.nextPlacement, children: `Placement: ${label} →` })
}

/**
 * COMPOSER_AREAS.underside: below the input box, outside its frame. It's still
 * inside the chat pane, so the app's focus-follows-hover keeps the input box
 * focused while you use it.
 */
function ComposerCard({ model }) {
  const closing = useValue(model.$closing)
  const rootRef = useRef(null)
  usePaneMotion(rootRef, closing)
  return jsx('div', {
    ref: rootRef,
    style: { width: '100%', padding: '6px 8px 4px' }, // the underside strip is a wrapping flex row
    children: jsx(StretchBody, { model })
  })
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Enter/exit motion for our OWN root element (Web Animations API on a ref —
 * no injected CSS, no app DOM). The layout zone itself snaps; this softens it.
 */
function usePaneMotion(ref, closing) {
  // Runs on mount (enter) and whenever `closing` flips: true → exit,
  // false again (work resumed mid-exit) → enter.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return undefined
    const hidden = { opacity: 0, transform: 'translateY(16px)' }
    const shown = { opacity: 1, transform: 'translateY(0)' }
    const anim = el.animate(closing ? [shown, hidden] : [hidden, shown], {
      duration: closing ? EXIT_MS : ENTER_MS,
      easing: closing ? EASE_IN : EASE_OUT,
      fill: 'both'
    })
    return () => anim.cancel()
  }, [closing])
}

function StretchPane({ model }) {
  const ui = useValue(model.$ui)
  const closing = useValue(model.$closing)
  const rootRef = useRef(null)
  usePaneMotion(rootRef, closing)
  const { setView, hidePane } = model.actions
  const bar = jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: 12 },
    children: [
      DEV.keepPaneOpen ? jsx('span', { style: { ...S.faint, ...S.mono }, children: `dev ${DEV_BUILD}: always open` }) : null,
      jsx('span', { style: { flex: 1 } }),
      jsx(PlacementCycle, { model }),
      jsx('span', { style: S.faint, children: '·' }),
      jsx(Choice, { value: ui.view, onChange: setView, options: [['stretch', 'stretch'], ['debug', 'debug']] }),
      jsx('span', { style: S.faint, children: '·' }),
      jsx(TextButton, { onClick: hidePane, children: 'Hide' })
    ]
  })
  return jsxs('div', {
    ref: rootRef,
    style: { height: '100%', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 },
    children: [
      bar,
      ui.view === 'debug'
        ? jsx(DebugView, { model })
        : jsx('div', {
            style: { flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', alignItems: 'center' },
            children: jsx(StretchBody, { model, chrome: false })
          })
    ]
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

/** Settings ▸ Plugins ▸ Stretch Break — core settings rows, persisted via ctx.storage. */
function SettingsPage({ model }) {
  const s = useValue(model.$settings)
  const set = model.actions.updateSettings
  const seg = (value, choices, fmt, onPick) =>
    jsx(SegmentedControl, {
      value: String(value),
      onChange: v => onPick(Number(v)),
      options: choices.map(n => ({ id: String(n), label: fmt(n) }))
    })
  return jsxs('div', {
    children: [
      jsx(ToggleRow, {
        label: 'Offer stretch breaks',
        description:
          'Offer a short stretch while Hermes works on a longer task. You can always open it from the status bar.',
        checked: s.offersEnabled,
        onChange: on => set({ offersEnabled: on })
      }),
      jsx(ListRow, {
        title: 'Offer after',
        description: 'How long a task has to run (and use a tool) before a stretch is offered.',
        action: seg(s.offerDelaySec, OFFER_DELAY_CHOICES, n => `${n}s`, n => set({ offerDelaySec: n }))
      }),
      jsx(ToggleRow, {
        label: 'Start automatically',
        description: `Count down ${OFFER_MS / 1000} seconds, then begin. When off, the stretch waits for you to press Start.`,
        checked: s.autoStart,
        onChange: on => set({ autoStart: on })
      }),
      jsx(ListRow, {
        title: 'Time between breaks',
        description: 'After a stretch (or skipping one), wait this long before offering another.',
        action: seg(s.cooldownMin, COOLDOWN_CHOICES, n => (n ? `${n}m` : 'none'), n => set({ cooldownMin: n }))
      }),
      jsx(ListRow, {
        title: 'Placement (prototype)',
        description: 'Where the stretch appears. Temporary, while we compare options.',
        action: jsx(SegmentedControl, {
          value: s.placement,
          onChange: v => set({ placement: v }),
          options: PLACEMENTS.map(([id, label]) => ({ id, label }))
        })
      })
    ]
  })
}

export default {
  id: PLUGIN_ID,
  name: 'Stretch Break',
  register(ctx) {
    // Per-registration stores: a hot reload gets fresh ones, never stacked state.
    const $activity = atom(emptyActivity())
    const $events = atom({ counts: {}, recent: [] })
    /**
     * pinned: user opened the pane by hand (chip / ⌘K).
     * offered: we auto-offered a stretch in the current busy spell.
     */
    const $ui = atom({ pinned: false, offered: false, view: 'stretch' })
    const $paneOpen = atom(false)
    /** True while the exit animation plays, just before the pane is unregistered. */
    const $closing = atom(false)
    /** Exercise routine state (see idleRoutine/startRoutine). Lives here, not in
     *  the pane, so it survives the pane unmounting and remounting. */
    const $routine = atom(idleRoutine())
    /** User preferences (Settings ▸ Plugins ▸ Stretch Break), persisted. */
    const $settings = atom(normalizeSettings(ctx.storage.get('settings', null)))
    /** When the last break ended (done or declined) — drives the cooldown. Persisted. */
    let lastBreakAt = ctx.storage.get('lastBreakAt', null)

    // Per-session turn-busy map. Fall back to the focused flag on older
    // desktops that lack busyBySession (this fallback can't tell a session
    // switch from a finished turn, so it's strictly a degraded mode).
    const $bySession =
      host.state.busyBySession ||
      computed([host.state.busy, host.state.focusedSessionId], (busy, id) => ({ [id || 'focused']: busy }))

    const patchUi = patch => $ui.set({ ...$ui.get(), ...patch })

    // ── Pane lifecycle ───────────────────────────────────────────────────────
    // The pane contribution only EXISTS while it should show (same pattern as
    // core's ⌘K-summoned Logs pane): registered when we offer a stretch,
    // disposed a moment after it's no longer wanted.
    //   want → mount (or cancel a pending exit)
    //   !want → [grace HIDE_DELAY_MS unless immediate] → exit anim EXIT_MS → unregister
    const model = { $activity, $events, $bySession, $ui, $paneOpen, $closing, $routine, $settings, actions: {} }
    const paneContribution = {
      id: 'pane',
      area: 'panes',
      title: 'Stretch Break',
      data: { placement: 'bottom', dock: { pane: 'workspace', pos: 'bottom' }, height: PANE_HEIGHT },
      render: () => jsx(StretchPane, { model })
    }
    // PROTOTYPE placements (settings.placement). Each is just a different set
    // of contributions; the show/hide lifecycle below is shared.
    const composerBelow = {
      id: 'composer-below',
      area: COMPOSER_AREAS.underside,
      render: () => jsx(ComposerCard, { model })
    }
    const surfaceFor = placement => (placement === 'pane' ? [paneContribution] : [composerBelow])
    let mountedPlacement = null
    let disposePane = null
    let cancelGrace = null
    let cancelExit = null
    const stop = cancel => {
      if (cancel) cancel()
      return null
    }
    const mountPane = () => {
      cancelGrace = stop(cancelGrace)
      if (cancelExit) {
        cancelExit = stop(cancelExit) // wanted again mid-exit: animate back in
        $closing.set(false)
      }
      if (disposePane) return
      mountedPlacement = $settings.get().placement
      const disposers = surfaceFor(mountedPlacement).map(c => ctx.register(c))
      disposePane = () => disposers.forEach(d => d())
      $paneOpen.set(true)
    }
    const beginExit = () => {
      cancelGrace = stop(cancelGrace)
      if (!disposePane || cancelExit) return
      $closing.set(true)
      cancelExit = ctx.setTimeout(() => {
        cancelExit = null
        const dispose = disposePane
        disposePane = null
        dispose()
        $closing.set(false)
        $paneOpen.set(false)
      }, EXIT_MS)
    }
    const wantPane = () =>
      DEV.keepPaneOpen || shouldShowPane({ ...$ui.get(), routineActive: isRoutineActive($routine.get()) })
    const syncPane = ({ immediate = false } = {}) => {
      if (wantPane()) return mountPane()
      if (!disposePane) return
      if (immediate) return beginExit()
      cancelGrace ??= ctx.setTimeout(() => {
        cancelGrace = null
        if (!wantPane()) beginExit()
      }, HIDE_DELAY_MS)
    }
    const paneShowing = () => Boolean(disposePane) && !cancelExit

    // ── Offer policy ─────────────────────────────────────────────────────────
    // A "spell" is a stretch of time where any chat is working. We offer at
    // most once per spell, once it has used a tool and run offerDelaySec.
    let spell = null // { startedAt, toolSeen, offered }
    /** PROTOTYPE: a ⌘K preview offer is underway — don't let it start a cooldown. */
    let previewing = false
    const markBreak = () => {
      if (previewing) return
      lastBreakAt = Date.now()
      ctx.storage.set('lastBreakAt', lastBreakAt)
    }
    const maybeOffer = () => {
      const now = Date.now()
      const routine = $routine.get()
      if (!shouldOffer({ spell, settings: $settings.get(), lastBreakAt, routinePhase: routine.phase, now })) return
      spell.offered = true
      previewing = false // a real offer supersedes a preview
      if ($settings.get().autoStart) $routine.set(offerRoutine(now))
      patchUi({ offered: true })
      syncPane()
    }
    const endSpell = () => {
      spell = null
      // Hermes finished before the user engaged: withdraw quietly (no cooldown)
      // and leave straight away; a stretch already underway keeps the pane.
      const withdrawing = $ui.get().offered && !isRoutineActive($routine.get())
      if ($routine.get().phase === 'offer') $routine.set(idleRoutine())
      if ($ui.get().offered) patchUi({ offered: false })
      syncPane({ immediate: withdrawing })
    }
    ctx.onEvent('tool.start', () => {
      if (!spell) return
      spell.toolSeen = true
      maybeOffer()
    })

    // ── Turn transitions from busyBySession ──────────────────────────────────
    let prevBusy = {}
    const onBusyMap = next => {
      const map = next || {}
      const now = Date.now()
      const transitions = diffBusy(prevBusy, map)
      prevBusy = { ...map }
      if (transitions.length) $activity.set(applyTransitions($activity.get(), transitions, now))
      const busy = anyBusy(map)
      if (busy && !spell) spell = { startedAt: now, toolSeen: false, offered: false }
      else if (!busy && spell) endSpell()
    }

    // ── Raw gateway events (debug view) ──────────────────────────────────────
    // Counts are batched and flushed once a second so per-token deltas don't
    // re-render the pane on every token.
    let counts = {}
    let recent = []
    let dirty = false
    ctx.onEvent('*', ev => {
      const type = (ev && ev.type) || 'unknown'
      counts[type] = (counts[type] || 0) + 1
      if (!NOISY_EVENTS.has(type)) {
        recent.push({ at: Date.now(), type, sessionId: ev && ev.session_id })
        if (recent.length > EVENT_LIMIT) recent = recent.slice(-EVENT_LIMIT)
      }
      dirty = true
    })
    ctx.setInterval(() => {
      if (!dirty) return
      dirty = false
      $events.set({ counts: { ...counts }, recent: [...recent] })
    }, 1000)

    // ── Routine driver ───────────────────────────────────────────────────────
    // Phase changes happen here (not in the pane) so they advance even while
    // the pane isn't mounted; the pane just renders. Also re-checks the offer
    // (the delay can elapse between events).
    ctx.setInterval(() => {
      const s = $routine.get()
      const next = tickRoutine(s, EXERCISE, Date.now())
      if (next !== s) $routine.set(next)
      maybeOffer()
    }, 200)
    let prevPhase = $routine.get().phase
    ctx.onDispose(
      $routine.listen(s => {
        if (s.phase === 'done' && prevPhase !== 'done') {
          markBreak() // finished a stretch
          previewing = false
        }
        prevPhase = s.phase
        syncPane() // start/end of a routine changes whether the pane is wanted
      })
    )
    const setRoutine = fn => $routine.set(fn($routine.get(), Date.now()))

    // ── Actions ──────────────────────────────────────────────────────────────
    const hidePane = () => {
      // Closing an offer or a stretch counts as a break for the cooldown.
      const r = $routine.get()
      if ($ui.get().offered || isTimed(r)) markBreak()
      previewing = false
      $routine.set(idleRoutine())
      patchUi({ pinned: false, offered: false })
      syncPane({ immediate: true })
    }
    const showPane = (view = $ui.get().view) => {
      patchUi({ pinned: true, view })
      syncPane()
    }
    const updateSettings = patch => {
      $settings.set(normalizeSettings({ ...$settings.get(), ...patch }))
      ctx.storage.set('settings', $settings.get())
    }
    // Placement changed while showing: swap surfaces in place (no exit anim).
    ctx.onDispose(
      $settings.listen(st => {
        if (!disposePane || st.placement === mountedPlacement) return
        cancelExit = stop(cancelExit)
        $closing.set(false)
        const dispose = disposePane
        disposePane = null
        dispose()
        $paneOpen.set(false)
        syncPane()
      })
    )
    Object.assign(model.actions, {
      hidePane,
      showPane,
      togglePane: () => (paneShowing() ? hidePane() : showPane()),
      setView: view => patchUi({ view }),
      updateSettings,
      /** PROTOTYPE: cycle placements (in-panel switch and ⌘K). */
      nextPlacement: () => {
        const ids = PLACEMENTS.map(([id]) => id)
        const next = ids[(ids.indexOf($settings.get().placement) + 1) % ids.length]
        updateSettings({ placement: next })
        if (!$ui.get().offered && !isRoutineActive($routine.get())) showPane('stretch') // something to look at
      },
      /** PROTOTYPE: show an offer now (no agent turn needed); never starts a cooldown. */
      previewOffer: () => {
        previewing = true
        if ($settings.get().autoStart) $routine.set(offerRoutine(Date.now()))
        patchUi({ offered: true, view: 'stretch' })
        syncPane()
      },
      startStretch: () => setRoutine((_, now) => startRoutine(EXERCISE, now)),
      pauseStretch: () => setRoutine(pauseRoutine),
      resumeStretch: () => setRoutine(resumeRoutine),
      skipStretch: () => setRoutine((s, now) => skipRoutine(s, EXERCISE, now)),
      // Stop / not now = done with it: close now (exit fade only, no grace period).
      stopStretch: hidePane,
      notNow: hidePane,
      clear: () => {
        counts = {}
        recent = []
        $events.set({ counts: {}, recent: [] })
        // Keep in-flight turns' start times; drop history.
        const sessions = {}
        for (const [id, rec] of Object.entries($activity.get().sessions)) {
          if (rec.busy) sessions[id] = { ...rec, turns: 0, lastDurationMs: null }
        }
        $activity.set({ sessions, log: [] })
      }
    })

    onBusyMap($bySession.get()) // seed: turns already running at load start a spell now
    ctx.onDispose($bySession.listen(onBusyMap))
    syncPane()

    const palette = (id, label, run) => ({
      id,
      area: PALETTE_AREA,
      data: { id: `stretch-break.${id}`, label: `Stretch Break: ${label}`, keywords: ['stretch', 'break'], run }
    })
    ctx.registerMany([
      { id: 'chip', area: STATUSBAR_AREAS.right, order: 125, render: () => jsx(StatusChip, { model }) },
      palette('toggle', 'Toggle panel', model.actions.togglePane),
      palette('offers', 'Pause / resume stretch offers', () =>
        updateSettings({ offersEnabled: !$settings.get().offersEnabled })
      ),
      palette('placement', 'Next placement (prototype)', model.actions.nextPlacement),
      palette('preview', 'Preview an offer (prototype)', model.actions.previewOffer),
      palette('settings', 'Open settings', () => host.navigate(pluginSettingsHref(PLUGIN_ID))),
      palette('debug', 'Show debug panel', () => {
        updateSettings({ placement: 'pane' }) // the debug view lives in the pane
        showPane('debug')
      }),
      palette('clear', 'Clear activity log', model.actions.clear)
    ])

    // Feature-detected: older hosts lack registerSettingsPage.
    ctx.registerSettingsPage?.({
      id: 'settings',
      title: 'Stretch Break',
      icon: 'heart',
      render: () => jsx(SettingsPage, { model })
    })
  }
}
