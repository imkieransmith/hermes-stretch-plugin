/**
 * Stretch Break — Hermes Desktop plugin (desktop half of the unified package).
 *
 * STAGE 1: agent-activity detection only.
 *   - Status-bar chip: Idle / Working (+ elapsed) for the FOCUSED chat.
 *   - Bottom pane ("Stretch Break · activity"): a debug view of turn
 *     start/finish transitions per session and the raw gateway event stream.
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

import { host, atom, computed, useValue, STATUSBAR_AREAS, PALETTE_AREA, Button, Tip } from '@hermes/plugin-sdk'
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
 * DEV ONLY — keep the pane open at all times (never auto-hide), so UI work
 * doesn't need a running agent turn. `hide`/`stop` still reset the routine.
 * ⚠️ Set `keepPaneOpen: false` before committing a release / catalog pin.
 * (Mutable object so tests can switch it off.)
 */
export const DEV = { keepPaneOpen: true }
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
 * - pinned: the user opened it by hand (chip / ⌘K) — shows regardless.
 * - otherwise it shows while any session is working, unless the user hid it
 *   during this busy spell (dismissed, reset once everything is idle).
 */
export function shouldShowPane({ anyBusy: busy, pinned, dismissed, routineActive = false }) {
  // A routine underway keeps the pane up even after Hermes finishes.
  return Boolean(pinned || routineActive || (busy && !dismissed))
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
  steps: ['Sit tall with your shoulders relaxed and down.', 'Let your head tilt slowly. Don’t pull it.', 'Breathe slowly. Ease off if anything pinches.'],
  reps: [
    { label: 'Left side', cue: 'Tilt your left ear toward your left shoulder.' },
    { label: 'Right side', cue: 'Tilt your right ear toward your right shoulder.' }
  ]
}

/** "Get ready" before the first rep, and the pause between reps. */
export const PREP_MS = 3_000
export const REST_MS = 4_000

/**
 * Routine state. Phases: idle → prep → hold → (rest → hold)* → done.
 * `endsAt` is the wall-clock end of the current phase; while paused,
 * `pausedAt` freezes time and resuming shifts `endsAt` by the pause length.
 */
export function idleRoutine() {
  return { phase: 'idle', rep: 0, endsAt: null, pausedAt: null }
}

export function startRoutine(ex, now) {
  return { phase: 'prep', rep: 0, endsAt: now + PREP_MS, pausedAt: null }
}

export function isRoutineActive(s) {
  return s.phase === 'prep' || s.phase === 'hold' || s.phase === 'rest'
}

export function phaseDurationMs(ex, phase) {
  return phase === 'prep' ? PREP_MS : phase === 'hold' ? ex.holdMs : phase === 'rest' ? REST_MS : 0
}

