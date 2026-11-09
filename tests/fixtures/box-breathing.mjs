/** Test fixture: the original box breathing (4 × 4-4-4-4), so engine tests don't move with the library. */

const BOX_ROUNDS = 4

const BOX_SIDE_MS = 4_000

export const BOX_BREATHING = {
  id: 'box-breathing',
  type: 'breathing',
  area: 'breathing',
  position: 'seated',
  name: 'Box breathing',
  setup: 'Sit comfortably and let your shoulders drop. Breathe out fully.',
  safety: 'Never strain on a breath or a hold. If you feel light-headed, go back to breathing normally.',
  prepPose: 'ready',
  count: 'up',
  rounds: Array.from({ length: BOX_ROUNDS }, () => null),
  roundText: i => `Round ${i + 1} of ${BOX_ROUNDS}`,
  steps: Array.from({ length: BOX_ROUNDS }, (_, round) => [
    { ms: BOX_SIDE_MS, label: 'breathe in', pose: 'in', round, cue: 'Breathe in slowly through your nose.' },
    { ms: BOX_SIDE_MS, label: 'hold', pose: 'hold', round, cue: 'Hold gently, without straining.' },
    { ms: BOX_SIDE_MS, label: 'breathe out', pose: 'out', round, cue: 'Breathe out slowly through your mouth.' },
    { ms: BOX_SIDE_MS, label: 'hold', pose: 'hold', round, cue: 'Rest, empty, for a moment.' }
  ]).flat()
}
