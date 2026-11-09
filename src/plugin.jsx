/**
 * OpenChi — a Hermes Desktop plugin.
 *
 * What it does:
 *   - When a task has used a tool and run `offerDelaySec`, a card appears
 *     below the input box (COMPOSER_AREAS.underside) offering a guided
 *     session: short / medium / long, exercises picked at random. Nothing
 *     starts until you press a button. Subject to a cooldown. A session
 *     underway stays up after Hermes finishes.
 *   - When your messages get tense (a weighted score; see tension.js), the
 *     same card offers a minute of slow breathing instead (a breathing
 *     exercise with no breath holds), with its own cooldown. Detection is a
 *     pass-through composer middleware + tensionScore(): the text is
 *     checked on this device and never stored, sent or changed.
 *   - ⌘K "Start stretch session" opens the session picker; "Start breathing
 *     session" opens that breathing card on its own.
 *   - Settings ▸ Plugins ▸ OpenChi: offers, delay, cooldown, ending on a
 *     breathing exercise, breathers, sound (ctx.storage).
 *
 * This is the entry point: register() wires the controllers together. It's
 * SOURCE: scripts/build.mjs bundles src/ into desktop/plugin.js, the file
 * Hermes loads. See AGENTS.md for the source map and rules.
 */
import { PLUGIN_ID } from './config.js'
import { isStalled, tickRoutine } from './routine.js'
import { sessionOf } from './session.js'
import { createActivity } from './controller/activity.js'
import { createActions } from './controller/actions.js'
import { createCard } from './controller/card.js'
import { registerCommands } from './controller/commands.js'
import { createCooldowns } from './controller/cooldowns.js'
import { createOffers } from './controller/offers.js'
import { createSoundDriver } from './controller/sound.js'
import { createStore } from './controller/store.js'
import { createTensionWatch } from './controller/tension-watch.js'
import { SettingsPage } from './ui/SettingsPage.jsx'
import { ComposerCard } from './ui/StretchCard.jsx'

export default {
  id: PLUGIN_ID,
  name: 'OpenChi',
  register(ctx) {
    // Everything is created per registration: a hot reload gets fresh state.
    const store = createStore(ctx)
    /** What every piece of UI gets: the atoms to read, the actions to call. */
    const model = { $ui: store.$ui, $closing: store.$closing, $routine: store.$routine, $settings: store.$settings }

    // Order matters a little: these listen to routine changes in this order
    // (cooldown recorded, then sound, then the card).
    const cooldowns = createCooldowns(ctx, store)
    const sound = createSoundDriver(ctx, store)
    const card = createCard(ctx, store, { render: () => <ComposerCard model={model} /> })
    let offers = null
    const tension = createTensionWatch(ctx, store, { onChange: () => offers.check() })
    const activity = createActivity(ctx, { cooldowns })
    offers = createOffers(ctx, store, { card, cooldowns, tension, activity })
    model.actions = createActions(store, { card, cooldowns, sound, activity })

    // Routine driver. Phase changes happen here (not in the card) so they
    // advance even while the card isn't mounted; the card just renders. Also
    // re-checks for an offer (the delay can elapse between events).
    ctx.setInterval(() => {
      const s = store.$routine.get()
      const now = Date.now()
      if (isStalled(s, now)) {
        // The computer slept mid-exercise: stop the session (as Stop does)
        // rather than race through what was missed to "All done".
        sound.silence() // beats queued before the sleep mustn't play now
        model.actions.stop()
      } else {
        const next = tickRoutine(s, sessionOf(s), now)
        if (next !== s) store.$routine.set(next)
      }
      offers.check()
    }, 200)

    card.sync()
    registerCommands(ctx, model.actions)
    // Feature-detected: older hosts lack registerSettingsPage.
    ctx.registerSettingsPage?.({
      id: 'settings',
      title: 'OpenChi',
      icon: 'heart',
      render: () => <SettingsPage model={model} />
    })
  }
}
