// Shared test helpers: a controllable clock and a fake PluginContext whose
// timers/intervals run on that clock.

export const clock = {
  t: 1_000_000,
  install() {
    Date.now = () => this.t
  }
}
clock.install()

const STEP_MS = 100

export function fakeCtx(stored = {}) {
  const disposers = []
  const contributions = []
  const settingsPages = []
  const timers = new Set() // { fn, at }
  const intervals = new Set() // { fn, every, next }
  const listeners = {}
  const storage = new Map(Object.entries(stored))

  const add = c => {
    contributions.push(c)
    return () => {
      const i = contributions.indexOf(c)
      if (i >= 0) contributions.splice(i, 1)
    }
  }

  const runDue = () => {
    for (const t of [...timers].sort((a, b) => a.at - b.at)) {
      if (t.at <= clock.t && timers.has(t)) {
        timers.delete(t)
        t.fn()
      }
    }
    for (const iv of [...intervals]) {
      if (iv.next <= clock.t && intervals.has(iv)) {
        iv.next = clock.t + iv.every
        iv.fn()
      }
    }
  }

  const ctx = {
    contributions,
    settingsPages,
    storage: {
      get: (k, d) => (storage.has(k) ? storage.get(k) : d),
      set: (k, v) => storage.set(k, v),
      remove: k => storage.delete(k)
    },
    /** Raw view of what was persisted (for assertions / reloading). */
    stored: () => Object.fromEntries(storage),
    /** The card below the input, if it's showing. */
    card: () => contributions.find(c => c.area === 'composer.underside'),
    /** Advance the clock by `ms`, firing timers and intervals on the way. */
    advance(ms) {
      const end = clock.t + ms
      while (clock.t < end) {
        clock.t = Math.min(end, clock.t + STEP_MS)
        runDue()
      }
    },
    /** Deliver a gateway event to ctx.onEvent listeners. */
    emit(type, ev = {}) {
      for (const fn of [...(listeners[type] || []), ...(listeners['*'] || [])]) fn({ type, ...ev })
    },
    dispose: () => {
      disposers.splice(0).forEach(fn => fn())
      timers.clear()
      intervals.clear()
    },
    register: add,
    registerMany: cs => {
      const ds = cs.map(add)
      return () => ds.forEach(d => d())
    },
    registerSettingsPage: page => (settingsPages.push(page), () => {}),
    onDispose: fn => disposers.push(fn),
    onEvent: (type, fn) => {
      ;(listeners[type] ||= []).push(fn)
      return () => {}
    },
    setTimeout: (fn, ms) => {
      const t = { fn, at: clock.t + ms }
      timers.add(t)
      return () => timers.delete(t)
    },
    setInterval: (fn, ms) => {
      const iv = { fn, every: ms, next: clock.t + ms }
      intervals.add(iv)
      return () => intervals.delete(iv)
    }
  }
  return ctx
}

/** The shared model every render gets (via the always-registered settings page). */
export function modelOf(ctx) {
  return ctx.settingsPages[0].render().props.model
}

/** Expand every function component (stub hooks are plain values), so a
 *  missing import or bad prop access throws in tests rather than in the app. */
export function renderTree(node, seen = []) {
  if (Array.isArray(node)) {
    node.forEach(n => renderTree(n, seen))
    return seen
  }
  if (!node || typeof node !== 'object') return seen
  if (typeof node.type === 'function') {
    seen.push(node.type.name)
    return renderTree(node.type(node.props || {}), seen)
  }
  if (node.type === undefined) throw new Error('element with undefined type (missing import?)')
  renderTree(node.props && node.props.children, seen)
  return seen
}
