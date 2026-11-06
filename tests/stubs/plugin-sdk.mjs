// Minimal stand-in for @hermes/plugin-sdk — just enough for the module to
// evaluate and for register(ctx) to run against fake atoms in tests.

export function atom(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set(next) {
      value = next
      for (const fn of [...listeners]) fn(value)
    },
    listen(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    subscribe(fn) {
      fn(value)
      return this.listen(fn)
    }
  }
}

export function computed(stores, fn) {
  const out = atom(fn(...stores.map(s => s.get())))
  for (const s of stores) s.listen(() => out.set(fn(...stores.map(x => x.get()))))
  return out
}

export const host = {
  state: {
    busy: atom(false),
    busyBySession: atom({}),
    focusedSessionId: atom(null),
    awaitingResponse: atom(false),
    gateway: atom('open')
  },
  notify: () => {}
}

export const useValue = a => a.get()
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }
export const PALETTE_AREA = 'palette'
export const COMPOSER_AREAS = {
  top: 'composer.top',
  bottom: 'composer.bottom',
  underside: 'composer.underside',
  leading: 'composer.leading',
  actions: 'composer.actions'
}
export const Button = () => null
export const Tip = ({ children }) => children
export const ListRow = () => null
export const ToggleRow = () => null
export const SegmentedControl = () => null
export const pluginSettingsHref = (id, page) => `/settings?tab=plugins&plugin=${id}${page ? `&ppage=${page}` : ''}`
host.navigate = () => {}
