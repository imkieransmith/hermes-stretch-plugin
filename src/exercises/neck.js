/**
 * Neck. Exercise specs (the shape is in ./index.js)
 * (expanded into timed steps by expand.js; a test checks every spec’s
 * fields, wording and length).
 */

const GENTLE = 'Move gently and never into pain. Stop if you feel pinching, tingling, numbness, or dizziness.'

export const NECK = [
  {
    name: 'Neck side tilt',
    area: 'neck',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with your shoulders down.',
    safety: GENTLE,
    startPose: 'centre',
    holdSec: 25,
    cues: {
      left: 'Tilt your left ear towards your left shoulder.',
      switch: 'Lift your head back to centre.',
      right: 'Tilt your right ear towards your right shoulder.'
    },
    poses: {
      left: 'left',
      switch: 'centre',
      right: 'right'
    },
    sources: [
      'https://www.mayoclinichealthsystem.org/hometown-health/speaking-of-health/dont-just-sit-there-exercises-for-the-office (movement; 15–30 s each side)',
      'https://healthy.kaiserpermanente.org/health-wellness/health-encyclopedia/he.neck-spasm-exercises.zp4500 (movement; 15–30 s hold)'
    ]
  },
  {
    name: 'Chin to chest',
    area: 'neck',
    type: 'stretch',
    position: 'seated',
    pattern: 'steps',
    sides: 'none',
    setup: 'Sit up straight with your shoulders down.',
    safety: GENTLE,
    startPose: 'centre',
    steps: [
      {
        sec: 20,
        caption: 'seconds left',
        cue: 'Let your chin drop towards your chest. Keep your back straight.',
        pose: 'down',
        strip: 'hold 1'
      },
      {
        sec: 5,
        caption: 'rest',
        cue: 'Lift your head back to centre.',
        pose: 'centre',
        strip: 'rest',
        rest: true
      },
      {
        sec: 20,
        caption: 'seconds left',
        cue: 'Let your chin drop towards your chest again.',
        pose: 'down',
        strip: 'hold 2'
      }
    ],
    sources: [
      'https://www.columbiadoctors.org/health-library/article/exercising-while-sitting-down/ (movement; hold at least 15 s, repeat)',
      'https://www.mayoclinichealthsystem.org/hometown-health/speaking-of-health/dont-just-sit-there-exercises-for-the-office (15–30 s hold)'
    ]
  },
  {
    name: 'Chin tucks',
    area: 'neck',
    type: 'mobility',
    position: 'seated',
    pattern: 'reps',
    sides: 'none',
    setup: 'Sit up straight and look ahead.',
    safety: 'Keep the movement small. Stop if you feel dizzy, or pain or tingling in your arms.',
    startPose: 'centre',
    reps: 6,
    phases: [
      {
        sec: 5,
        cue: 'Slide your chin straight back. Keep your eyes level.',
        pose: 'tuck'
      },
      {
        sec: 3,
        cue: 'Relax and let your chin come forward again.',
        pose: 'centre'
      }
    ],
    sources: [
      'https://eput.nhs.uk/wp-content/uploads/2025/03/neck-pain.pdf (movement; 5 s hold, 5 reps)',
      'https://www.columbiadoctors.org/health-library/article/exercising-while-sitting-down/ (glide head back; ~6 s hold)'
    ]
  },
  {
    name: 'Look over shoulder',
    area: 'neck',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight and keep your chin level.',
    safety: GENTLE,
    startPose: 'centre',
    holdSec: 20,
    cues: {
      left: 'Turn your head to look over your left shoulder.',
      switch: 'Turn your head back to the front.',
      right: 'Turn your head to look over your right shoulder.'
    },
    poses: {
      left: 'left',
      switch: 'centre',
      right: 'right'
    },
    sources: [
      'https://www.nhs.uk/live-well/exercise/sitting-exercises/ (movement)',
      'https://healthy.kaiserpermanente.org/health-wellness/health-encyclopedia/he.neck-spasm-exercises.zp4500 (turn and hold 15–30 s)'
    ]
  },
  {
    name: 'Armpit look',
    area: 'neck',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with your shoulders down.',
    safety: GENTLE,
    startPose: 'centre',
    holdSec: 25,
    cues: {
      left: 'Turn your head left and drop your nose towards your armpit.',
      switch: 'Lift your head back to centre.',
      right: 'Turn your head right and drop your nose towards your armpit.'
    },
    poses: {
      left: 'left',
      switch: 'centre',
      right: 'right'
    },
    sources: [
      'https://www.columbiadoctors.org/health-library/multimedia/levator-scapula-stretch-1/ (movement; 15–30 s hold)',
      'https://healthy.kaiserpermanente.org/health-wellness/health-encyclopedia/he.neck-spasm-exercises.zp4500 (levator scapula stretch: look down into your armpit; 15–30 s hold)'
    ]
  }
]
