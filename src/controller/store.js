/**
 * The plugin's state, created fresh in each register() (a hot reload never
 * stacks old state). The card reads these atoms; controllers change them.
 */
import { atom } from '@hermes/plugin-sdk'
import { planMenu } from '../plan-session.js'
import { idleRoutine } from '../routine.js'
import { normalizeSettings } from '../settings.js'

export function createStore(ctx) {
  /**
   * offered: we offered a break in the current busy spell.
   * opened: the user opened the card themselves (⌘K), so it stays up.
   * movedAt: when you last moved, for the picker's title (null: unknown).
   * menu: the picker's choices (planMenu), picked afresh each time it opens.
   */
  const $ui = atom({ offered: false, opened: false, movedAt: null, menu: planMenu() })
  /** True while the exit animation plays, just before the card is unregistered. */
  const $closing = atom(false)
  /** Exercise routine state (see idleRoutine/startRoutine). Lives here, not in
   *  the card, so it survives the card unmounting and remounting. */
  const $routine = atom(idleRoutine())
  /** User preferences (Settings ▸ Plugins ▸ OpenChi), persisted. */
  const $settings = atom(normalizeSettings(ctx.storage.get('settings', null)))

  return {
    $ui,
    $closing,
    $routine,
    $settings,
    patchUi: patch => $ui.set({ ...$ui.get(), ...patch }),
    /** Apply a pure routine transition `fn(state, now)`. */
    setRoutine: fn => $routine.set(fn($routine.get(), Date.now())),
    updateSettings: patch => {
      $settings.set(normalizeSettings({ ...$settings.get(), ...patch }))
      ctx.storage.set('settings', $settings.get())
    },
    /** Call `fn(state, previousPhase)` on every routine change, until dispose. */
    onRoutine: fn => {
      let prev = $routine.get().phase
      ctx.onDispose(
        $routine.listen(s => {
          const was = prev
          prev = s.phase
          fn(s, was)
        })
      )
    }
  }
}

/** Did this routine change just finish an exercise? */
export const justFinished = (s, was) => s.phase === 'done' && was !== 'done'
