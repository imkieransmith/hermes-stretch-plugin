/** Test fixture: the original neck tilt (2 × 20 s), so engine tests don't move with the library. */

import { REST_MS } from '../../src/timing.js'

export const NECK_TILT = {
  id: 'neck-side-tilt',
  type: 'stretch',
  area: 'neck',
  position: 'seated',
  name: 'Neck side tilt',
  setup: 'Sit tall and let your shoulders drop.',
  safety: 'Move gently and never into pain. Stop if you feel pinching, tingling, numbness, or dizziness.',
  prepPose: 'centre',
  rounds: ['Left', 'Right'],
  roundText: i => `Rep ${i + 1} of 2 · ${['Left', 'Right'][i]} side`,
  steps: [
    {
      ms: 20_000,
      label: 'seconds left',
      pose: 'left',
      round: 0,
      cue: 'Let your head tilt toward your left shoulder. Don’t pull it.'
    },
    {
      ms: REST_MS,
      label: 'switch sides',
      pose: 'centre',
      round: null,
      between: true,
      barLabel: 'switch',
      cue: 'Bring your head back to centre. Breathe out slowly.'
    },
    {
      ms: 20_000,
      label: 'seconds left',
      pose: 'right',
      round: 1,
      cue: 'Now tilt your head toward your right shoulder.'
    }
  ]
}
