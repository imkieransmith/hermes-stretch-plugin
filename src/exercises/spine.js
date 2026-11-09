/**
 * Spine and back. Exercise specs (the shape is in ./index.js)
 * (expanded into timed steps by expand.js; a test checks every spec’s
 * fields, wording and length).
 */

export const SPINE = [
  {
    name: 'Seated twist',
    area: 'spine',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with your hands on opposite shoulders.',
    safety: 'Turn only as far as is easy. Stop if your back hurts.',
    startPose: 'centre',
    holdSec: 20,
    cues: {
      left: 'Turn your upper body to the left. Keep your hips still.',
      switch: 'Turn back to face the front.',
      right: 'Turn your upper body to the right. Keep your hips still.'
    },
    poses: {
      left: 'left',
      switch: 'centre',
      right: 'right'
    },
    sources: [
      'https://www.nhs.uk/live-well/exercise/sitting-exercises/ (movement and safety: arms crossed to your shoulders, hips still; NHS holds 5 s × 5)',
      'https://www.mayoclinichealthsystem.org/hometown-health/speaking-of-health/dont-just-sit-there-exercises-for-the-office (the same twist standing, held 30 s each side: our one 20 s hold)'
    ]
  },
  {
    name: 'Overhead side bend',
    area: 'spine',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with both feet flat on the floor.',
    safety: 'Lean sideways, not forward. Keep both hips on your chair.',
    startPose: 'centre',
    holdSec: 20,
    cues: {
      left: 'Raise your right arm and lean over to the left.',
      switch: 'Lower your right arm and sit up straight.',
      right: 'Raise your left arm and lean over to the right.'
    },
    poses: {
      left: 'left',
      switch: 'centre',
      right: 'right'
    },
    sources: [
      'https://www.columbiadoctors.org/health-library/article/exercising-while-sitting-down/ (seated overhead reach and side bend; hold at least 15 s)'
    ]
  },
  {
    name: 'Seated cat-cow',
    area: 'spine',
    type: 'mobility',
    position: 'seated',
    pattern: 'reps',
    sides: 'none',
    setup: 'Sit near the front of your chair with your hands on your knees.',
    safety: 'Move only as far as is easy. Keep the arch small if your lower back aches.',
    startPose: 'neutral',
    reps: 6,
    phases: [
      {
        sec: 4,
        cue: 'Breathe in. Lift your chest and arch your back.',
        pose: 'cow'
      },
      {
        sec: 4,
        cue: 'Breathe out. Round your back and drop your chin.',
        pose: 'cat'
      }
    ],
    sources: [
      'https://health.clevelandclinic.org/cat-cow-stretch (seated version: hands on thighs, breathe in to arch, out to round; 5–10 reps; take extra care seated)'
    ]
  },
  {
    name: 'Chair backbend',
    area: 'spine',
    type: 'mobility',
    position: 'seated',
    pattern: 'reps',
    sides: 'none',
    setup: 'Sit back in your chair. Lace your fingers behind your head.',
    safety: 'Only use a firm backrest that doesn’t recline. Keep your neck in line with your back.',
    startPose: 'upright',
    reps: 7,
    phases: [
      {
        sec: 4,
        cue: 'Lean back over the backrest and lift your chest.',
        pose: 'back'
      },
      {
        sec: 2,
        cue: 'Sit up straight again.',
        pose: 'upright'
      }
    ],
    sources: [
      'https://us.physitrack.com/home-exercise-video/thoracic-extensions-in-sit%2c-hands-behind-head (movement: hands behind head, extend over chair back)',
      'https://physiostore.ca/wp-content/uploads/pdf/Physiotherapy_Room_Thoracic_Spinal_Mobility_Stretches_As_We_Age.pdf (seated, hands behind head; 10 reps, 1–3 s hold)'
    ]
  },
  {
    name: 'Seated forward fold',
    area: 'spine',
    type: 'stretch',
    position: 'seated',
    pattern: 'steps',
    sides: 'none',
    setup: 'Sit near the front of your chair with your feet flat and apart.',
    safety: 'Come up slowly, head last. Stop if you feel dizzy or your back hurts.',
    startPose: 'upright',
    steps: [
      {
        sec: 20,
        caption: 'seconds left',
        cue: 'Fold forward and let your head and arms hang.',
        pose: 'fold',
        strip: 'hold 1'
      },
      {
        sec: 6,
        caption: 'sit up',
        cue: 'Roll up slowly, head last.',
        pose: 'upright',
        strip: 'rest',
        rest: true
      },
      {
        sec: 20,
        caption: 'seconds left',
        cue: 'Fold forward again and let your head and arms hang.',
        pose: 'fold',
        strip: 'hold 2'
      }
    ],
    sources: [
      'https://abbott.com/en-us/corpnewsroom/nutrition-health-and-wellness/4-gentle-stretches-to-help-lower-back-pain (movement; 10–30 s hold, sit up slowly, repeat)',
      'https://us.physitrack.com/home-exercise-video/seated-trunk-flexion-stretch (seated fold, legs apart)'
    ]
  }
]