/** Move to the next phase, starting it at `at`. */
export function advanceRoutine(s, ex, at) {
  const next = (phase, rep) => ({ phase, rep, endsAt: at + phaseDurationMs(ex, phase), pausedAt: null })
  switch (s.phase) {
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
  while (isRoutineActive(cur) && cur.pausedAt == null && now >= cur.endsAt) cur = advanceRoutine(cur, ex, cur.endsAt)
  return cur
}

export function pauseRoutine(s, now) {
  return isRoutineActive(s) && s.pausedAt == null ? { ...s, pausedAt: now } : s
}

export function resumeRoutine(s, now) {
  return s.pausedAt == null ? s : { ...s, endsAt: s.endsAt + (now - s.pausedAt), pausedAt: null }
}

/** Skip the rest of the current phase (unpauses). */
export function skipRoutine(s, ex, now) {
  return isRoutineActive(s) ? advanceRoutine(s, ex, now) : s
}

export function remainingMs(s, now) {
  if (!isRoutineActive(s)) return 0
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
  mono: { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontVariantNumeric: 'tabular-nums' },
  section: { borderTop: '1px solid var(--ui-stroke-secondary)', paddingTop: 8 }
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
  const label = busy ? `Working${elapsed != null ? ` ${formatDuration(elapsed)}` : ''}` : 'Idle'
  const status = busy
    ? 'Hermes is working on this chat'
    : rec && rec.lastDurationMs != null
      ? `Idle · last turn took ${formatDuration(rec.lastDurationMs)}`
      : 'Idle'
  return jsx(Tip, {
    label: `${status} · click to ${paneOpen ? 'hide' : 'show'} Stretch Break`,
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

/** Plain text button (Button's variant/size props aren't documented). */
function TextButton({ active = false, onClick, children, title }) {
  return jsx('button', {
    type: 'button',
    onClick,
    title,
    'aria-pressed': active,
    style: {
      background: 'none',
      border: 'none',
      padding: '0 2px',
      cursor: 'pointer',
      font: 'inherit',
      color: active ? 'var(--ui-text-secondary)' : 'var(--ui-text-quaternary)',
      textDecoration: active ? 'underline' : 'none',
      textUnderlineOffset: 3
    },
    children
  })
}

/** Inline set of TextButtons acting as a segmented toggle. */
function TextToggle({ value, onChange, options }) {
  return jsx('span', {
    style: { display: 'inline-flex', gap: 6 },
    children: options.map(([v, label]) =>
      jsx(TextButton, { active: value === v, onClick: () => onChange(v), children: label }, v)
    )
  })
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
          jsx(TextToggle, { value: scope, onChange: setScope, options: [['chat', 'this chat'], ['all', 'all chats']] }),
          jsx('span', { style: { flex: 1 } }),
          jsx(TextButton, { onClick: actions.clear, title: 'Clear the turn log and event counts', children: 'clear' })
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

const RING_SIZE = 168
const RING_STROKE = 8

/** Countdown ring: track + accent arc, seconds in the middle. */
function Ring({ progress, seconds, caption, dim }) {
  const r = (RING_SIZE - RING_STROKE) / 2
  const c = 2 * Math.PI * r
  const circle = (stroke, extra) =>
    jsx('circle', {
      cx: RING_SIZE / 2,
      cy: RING_SIZE / 2,
      r,
      fill: 'none',
      stroke,
      strokeWidth: RING_STROKE,
      strokeLinecap: 'round',
      ...extra
    })
  return jsxs('div', {
    style: { position: 'relative', width: RING_SIZE, height: RING_SIZE, flex: 'none' },
    children: [
      jsxs('svg', {
        width: RING_SIZE,
        height: RING_SIZE,
        viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
        style: { transform: 'rotate(-90deg)' },
        'aria-hidden': 'true',
        children: [
          circle('var(--ui-stroke-secondary)'),
          circle('var(--ui-accent)', {
            strokeDasharray: c,
            strokeDashoffset: c * (1 - Math.min(1, Math.max(0, progress))),
            style: { transition: 'stroke-dashoffset 200ms linear', opacity: dim ? 0.45 : 1 }
          })
        ]
      }),
      jsxs('div', {
        style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 2 },
        children: [
          jsx('div', {
            style: { ...S.mono, fontSize: 40, fontWeight: 600, color: 'var(--ui-text-secondary)', lineHeight: 1 },
            children: seconds
          }),
          jsx('div', { style: { ...S.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }, children: caption })
        ]
      })
    ]
  })
}

/** One dot per rep: done = filled, current = ring, upcoming = faint. */
function RepDots({ total, current, done }) {
  return jsx('div', {
    style: { display: 'flex', gap: 8, justifyContent: 'center' },
    children: Array.from({ length: total }, (_, i) => {
      const complete = done || i < current
      const active = !done && i === current
      return jsx(
        'span',
        {
          'aria-hidden': 'true',
          style: {
            width: 9,
            height: 9,
            borderRadius: 999,
            background: complete ? 'var(--ui-accent)' : 'transparent',
            border: `2px solid ${complete || active ? 'var(--ui-accent)' : 'var(--ui-stroke-secondary)'}`,
            transition: 'background 200ms ease, border-color 200ms ease'
          }
        },
        i
      )
    })
  })
}

const PHASE_CAPTION = { prep: 'get ready', hold: 'hold', rest: 'switch' }

/** The exercise player (Stage 2): one exercise, a rep per side. */
function StretchView({ model }) {
  const ex = EXERCISE
  const s = useValue(model.$routine)
  const a = model.actions
  const active = isRoutineActive(s)
  useTicker(active && s.pausedAt == null, 200)
  const now = Date.now()

  const column = children =>
    jsx('div', {
      style: { flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center' },
      children: jsx('div', {
        style: { width: 'min(100%, 460px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' },
        children
      })
    })
  const title = jsx('div', { style: { fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ui-text-secondary)' }, children: ex.name })
  const totalSec = Math.round((ex.holdMs * ex.reps.length) / 1000)

  if (s.phase === 'idle') {
    return column([
      title,
      jsx('div', { style: { ...S.muted, fontSize: 13 }, children: `${ex.summary} ${ex.reps.length} × ${ex.holdMs / 1000}s · about ${totalSec + 5}s.` }),
      jsx('ol', {
        style: { ...S.muted, fontSize: 13, margin: 0, paddingLeft: 18, textAlign: 'left', display: 'grid', gap: 4 },
        children: ex.steps.map((t, i) => jsx('li', { children: t }, i))
      }),
      jsx(Button, { onClick: a.startStretch, children: 'Start' })
    ])
  }

  if (s.phase === 'done') {
    return column([
      jsx('div', { style: { fontSize: 22, fontWeight: 600, color: 'var(--ui-text-secondary)' }, children: 'Nice one ✓' }),
      jsx('div', { style: { ...S.muted, fontSize: 13 }, children: `${ex.name} done. Roll your shoulders and carry on.` }),
      jsx(RepDots, { total: ex.reps.length, current: s.rep, done: true }),
      jsx(TextButton, { onClick: a.startStretch, children: 'again' })
    ])
  }

  const paused = s.pausedAt != null
  const repInfo = ex.reps[s.rep]
  const nextRep = ex.reps[s.rep + 1]
  const cue =
    s.phase === 'prep'
      ? `First: ${repInfo.label.toLowerCase()}. ${repInfo.cue}`
      : s.phase === 'rest'
        ? `Slowly bring your head back to centre. Next: ${nextRep.label.toLowerCase()}.`
        : repInfo.cue
  return column([
    jsxs('div', {
      style: { display: 'grid', gap: 2 },
      children: [
        title,
        jsx('div', { style: { ...S.muted, fontSize: 12 }, children: `Rep ${s.rep + 1} of ${ex.reps.length} · ${repInfo.label}` })
      ]
    }),
    jsx(Ring, {
      progress: phaseProgress(s, ex, now),
      seconds: Math.ceil(remainingMs(s, now) / 1000),
      caption: paused ? 'paused' : PHASE_CAPTION[s.phase],
      dim: paused
    }),
    jsx('div', { style: { fontSize: 14, color: 'var(--ui-text-secondary)', minHeight: 40 }, children: cue }),
    jsx(RepDots, { total: ex.reps.length, current: s.rep, done: false }),
    jsxs('div', {
      style: { display: 'flex', alignItems: 'center', gap: 14 },
      children: [
        jsx(Button, { onClick: paused ? a.resumeStretch : a.pauseStretch, children: paused ? 'Resume' : 'Pause' }),
        jsx(TextButton, { onClick: a.skipStretch, title: 'Skip to the next step', children: 'skip' }),
        jsx(TextButton, { onClick: a.stopStretch, title: 'End this stretch and close', children: 'stop' })
      ]
    })
  ])
}

/** One-line agent status for the pane's top bar. */
function AgentStatus({ model }) {
  const { busy, elapsed, rec } = useFocusedStatus(model.$activity)
  const bySession = useValue(model.$bySession)
  const elsewhere = !busy && anyBusy(bySession)
  const text = busy
    ? `Hermes is working${elapsed != null ? ` · ${formatDuration(elapsed)}` : ''}`
    : elsewhere
      ? 'Hermes is working in another chat'
      : rec && rec.lastDurationMs != null
        ? `Hermes finished · took ${formatDuration(rec.lastDurationMs)}`
        : 'Hermes is idle'
  return jsxs('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 8, ...S.muted },
    children: [jsx(Dot, { on: busy || elsewhere }), jsx('span', { style: S.mono, children: text })]
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
      jsx(AgentStatus, { model }),
      DEV.keepPaneOpen
        ? jsx('span', { style: { ...S.faint, ...S.mono }, title: 'DEV.keepPaneOpen is on in desktop/plugin.js', children: '· dev: always open' })
        : null,
      jsx('span', { style: { flex: 1 } }),
      jsx(TextToggle, { value: ui.view, onChange: setView, options: [['stretch', 'stretch'], ['debug', 'debug']] }),
      jsx('span', { style: S.faint, children: '·' }),
      jsx(TextButton, { onClick: hidePane, title: 'Hide until the next task', children: 'hide' })
    ]
  })
  return jsxs('div', {
    ref: rootRef,
    style: { height: '100%', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 },
    children: [bar, ui.view === 'debug' ? jsx(DebugView, { model }) : jsx(StretchView, { model })]
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export default {
  id: PLUGIN_ID,
  name: 'Stretch Break',
  register(ctx) {
    // Per-registration stores: a hot reload gets fresh ones, never stacked state.
    const $activity = atom(emptyActivity())
    const $events = atom({ counts: {}, recent: [] })
    /** pinned: user opened the pane by hand; dismissed: user hid it during the current busy spell. */
    const $ui = atom({ pinned: false, dismissed: false, view: 'stretch' })
    const $paneOpen = atom(false)
    /** True while the exit animation plays, just before the pane is unregistered. */
    const $closing = atom(false)
    /** Exercise routine state (see idleRoutine/startRoutine). Lives here, not in
     *  the pane, so it survives the pane unmounting and remounting. */
    const $routine = atom(idleRoutine())

    // Per-session turn-busy map. Fall back to the focused flag on older
    // desktops that lack busyBySession (this fallback can't tell a session
    // switch from a finished turn, so it's strictly a degraded mode).
    const $bySession =
      host.state.busyBySession ||
      computed([host.state.busy, host.state.focusedSessionId], (busy, id) => ({ [id || 'focused']: busy }))

    const patchUi = patch => $ui.set({ ...$ui.get(), ...patch })

    // ── Pane lifecycle ───────────────────────────────────────────────────────
    // The pane contribution only EXISTS while it should show (same pattern as
    // core's ⌘K-summoned Logs pane): registered when work starts, disposed a
    // moment after all work ends, so the idle layout is untouched.
    //   want → mount (or cancel a pending exit)
    //   !want → [grace HIDE_DELAY_MS unless immediate] → exit anim EXIT_MS → unregister
    const model = { $activity, $events, $bySession, $ui, $paneOpen, $closing, $routine, actions: {} }
    const paneContribution = {
      id: 'pane',
      area: 'panes',
      title: 'Stretch Break',
      data: { placement: 'bottom', dock: { pane: 'workspace', pos: 'bottom' }, height: PANE_HEIGHT },
      render: () => jsx(StretchPane, { model })
    }
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
        cancelExit = stop(cancelExit) // work resumed mid-exit: animate back in
        $closing.set(false)
      }
      if (disposePane) return
      disposePane = ctx.register(paneContribution)
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
      DEV.keepPaneOpen ||
      shouldShowPane({ anyBusy: anyBusy($bySession.get()), routineActive: isRoutineActive($routine.get()), ...$ui.get() })
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

    // ── Turn transitions from busyBySession ──────────────────────────────────
    let prevBusy = {}
    const onBusyMap = next => {
      const map = next || {}
      const transitions = diffBusy(prevBusy, map)
      prevBusy = { ...map }
      if (transitions.length) $activity.set(applyTransitions($activity.get(), transitions, Date.now()))
      // A dismissal lasts until every session is idle again.
      if (!anyBusy(map) && $ui.get().dismissed) patchUi({ dismissed: false })
      syncPane()
    }

    // ── Raw gateway events (discovery aid for later stages) ──────────────────
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

    // ── Actions ──────────────────────────────────────────────────────────────
    // Routine driver: phase changes happen here (not in the pane) so they
    // advance even while the pane isn't mounted; the pane just renders.
    ctx.setInterval(() => {
      const s = $routine.get()
      const next = tickRoutine(s, EXERCISE, Date.now())
      if (next !== s) $routine.set(next)
    }, 200)
    // Routine start/end changes whether the pane is wanted (e.g. done after
    // Hermes already finished → linger, then leave).
    ctx.onDispose($routine.listen(() => syncPane()))
    const setRoutine = fn => $routine.set(fn($routine.get(), Date.now()))

    const hidePane = () => {
      // Hiding is "I'm done with this": stop any routine too.
      $routine.set(idleRoutine())
      patchUi({ pinned: false, dismissed: anyBusy($bySession.get()) })
      syncPane({ immediate: true })
    }
    const showPane = (view = $ui.get().view) => {
      patchUi({ pinned: true, dismissed: false, view })
      syncPane()
    }
    Object.assign(model.actions, {
      hidePane,
      showPane,
      togglePane: () => (paneShowing() ? hidePane() : showPane()),
      setView: view => patchUi({ view }),
      startStretch: () => setRoutine((_, now) => startRoutine(EXERCISE, now)),
      pauseStretch: () => setRoutine(pauseRoutine),
      resumeStretch: () => setRoutine(resumeRoutine),
      skipStretch: () => setRoutine((s, now) => skipRoutine(s, EXERCISE, now)),
      // Stop = done with the stretch: close now (just the exit fade, no grace period).
      stopStretch: hidePane,
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

    onBusyMap($bySession.get()) // seed: turns already running at load count as starting now
    ctx.onDispose($bySession.listen(onBusyMap))

    const palette = (id, label, run) => ({
      id,
      area: PALETTE_AREA,
      data: { id: `stretch-break.${id}`, label: `Stretch Break: ${label}`, keywords: ['stretch', 'break'], run }
    })
    ctx.registerMany([
      { id: 'chip', area: STATUSBAR_AREAS.right, order: 125, render: () => jsx(StatusChip, { model }) },
      palette('toggle', 'Toggle panel', model.actions.togglePane),
      palette('debug', 'Show debug panel', () => showPane('debug')),
      palette('clear', 'Clear activity log', model.actions.clear)
    ])
  }
}
