/**
 * ⌘K. Two commands: the session picker (starting is still one of the card's
 * buttons: short / medium / long), and a breather on its own (the card
 * the breather offer shows, with Start).
 */
import { PALETTE_AREA } from '@hermes/plugin-sdk'
import { PLUGIN_ID } from '../config.js'

export function registerCommands(ctx, actions) {
  ctx.register({
    id: 'start',
    area: PALETTE_AREA,
    data: {
      id: `${PLUGIN_ID}.start`,
      label: 'OpenChi: Start stretch session',
      keywords: ['stretch', 'break', 'exercise', 'move', 'neck', 'wellness'],
      run: actions.open
    }
  })
  ctx.register({
    id: 'breathe',
    area: PALETTE_AREA,
    data: {
      id: `${PLUGIN_ID}.breathe`,
      label: 'OpenChi: Start breathing session',
      keywords: ['breathe', 'breathing', 'breather', 'calm', 'relax', 'wellness'],
      run: actions.openBreathing
    }
  })
}
