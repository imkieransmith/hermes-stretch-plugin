/**
 * Hips and legs. Exercise specs (the shape is in ./index.js)
 * (expanded into timed steps by expand.js; a test checks every spec’s
 * fields, wording and length).
 */

export const LEGS = [
  {
    name: 'Seated figure four',
    area: 'legs',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit near the front of your chair with both feet flat.',
    safety: 'Lean from your hips with a straight back. Stop if your knee hurts.',
    startPose: 'seated',
    holdSec: 25,
    cues: {
      left: 'Rest your left ankle on your right knee. Lean forward.',
      switch: 'Put your left foot down and sit up straight.',
      right: 'Rest your right ankle on your left knee. Lean forward.'
    },
    poses: {
      left: 'left',
      switch: 'seated',
      right: 'right'
    },
    sources: [
      'https://health.clevelandclinic.org/piriformis-syndrome-stretches-exercises (seated version; lean forward; 30 s hold)'
    ]
  },
  {
    name: 'Seated hamstring',
    area: 'legs',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit near the front of your chair with both feet flat.',
    safety: 'Keep your back straight and your knee soft. Stop if you feel pain.',
    startPose: 'seated',
    holdSec: 25,
    cues: {
      left: 'Straighten your left leg, heel down. Lean forward from your hips.',
      switch: 'Bring your left foot back and sit up straight.',
      right: 'Straighten your right leg, heel down. Lean forward from your hips.'
    },
    poses: {
      left: 'left',
      switch: 'seated',
      right: 'right'
    },
    sources: [
      'https://healthy.kaiserpermanente.org/health-wellness/health-encyclopedia/he.acl0420 (movement; 15–30 s hold; ease back if pain)'
    ]
  },
  {
    name: 'Ankle circles',
    area: 'legs',
    type: 'mobility',
    position: 'seated',
    pattern: 'steps',
    sides: 'left_right',
    setup: 'Sit up straight with both feet flat on the floor.',
    safety: 'Keep your leg still and move only your foot. Stop if your ankle hurts.',
    startPose: 'seated',
    steps: [
      {
        sec: 12,
        caption: 'clockwise',
        cue: 'Lift your left foot and slowly circle it clockwise.',
        pose: 'left',
        strip: 'Left'
      },
      {
        sec: 12,
        caption: 'anticlockwise',
        cue: 'Slowly circle your left foot anticlockwise.',
        pose: 'left',
        strip: 'Left'
      },
      {
        sec: 5,
        caption: 'switch sides',
        cue: 'Put your left foot down.',
        pose: 'seated',
        strip: 'switch',
        rest: true
      },
      {
        sec: 12,
        caption: 'clockwise',
        cue: 'Lift your right foot and slowly circle it clockwise.',
        pose: 'right',
        strip: 'Right'
      },
      {
        sec: 12,
        caption: 'anticlockwise',
        cue: 'Slowly circle your right foot anticlockwise.',
        pose: 'right',
        strip: 'Right'
      }
    ],
    sources: [
      'https://www.arthritisaction.org.uk/wp-content/uploads/2018/06/Foot-and-ankle-mobility-exercises.pdf (seated; one foot lifted; clockwise then anticlockwise; lower leg still; don’t force through pain)'
    ]
  },
  {
    name: 'Calf raises',
    area: 'legs',
    type: 'mobility',
    position: 'standing',
    pattern: 'reps',
    sides: 'none',
    setup: 'Stand facing your desk with your hands resting on it.',
    safety: 'Use a steady desk for balance. Stop if your calves or ankles hurt.',
    startPose: 'standing',
    reps: 8,
    phases: [
      {
        sec: 2,
        cue: 'Slowly rise onto your toes.',
        pose: 'up'
      },
      {
        sec: 2,
        cue: 'Hold at the top.',
        pose: 'up'
      },
      {
        sec: 2,
        cue: 'Slowly lower your heels.',
        pose: 'standing'
      }
    ],
    sources: [
      'https://www.nhs.uk/live-well/exercise/strength-exercises/ (movement; hands on a chair for stability; slow and controlled)',
      'https://www.harvardhealth.org/healthbeat/8-simple-steps-to-a-healthier-stronger-you (hold briefly at the top; 8–12 reps)'
    ]
  },
  {
    name: 'Standing hip flexor',
    area: 'legs',
    type: 'stretch',
    position: 'standing',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Stand beside your desk with one hand resting on it.',
    safety: 'Keep a hand on the desk. Stop if your lower back or hip hurts.',
    startPose: 'standing',
    holdSec: 25,
    cues: {
      left: 'Step your left foot back. Tuck your hips under and shift forward.',
      switch: 'Bring your feet together and stand up straight.',
      right: 'Step your right foot back. Tuck your hips under and shift forward.'
    },
    poses: {
      left: 'left',
      switch: 'standing',
      right: 'right'
    },
    sources: [
      'https://kinetic-revolution.com/standing-hip-flexor-stretch (staggered stance, tuck pelvis, shift forward; 30 s each side)',
      'https://ca.physitrack.com/home-exercise-video/hip-stretching-(iliopsoas) (tilt pelvis back, chest upright, hand on a chair)'
    ]
  },
  {
    name: 'Seated adductor',
    area: 'legs',
    type: 'stretch',
    position: 'seated',
    pattern: 'steps',
    sides: 'none',
    setup: 'Sit near the front of your chair with your feet wide and flat.',
    safety: 'Press gently. Stop if you feel pain in your groin or knees.',
    startPose: 'wide',
    steps: [
      {
        sec: 20,
        caption: 'seconds left',
        cue: 'Lean forward and press your knees apart with your elbows.',
        pose: 'lean',
        strip: 'hold 1'
      },
      {
        sec: 5,
        caption: 'rest',
        cue: 'Sit up straight and relax.',
        pose: 'wide',
        strip: 'rest',
        rest: true
      },
      {
        sec: 20,
        caption: 'seconds left',
        cue: 'Lean forward again and press your knees apart with your elbows.',
        pose: 'lean',
        strip: 'hold 2'
      }
    ],
    sources: [
      'https://exrx.net/Stretches/HipAdductors/SeatedGroin (movement: legs apart, forearms inside knees, lean and push thighs apart)'
    ]
  },
  {
    name: 'Desk calf stretch',
    area: 'legs',
    type: 'stretch',
    position: 'standing',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Stand facing your desk with your hands resting on it.',
    safety: 'Lean in slowly and don’t bounce. Stop if your calf or ankle hurts.',
    startPose: 'standing',
    holdSec: 25,
    cues: {
      left: 'Step your left foot back, heel down, knee straight. Lean in.',
      switch: 'Bring your feet together and stand up straight.',
      right: 'Step your right foot back, heel down, knee straight. Lean in.'
    },
    poses: {
      left: 'left',
      switch: 'standing',
      right: 'right'
    },
    sources: [
      'https://www.nhs.uk/live-well/exercise/flexibility-exercises/ (calf stretch: one leg back, heel down, leg straight)',
      'https://www.worcsacute.nhs.uk/leaflets/stretching-exercises-physiotherapy/ (hands on a table for balance)'
    ]
  }
]
