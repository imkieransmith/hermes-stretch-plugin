/**
 * Showing and hiding the card below the input. The contribution only EXISTS
 * while it should show: registered when we offer an exercise, disposed a
 * moment after it's no longer wanted.
 *   want → mount (or cancel a pending exit)
 *   !want → [grace HIDE_DELAY_MS unless immediate] → exit anim EXIT_MS → unregister
 * The well-done screen lingers DONE_LINGER_MS, then leaves by itself.
 */
import { COMPOSER_AREAS } from '@hermes/plugin-sdk'
import { DONE_LINGER_MS, EXIT_MS, HIDE_DELAY_MS } from '../config.js'
import { shouldShowCard } from '../policy.js'
import { idleRoutine, isRoutineActive, isTimed } from '../routine.js'
import { justFinished } from './store.js'

const stop = cancel => {
  if (cancel) cancel()
  return null
}

export function createCard(ctx, store, { render }) {
  const { $routine, $closing } = store
  const contribution = { id: 'composer-below', area: COMPOSER_AREAS.underside, render }
  let disposeCard = null
  let cancelGrace = null
  let cancelExit = null
  /** The well-done screen's own timer. */
  let cancelDone = null
  /**
   * We're closing it on purpose (Stop, Not now, Close, well done over): it's
   * unwanted whatever it shows, until it's gone or a new routine starts.
   */
  let leaving = false

  const mount = () => {
    cancelGrace = stop(cancelGrace)
    if (cancelExit) {
      cancelExit = stop(cancelExit) // wanted again mid-exit: animate back in
      $closing.set(false)
    }
    if (!disposeCard) disposeCard = ctx.register(contribution)
  }
  const beginExit = () => {
    cancelGrace = stop(cancelGrace)
    if (!disposeCard || cancelExit) return
    $closing.set(true)
    cancelExit = ctx.setTimeout(() => {
      cancelExit = null
      const dispose = disposeCard
      disposeCard = null
      dispose()
      $closing.set(false)
      leaving = false
      // Gone from screen: a finished (or withdrawn) exercise resets, so the
      // next time the card opens it starts fresh.
      if (!isTimed($routine.get()) && $routine.get().phase !== 'idle') $routine.set(idleRoutine())
      sync() // asked for again while it faded out (⌘K): back it comes
    }, EXIT_MS)
  }
  const wanted = () =>
    !leaving &&
    ($routine.get().phase === 'done' || // well done shows until dismissed
      shouldShowCard({ ...store.$ui.get(), routineActive: isRoutineActive($routine.get()) }))

  /** Mount or (after the grace period, or now if `immediate`) remove the card. */
  const sync = ({ immediate = false } = {}) => {
    if (wanted()) return mount()
    if (!disposeCard) return
    if (immediate) return beginExit()
    cancelGrace ??= ctx.setTimeout(() => {
      cancelGrace = null
      if (!wanted()) beginExit()
    }, HIDE_DELAY_MS)
  }

  /**
   * Close the card now: straight into the exit fade (no grace period). Call
   * it BEFORE resetting the routine, so the card fades out showing what it
   * showed (it freezes while $closing), not the idle view.
   */
  const leave = () => {
    cancelDone = stop(cancelDone)
    leaving = true
    beginExit()
  }

  /** Well-done screen over (timer or Close): leave. */
  const dismissDone = () => {
    cancelDone = stop(cancelDone)
    if ($routine.get().phase !== 'done') return
    leave() // the routine resets to idle once it's gone
  }

  store.onRoutine((s, was) => {
    if (justFinished(s, was)) {
      // The well-done screen owns the card now: it leaves by itself.
      store.patchUi({ offered: false, opened: false })
      cancelDone = stop(cancelDone)
      cancelDone = ctx.setTimeout(dismissDone, DONE_LINGER_MS)
    } else if (s.phase !== 'done') {
      cancelDone = stop(cancelDone)
    }
    if (isTimed(s)) leaving = false // a new offer or exercise wants the card
    sync() // start/end of a routine changes whether the card is wanted
  })

  return { sync, leave, dismissDone }
}
