/**
 * When to show the card and when to offer an exercise (pure). The
 * controllers in controller/ apply these.
 */

/** True if any session in a busy map is mid-turn. */
export function anyBusy(map) {
  return Object.values(map || {}).some(Boolean)
}

/**
 * Should the card be up right now?
 * - offered: we offered an exercise during the current busy spell.
 * - opened: the user opened it (⌘K "Start stretch session" / "Start breathing session"); stays until they act.
 * - routineActive: an exercise is underway — stays up even after Hermes finishes.
 */
export function shouldShowCard({ offered = false, opened = false, routineActive = false }) {
  return Boolean(offered || opened || routineActive)
}

/** Nothing underway or on offer: a finished exercise still on screen counts as free. */
export function canOfferOver(routinePhase) {
  return routinePhase === 'idle' || routinePhase === 'done'
}

export function inCooldown(lastBreakAt, cooldownMin, now) {
  return lastBreakAt != null && cooldownMin > 0 && now - lastBreakAt < cooldownMin * 60_000
}

/**
 * Offer a stretch for this busy spell? `spell` = { startedAt, toolSeen, offered }
 * (one per stretch of time where any chat is working).
 */
export function shouldOffer({ spell, settings, lastBreakAt, routinePhase, now }) {
  return Boolean(
    spell &&
    !spell.offered &&
    spell.toolSeen &&
    now - spell.startedAt >= settings.offerDelaySec * 1000 &&
    settings.offersEnabled &&
    canOfferOver(routinePhase) &&
    !inCooldown(lastBreakAt, settings.cooldownMin, now)
  )
}

/** A breather is offered this long into Hermes working (no tool needed). */
export const BREATHER_DELAY_MS = 3_000

/** Breathing has its own cooldown, separate from stretching. */
export const BREATHER_COOLDOWN_MIN = 30

/** An uptick arms a breather for this long, waiting for Hermes to start. */
export const BREATHER_ARM_MS = 2 * 60_000

/**
 * Offer a breather for this busy spell? `armedAt` = when tension last crossed
 * the threshold (null = not armed). The delay counts from whichever came
 * later, the spell or the arming (a tense message can land mid-spell).
 */
export function shouldOfferBreather({ spell, armedAt, settings, lastBreatherAt, routinePhase, now }) {
  return Boolean(
    spell &&
    !spell.offered &&
    armedAt != null &&
    now - armedAt < BREATHER_ARM_MS &&
    now - Math.max(spell.startedAt, armedAt) >= BREATHER_DELAY_MS &&
    settings.breathersEnabled &&
    canOfferOver(routinePhase) &&
    !inCooldown(lastBreatherAt, BREATHER_COOLDOWN_MIN, now)
  )
}
