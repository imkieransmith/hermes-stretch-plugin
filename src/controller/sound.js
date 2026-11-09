/**
 * The one sound player, driven by the routine: whatever soundPlan() says
 * for the current state is scheduled; anything else is cancelled. Audio
 * only starts from our own buttons' clicks (wake), never from a component.
 */
import { sessionOf } from '../session.js'
import { soundPlan } from '../sound/plan.js'
import { createSound } from '../sound/player.js'
import { justFinished } from './store.js'

export function createSoundDriver(ctx, store) {
  const sound = createSound()
  ctx.onDispose(() => sound.close())
  const on = () => store.$settings.get().soundOn
  const sync = () => {
    const r = store.$routine.get()
    sound.sync(on() ? soundPlan(r, sessionOf(r)) : [])
  }
  store.onRoutine((s, was) => {
    // Skipped to the end: the scheduled chime was cancelled, so ring now.
    if (justFinished(s, was) && on()) sound.playOnce('chime')
    sync()
  })

  return {
    /** Call from our own buttons: a click is when audio is allowed to start. */
    wake: () => {
      if (on()) sound.wake()
    },
    /** Drop every beat queued or ringing, whatever the routine says (after a sleep). */
    silence: () => sound.silence(),
    setOn: value => {
      store.updateSettings({ soundOn: value })
      if (value) sound.wake()
      else sound.silence()
      sync()
    }
  }
}
