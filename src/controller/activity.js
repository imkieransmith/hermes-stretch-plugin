/**
 * Your current stint, for "It's been X since you last moved" (see active.js).
 * Persisted in ctx.storage, so restarting Hermes mid-stint keeps it.
 */
import { lastMovedAt, spellEnded, spellStarted } from '../active.js'

export function createActivity(ctx, { cooldowns }) {
  let a = { activeSince: ctx.storage.get('activeSince', null), lastActiveAt: ctx.storage.get('lastActiveAt', null) }
  let busy = false
  const save = next => {
    a = next
    ctx.storage.set('activeSince', a.activeSince)
    ctx.storage.set('lastActiveAt', a.lastActiveAt)
  }
  return {
    spellStarted: now => {
      busy = true
      save(spellStarted(a, now))
    },
    spellEnded: now => {
      busy = false
      save(spellEnded(a, now))
    },
    /** When you last moved (epoch ms), or null if we can't say. */
    movedAt: now => lastMovedAt(a, { busy, lastBreakAt: cooldowns.lastBreakAt(), now })
  }
}
