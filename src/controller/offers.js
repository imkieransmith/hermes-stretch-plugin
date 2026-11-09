/**
 * Deciding when to offer a break. A "spell" is a stretch of time where any
 * chat is working. We offer at most once per spell: a breather (a
 * breathing exercise with no holds, on its own) if your messages got tense, otherwise the session
 * picker (short / medium / long) once the spell has used a tool and run
 * offerDelaySec. If Hermes finishes before you start, the offer is
 * withdrawn quietly (no cooldown).
 */
import { computed, host } from '@hermes/plugin-sdk'
import { pickBreather, planMenu } from '../plan-session.js'
import { anyBusy, shouldOffer, shouldOfferBreather } from '../policy.js'
import { idleRoutine, isRoutineActive } from '../routine.js'

export function createOffers(ctx, store, { card, cooldowns, tension, activity }) {
  const { $routine, $ui, $settings } = store
  let spell = null // { startedAt, toolSeen, offered }

  /**
   * Show an offer: the session picker (`breather` false) or a breather on
   * its own. Nothing starts by itself: it waits for a button.
   */
  const present = (breather, now) => {
    const menu = planMenu() // fresh picks for every offer
    $routine.set(breather ? idleRoutine([pickBreather()]) : idleRoutine())
    store.patchUi({ offered: true, movedAt: activity.movedAt(now), menu })
    card.sync()
  }

  /** Offer something now, if it's time. Safe to call as often as you like. */
  const check = () => {
    const now = Date.now()
    const armedAt = tension.armedAt(now)
    const routinePhase = $routine.get().phase
    const settings = $settings.get()
    let breather
    if (
      shouldOfferBreather({ spell, armedAt, settings, lastBreatherAt: cooldowns.lastBreatherAt(), routinePhase, now })
    ) {
      breather = true
      tension.consume()
    } else if (shouldOffer({ spell, settings, lastBreakAt: cooldowns.lastBreakAt(), routinePhase, now }))
      breather = false
    else return
    spell.offered = true // at most one offer of any kind per spell
    present(breather, now)
  }

  const endSpell = () => {
    spell = null
    activity.spellEnded(Date.now())
    // Hermes finished before the user engaged: withdraw quietly (no cooldown)
    // and leave straight away; an exercise already underway keeps the card.
    const withdrawing = $ui.get().offered && !isRoutineActive($routine.get())
    if ($ui.get().offered) store.patchUi({ offered: false })
    if (!withdrawing) return card.sync()
    card.leave() // first: it fades out showing the offer
    $routine.set(idleRoutine())
  }

  ctx.onEvent('tool.start', () => {
    if (!spell) return
    spell.toolSeen = true
    check()
  })

  // Per-session turn-busy map. Fall back to the focused flag on older
  // desktops that lack busyBySession (this fallback can't tell a session
  // switch from a finished turn, so it's strictly a degraded mode).
  const $bySession =
    host.state.busyBySession ||
    computed([host.state.busy, host.state.focusedSessionId], (busy, id) => ({ [id || 'focused']: busy }))
  const onBusyMap = map => {
    const busy = anyBusy(map)
    if (busy && !spell) {
      spell = { startedAt: Date.now(), toolSeen: false, offered: false }
      activity.spellStarted(spell.startedAt)
    } else if (!busy && spell) endSpell()
  }
  onBusyMap($bySession.get()) // seed: turns already running at load start a spell now
  ctx.onDispose($bySession.listen(onBusyMap))

  return { check }
}
