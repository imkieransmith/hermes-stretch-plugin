/**
 * Session lengths, and picking a session's exercises at random (pure: the
 * random source is passed in). A session is:
 *   N body exercises (stretch or mobility; standing ones last, at most
 *   MAX_STANDING, never two from one area back to back)
 *   → one eye exercise → a breathing exercise if "wind down" is on.
 *
 * The picks are made when the picker opens (a "menu": body picks per
 * length, plus the closers), and the button you press starts that. The
 * buttons show estimates from the library's average lengths, not the
 * exact time of the picks.
 */

import { EXERCISES } from './exercises/index.js'
import { NEXT_MS, PREP_MS } from './timing.js'

/** How many body exercises each length has. */
export const SESSION_LENGTHS = {
  short: { label: 'Short', exercises: 2 },
  medium: { label: 'Medium', exercises: 4 },
  long: { label: 'Long', exercises: 6 }
}

export const SESSION_IDS = Object.keys(SESSION_LENGTHS)

/** At most this many standing exercises in a session (grouped at the end: you stand up once). */
export const MAX_STANDING = 2

/** Picked for a session's body: stretches and mobility. */
export const isBody = ex => ex.type === 'stretch' || ex.type === 'mobility'

const isStanding = ex => ex.position === 'standing'

/** Pick one at random (`random` returns 0 ≤ x < 1, like Math.random). */
const pickFrom = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]

/**
 * One try at `n` body exercises in order. `strict`: every rule (no
 * repeats, no same area back to back, standing last and at most
 * MAX_STANDING); null if it paints itself into a corner. Not strict: each
 * slot relaxes the rules one at a time until something fits (a library too
 * small for the rules, e.g. in tests).
 */
function tryBody(n, pool, random, strict) {
  const seq = []
  for (let i = 0; i < n; i++) {
    const prev = seq[i - 1]
    const standing = seq.filter(isStanding).length
    const fresh = ex => !seq.includes(ex)
    const areaOk = ex => !prev || ex.area !== prev.area
    const placeOk = ex =>
      isStanding(ex) ? i >= n - MAX_STANDING && standing < MAX_STANDING : !(prev && isStanding(prev))
    const rules = [ex => fresh(ex) && areaOk(ex) && placeOk(ex)]
    if (!strict)
      rules.push(
        ex => fresh(ex) && placeOk(ex),
        fresh,
        ex => ex !== prev,
        () => true
      )
    const options = rules.map(rule => pool.filter(rule)).find(list => list.length)
    if (!options) return null
    seq.push(pickFrom(options, random))
  }
  return seq
}

/** `n` random body exercises (ids), following the session rules. */
export function pickBody(n, { library = Object.values(EXERCISES), random = Math.random } = {}) {
  const pool = library.filter(isBody)
  if (!pool.length) return []
  for (let attempt = 0; attempt < 20; attempt++) {
    const seq = tryBody(n, pool, random, true)
    if (seq) return seq.map(ex => ex.id)
  }
  return tryBody(n, pool, random, false).map(ex => ex.id)
}

/** A random exercise (id) of `type` (and `filter`), or null if the library has none. */
function pickType(type, { library = Object.values(EXERCISES), random = Math.random } = {}, filter = () => true) {
  const list = library.filter(ex => ex.type === type && filter(ex))
  return list.length ? pickFrom(list, random).id : null
}

/** The eye exercise that closes every session. */
export const pickEyes = opts => pickType('eyes', opts)

/** The breathing exercise that closes a session when "wind down" is on. */
export const pickWindDown = opts => pickType('breathing', opts)

/** The breather offered on its own when things get tense: no breath holds. */
export const pickBreather = opts => pickType('breathing', opts, ex => ex.breather)

/** The picker's choices: each length's body exercises, and the closers. */
export function planMenu(opts = {}) {
  const menu = { eyes: pickEyes(opts), windDown: pickWindDown(opts) }
  for (const id of SESSION_IDS) menu[id] = pickBody(SESSION_LENGTHS[id].exercises, opts)
  return menu
}

/** The plan for `length` from a menu: its body exercises, the eye closer, then breathing if `windDown`. */
export function menuPlan(menu, length, windDown) {
  const body = menu[length] || menu.medium
  return [...body, ...(menu.eyes ? [menu.eyes] : []), ...(windDown && menu.windDown ? [menu.windDown] : [])]
}

/** Average length (ms) of the exercises that pass `test`, steps only. */
const averageMs = (test, library) => {
  const list = library.filter(test)
  return list.length ? list.reduce((n, ex) => n + ex.steps.reduce((m, st) => m + st.ms, 0), 0) / list.length : 0
}

/**
 * A length's rough time: get ready, its body exercises and the eye closer
 * (each after a "next up"), from the library's averages. Breathing isn't
 * included: its tick box says "+1m".
 */
export function estimateMs(length, library = Object.values(EXERCISES)) {
  const n = SESSION_LENGTHS[length].exercises
  const eyes = library.some(ex => ex.type === 'eyes')
  return (
    PREP_MS +
    n * averageMs(isBody, library) +
    (eyes ? averageMs(ex => ex.type === 'eyes', library) : 0) +
    (n - 1 + (eyes ? 1 : 0)) * NEXT_MS
  )
}

/** A rough time for a button: "~1m" (whole minutes, never ~0m). */
export function approxText(ms) {
  return `~${Math.max(1, Math.round(ms / 60_000))}m`
}

const ESTIMATES = Object.fromEntries(SESSION_IDS.map(id => [id, approxText(estimateMs(id))]))

/** A length's button text: "Medium ~4m". */
export function lengthText(length) {
  return `${SESSION_LENGTHS[length].label} ${ESTIMATES[length]}`
}
