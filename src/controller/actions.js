/** What the card's buttons, the settings page and ⌘K do. */
import { menuPlan, pickBreather, planMenu } from '../plan-session.js'
import { idleRoutine, isTimed, pauseRoutine, resumeRoutine, skipRoutine, startRoutine } from '../routine.js'
import { sessionOf } from '../session.js'

export function createActions(store, { card, cooldowns, sound, activity }) {
  const { $routine, $ui, $settings, setRoutine } = store

  /** Done with it (Stop, Not now): close now, exit fade only. */
  const close = () => {
    // Closing an offer or an exercise counts as a break for the cooldown.
    if ($ui.get().offered || isTimed($routine.get())) cooldowns.markBreak()
    store.patchUi({ offered: false, opened: false })
    card.leave() // first: it fades out as it is
    $routine.set(idleRoutine()) // sound stops now; the card's frozen frame stays
  }

  /**
   * ⌘K may open the picker (`picker`) or the breathing card: not over an
   * exercise underway, nor over the same card already showing. Over the
   * other card it switches (what you asked for wins; it's yours now, not an
   * offer, so Not now there starts no cooldown).
   */
  const canOpen = picker => {
    const s = $routine.get()
    if (isTimed(s)) return false
    const { offered, opened } = $ui.get()
    return !((offered || opened) && s.phase === 'idle' && s.picker === picker)
  }

  return {
    /**
     * ⌘K "Start stretch session": open the card on the session picker (it
     * stays until you pick or press Not now). An exercise underway, or the
     * picker already up: leave it be. The breathing card up: switch.
     */
    open: () => {
      if (!canOpen(true)) return
      $routine.set(idleRoutine())
      store.patchUi({ opened: true, offered: false, movedAt: activity.movedAt(Date.now()), menu: planMenu() })
      card.sync()
    },
    /**
     * ⌘K "Start breathing session": the breather's card (a breathing
     * exercise with no holds, on its own, Start / Not now). An exercise underway, or that card already
     * up: leave it be. The picker up: switch.
     */
    openBreathing: () => {
      if (!canOpen(false)) return
      $routine.set(idleRoutine([pickBreather()]))
      store.patchUi({ opened: true, offered: false })
      card.sync()
    },
    /** Start a session of `length` (short / medium / long): what the picker showed for it. */
    startSession: length => {
      sound.wake()
      setRoutine((s, now) => startRoutine(menuPlan($ui.get().menu, length, $settings.get().windDown), now, length))
    },
    /** "End with a breathing exercise" (the card's tick box and Settings). */
    setWindDown: on => store.updateSettings({ windDown: on }),
    /** Start one exercise right away (tests, and any future entry point). */
    startExercise: ex => {
      sound.wake()
      $routine.set(startRoutine([ex.id], Date.now()))
    },
    /** Start the single exercise the card shows (the breather's Start). */
    start: () => {
      sound.wake()
      setRoutine((s, now) => startRoutine(s.plan, now))
    },
    pause: () => setRoutine(pauseRoutine),
    resume: () => {
      sound.wake()
      setRoutine(resumeRoutine)
    },
    /** To the end of the current bar segment (see skipRoutine). */
    skip: () => {
      sound.wake()
      setRoutine((s, now) => skipRoutine(s, sessionOf(s), now))
    },
    stop: close,
    notNow: close,
    /** Close the well-done screen now. */
    dismissDone: card.dismissDone,
    updateSettings: store.updateSettings,
    setSoundOn: sound.setOn,
    toggleSound: () => sound.setOn(!$settings.get().soundOn)
  }
}
