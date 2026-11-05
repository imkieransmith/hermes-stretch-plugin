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
import { useEffect, useState } from 'react'

export const PLUGIN_ID = 'stretch-break'

const LOG_LIMIT = 40
const EVENT_LIMIT = 30
/** High-frequency event types we count but don't list individually. */
const NOISY_EVENTS = new Set(['message.delta', 'tool.progress'])

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

export function shortId(id) {
  if (!id) return '—'
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
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

/** Re-render every second while `active`. */
function useTicker(active) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [active])
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

function StatusChip({ $activity }) {
  const { busy, elapsed, rec } = useFocusedStatus($activity)
  const label = busy ? `Working${elapsed != null ? ` ${formatDuration(elapsed)}` : ''}` : 'Idle'
  const tip = busy
    ? 'Hermes is working on this chat'
    : rec && rec.lastDurationMs != null
      ? `Idle · last turn took ${formatDuration(rec.lastDurationMs)}`
      : 'Idle'
  return jsx(Tip, {
    label: tip,
    children: jsxs('span', {
      className: 'inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem]',
      style: { color: busy ? 'var(--ui-text-secondary)' : 'var(--ui-text-tertiary)', ...S.mono },
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

function ActivityPane({ $activity, $events, $bySession, clear }) {
  const { busy, focusedId, elapsed } = useFocusedStatus($activity)
  const awaiting = useValue(host.state.awaitingResponse)
  const gateway = useValue(host.state.gateway)
  const bySession = useValue($bySession)
  const activity = useValue($activity)
  const events = useValue($events)
  const busyIds = Object.keys(bySession || {}).filter(k => bySession[k])

  const header = jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: 10 },
    children: [
      jsx(Dot, { on: busy }),
      jsx('span', { style: { fontSize: 15, fontWeight: 600 }, children: busy ? 'Working' : 'Idle' }),
      busy && elapsed != null ? jsx('span', { style: { ...S.mono, ...S.muted }, children: formatDuration(elapsed) }) : null,
      jsx('span', { style: { flex: 1 } }),
      jsx(Button, { onClick: clear, children: 'Clear' })
    ]
  })

  const facts = jsxs('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', columnGap: 24, rowGap: 2 },
    children: [
      jsx(Row, { label: 'focused session', value: shortId(focusedId) }),
      jsx(Row, { label: 'awaiting response', value: String(awaiting) }),
      jsx(Row, { label: 'busy sessions', value: busyIds.length ? busyIds.map(shortId).join(', ') : 'none' }),
      jsx(Row, { label: 'gateway socket', value: String(gateway) })
    ]
  })

  const log = activity.log.slice(-12).reverse()
  const turnLog = jsxs('div', {
    style: S.section,
    children: [
      jsx('div', { style: { ...S.muted, marginBottom: 4 }, children: 'Turn transitions (newest first)' }),
      log.length === 0
        ? jsx('div', { style: S.faint, children: 'Nothing yet — send Hermes a message.' })
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
                  e.sessionId === focusedId ? jsx('span', { style: S.faint, children: '(focused)' }) : null
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
    style: { height: '100%', overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 },
    children: [header, facts, turnLog, eventLog]
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

    // Per-session turn-busy map. Fall back to the focused flag on older
    // desktops that lack busyBySession (this fallback can't tell a session
    // switch from a finished turn, so it's strictly a degraded mode).
    const $bySession =
      host.state.busyBySession ||
      computed([host.state.busy, host.state.focusedSessionId], (busy, id) => ({ [id || 'focused']: busy }))

    // ── Turn transitions from busyBySession ──────────────────────────────────
    let prevBusy = {}
    const onBusyMap = next => {
      const map = next || {}
      const transitions = diffBusy(prevBusy, map)
      prevBusy = { ...map }
      if (transitions.length) $activity.set(applyTransitions($activity.get(), transitions, Date.now()))
    }
    onBusyMap($bySession.get()) // seed: turns already running at load count as starting now
    ctx.onDispose($bySession.listen(onBusyMap))

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

    const clear = () => {
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

    ctx.registerMany([
      {
        id: 'chip',
        area: STATUSBAR_AREAS.right,
        order: 125,
        render: () => jsx(StatusChip, { $activity })
      },
      {
        id: 'pane',
        area: 'panes',
        title: 'Stretch Break',
        data: { placement: 'bottom', dock: { pane: 'workspace', pos: 'bottom' }, height: '240px' },
        render: () => jsx(ActivityPane, { $activity, $events, $bySession, clear })
      },
      {
        id: 'clear',
        area: PALETTE_AREA,
        data: {
          id: 'stretch-break.clear',
          label: 'Stretch Break: Clear activity log',
          keywords: ['stretch', 'activity', 'debug'],
          run: clear
        }
      }
    ])
  }
}
