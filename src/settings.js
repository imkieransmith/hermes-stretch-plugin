/** User settings: defaults and validation of what's stored (ctx.storage). */

export const DEFAULT_SETTINGS = {
  /** Master switch for automatic offers (⌘K still starts a break). */
  offersEnabled: true,
  /** A turn must have used a tool and run this long before we offer. */
  offerDelaySec: 10,
  /** No automatic offer within this long of the last break (0 = every task). */
  cooldownMin: 20,
  /** Offer a breather when your messages get tense (checked on this device). */
  breathersEnabled: true,
  /** Soft ticks to count along with, and a chime at the end. */
  soundOn: true,
  /** End each session with a breathing exercise (also the picker's tick box). */
  windDown: true
}

export const OFFER_DELAY_CHOICES = [10, 20, 30, 60]

export const COOLDOWN_CHOICES = [0, 10, 20, 30, 45]

/** Merge stored settings over the defaults, dropping anything malformed. */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return s
  for (const key of ['offersEnabled', 'breathersEnabled', 'soundOn', 'windDown'])
    if (typeof raw[key] === 'boolean') s[key] = raw[key]
  for (const key of ['offerDelaySec', 'cooldownMin']) {
    const n = raw[key]
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) s[key] = n
  }
  return s
}
