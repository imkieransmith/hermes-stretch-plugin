/**
 * "It's been X since you last moved" (pure). X counts from the start of your
 * stint (the first busy spell after ACTIVE_GAP_MS with nothing running) or
 * your last break, whichever is later. Activity: { activeSince, lastActiveAt }
 * (epoch ms or null), persisted by controller/activity.js.
 */

/** This long with nothing running and the next busy spell starts a new stint. */
export const ACTIVE_GAP_MS = 30 * 60_000

/** A busy spell started. */
export function spellStarted(a, now) {
  const fresh = a.activeSince == null || a.lastActiveAt == null || now - a.lastActiveAt >= ACTIVE_GAP_MS
  return { activeSince: fresh ? now : a.activeSince, lastActiveAt: now }
}

/** A busy spell ended. */
export function spellEnded(a, now) {
  return { ...a, lastActiveAt: now }
}

/**
 * When you last moved, as far as we know (epoch ms), or null: no stint yet,
 * or the stint went quiet ACTIVE_GAP_MS ago (you've probably been away).
 */
export function lastMovedAt(a, { busy, lastBreakAt, now }) {
  if (a.activeSince == null) return null
  if (!busy && (a.lastActiveAt == null || now - a.lastActiveAt >= ACTIVE_GAP_MS)) return null
  return Math.max(a.activeSince, lastBreakAt ?? -Infinity)
}

/** "a few minutes", "25 minutes", "an hour", "an hour and a half", "2½ hours". */
export function sinceText(ms) {
  const min = Math.round(ms / 60_000)
  if (min < 5) return 'a few minutes'
  if (min < 55) return `${min} minutes`
  const halves = Math.round(min / 30) // nearest half hour
  if (halves <= 2) return 'an hour'
  if (halves === 3) return 'an hour and a half'
  const hours = Math.floor(halves / 2)
  return halves % 2 ? `${hours}½ hours` : `${hours} hours`
}

/** The picker's title. */
export function movedTitle(movedAt, now) {
  return movedAt == null ? 'Time to move a little?' : `It’s been ${sinceText(now - movedAt)} since you last moved`
}
