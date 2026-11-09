/**
 * Watching for tension in the messages you send (see ../tension.js).
 *
 * The composer middleware sees each message as it's sent from Desktop and
 * ALWAYS returns it untouched: never blocks, never rewrites, never stores.
 * Errors are swallowed so a send can't fail because of us. Only
 * { at, score } is kept, in memory, trimmed to the window. Never text.
 */
import { COMPOSER_AREAS } from '@hermes/plugin-sdk'
import { BREATHER_ARM_MS } from '../policy.js'
import { recentTension, tensionScore, tensionUptick } from '../tension.js'

export function createTensionWatch(ctx, store, { onChange }) {
  let log = []
  let armedAt = null

  const noteMessage = text => {
    if (!store.$settings.get().breathersEnabled) return
    const now = Date.now()
    const score = tensionScore(text)
    log = recentTension(log, now)
    if (score > 0) log.push({ at: now, score })
    if (tensionUptick(log, now)) armedAt = now
    onChange()
  }

  if (COMPOSER_AREAS.middleware) {
    ctx.register({
      id: 'tension',
      area: COMPOSER_AREAS.middleware,
      data: {
        handler: draft => {
          try {
            noteMessage(draft && draft.text)
          } catch {
            // detection must never get in the way of a send
          }
          return draft
        }
      }
    })
  }

  return {
    /** When a breather was armed (null = not); an arm left unused expires. */
    armedAt: now => {
      if (armedAt != null && now - armedAt >= BREATHER_ARM_MS) {
        armedAt = null // Hermes never got going: let it go
      }
      return armedAt
    },
    /** A breather was offered: one rough patch → one offer. */
    consume: () => {
      armedAt = null
      log = []
    }
  }
}
