/**
 * Wrists and hands. Exercise specs (the shape is in ./index.js)
 * (expanded into timed steps by expand.js; a test checks every spec’s
 * fields, wording and length).
 */

export const WRISTS = [
  {
    name: 'Wrist flexor',
    area: 'wrists',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with your hands in your lap.',
    safety: 'Keep the pull gentle. Stop if your fingers tingle or go numb.',
    startPose: 'neutral',
    holdSec: 20,
    cues: {
      left: 'Hold out your left arm, palm up. Gently pull the fingers back.',
      switch: 'Let go and shake both hands loose.',
      right: 'Hold out your right arm, palm up. Gently pull the fingers back.'
    },
    poses: {
      left: 'left',
      switch: 'shake',
      right: 'right'
    },
    sources: [
      'https://www.mayoclinichealthsystem.org/hometown-health/speaking-of-health/dont-just-sit-there-exercises-for-the-office (forearm stretch, palm up, other hand pulls the hand back; 15–30 s each side)',
      'https://www.saif.com/Documents/SafetyandHealth/Ergonomics/S1075_Office_stretches.pdf (only enough tension for a slight stretch; 15 s hold)'
    ]
  },
  {
    name: 'Wrist extensor',
    area: 'wrists',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with your hands in your lap.',
    safety: 'Keep the pull gentle. Stop if your fingers tingle or go numb.',
    startPose: 'neutral',
    holdSec: 20,
    cues: {
      left: 'Hold out your left arm, palm down. Gently press the hand down.',
      switch: 'Let go and shake both hands loose.',
      right: 'Hold out your right arm, palm down. Gently press the hand down.'
    },
    poses: {
      left: 'left',
      switch: 'shake',
      right: 'right'
    },
    sources: [
      'https://www.mayoclinichealthsystem.org/hometown-health/speaking-of-health/dont-just-sit-there-exercises-for-the-office (movement; 15–30 s each side)'
    ]
  },
  {
    name: 'Finger fans',
    area: 'wrists',
    type: 'mobility',
    position: 'seated',
    pattern: 'reps',
    sides: 'both',
    setup: 'Hold both hands up in front of you, fingers together.',
    safety: 'Spread only as far as is easy. Stop if your hands ache or tingle.',
    startPose: 'closed',
    reps: 8,
    phases: [
      {
        sec: 3,
        cue: 'Spread your fingers wide apart.',
        pose: 'spread'
      },
      {
        sec: 2,
        cue: 'Bring them back together and relax.',
        pose: 'closed'
      }
    ],
    sources: [
      'https://healthonline.washington.edu/sites/default/files/record_pdfs/Six-Hand-Exercises_02-2026.pdf (spread fingers wide, then together)'
    ]
  },
  {
    name: 'Thumb stretch',
    area: 'wrists',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with your hands in your lap.',
    safety: 'Keep the pull gentle. Stop if you feel sharp pain at the base of your thumb.',
    startPose: 'neutral',
    holdSec: 20,
    cues: {
      left: 'Hold up your left hand, palm out. Ease the thumb back with your right.',
      switch: 'Let go and wiggle your fingers.',
      right: 'Hold up your right hand, palm out. Ease the thumb back with your left.'
    },
    poses: {
      left: 'left',
      switch: 'shake',
      right: 'right'
    },
    sources: ['https://dchft.nhs.uk/?p=182617 (movement: other hand stretches the thumb back; 30 s hold)']
  }
]
