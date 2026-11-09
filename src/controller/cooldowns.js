/**
 * When the last stretch and the last breather ended (persisted in
 * ctx.storage), for each kind's cooldown. Finishing, stopping or declining
 * an exercise counts; an offer withdrawn because Hermes finished doesn't.
 */
import { sessionOf } from '../session.js'
import { justFinished } from './store.js'

export function createCooldowns(ctx, store) {
  let lastBreakAt = ctx.storage.get('lastBreakAt', null)
  let lastBreatherAt = ctx.storage.get('lastBreatherAt', null)

  /**
   * A break ended: start its kind's cooldown. A session (picked, even one
   * closing on breathing) is a stretch break; the breather is a breathing
   * exercise offered on its own.
   */
  const markBreak = () => {
    const s = store.$routine.get()
    const single = !s.picker && sessionOf(s).parts.length === 1 ? sessionOf(s).parts[0] : null
    if (single && single.type === 'breathing') {
      lastBreatherAt = Date.now()
      ctx.storage.set('lastBreatherAt', lastBreatherAt)
    } else {
      lastBreakAt = Date.now()
      ctx.storage.set('lastBreakAt', lastBreakAt)
    }
  }
  store.onRoutine((s, was) => {
    if (justFinished(s, was)) markBreak()
  })

  return { markBreak, lastBreakAt: () => lastBreakAt, lastBreatherAt: () => lastBreatherAt }
}
