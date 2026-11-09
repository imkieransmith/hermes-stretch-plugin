/**
 * Shoulders and chest. Exercise specs (the shape is in ./index.js)
 * (expanded into timed steps by expand.js; a test checks every spec’s
 * fields, wording and length).
 */

export const SHOULDERS = [
  {
    name: 'Shoulder rolls',
    area: 'shoulders',
    type: 'mobility',
    position: 'seated',
    pattern: 'reps',
    sides: 'none',
    setup: 'Sit up straight with your arms loose by your sides.',
    safety: 'Keep the movement slow and easy. Stop if your shoulders hurt or your arms tingle.',
    startPose: 'neutral',
    reps: 10,
    secPerRep: 4,
    cue: 'Slowly roll your shoulders up, back, and down.',
    pose: 'roll',
    sources: [
      'https://admin.lmu.edu/hr/programsservices/wellbeing/ergonomics/stretches/ (roll up and back, arms loose)',
      'https://www.columbiadoctors.org/health-library/article/exercising-while-sitting-down/ (seated shoulder rolls)'
    ]
  },
  {
    name: 'Cross-body shoulder',
    area: 'shoulders',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with your shoulders down.',
    safety: 'Keep your elbow below shoulder height. Ease off if your shoulder pinches.',
    startPose: 'neutral',
    holdSec: 25,
    cues: {
      left: 'Pull your left arm across your chest with your right hand.',
      switch: 'Let go and lower your left arm.',
      right: 'Pull your right arm across your chest with your left hand.'
    },
    poses: {
      left: 'left',
      switch: 'neutral',
      right: 'right'
    },
    sources: [
      'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20546848 (shoulder stretch: arm across your body, held by the other arm; about 30 s)',
      'https://www.saif.com/Documents/SafetyandHealth/Ergonomics/S1075_Office_stretches.pdf (seated version, upper body straight; 15 s hold. Elbow below shoulder height is our caution)'
    ]
  },
  {
    name: 'Overhead triceps',
    area: 'shoulders',
    type: 'stretch',
    position: 'seated',
    pattern: 'hold',
    sides: 'left_right',
    setup: 'Sit up straight with your arms by your sides.',
    safety: 'Keep your back straight and your head up. Ease off if your shoulder pinches.',
    startPose: 'neutral',
    holdSec: 20,
    cues: {
      left: 'Raise your left arm, bend the elbow, and reach down your back.',
      switch: 'Lower your left arm to your side.',
      right: 'Raise your right arm, bend the elbow, and reach down your back.'
    },
    poses: {
      left: 'left',
      switch: 'neutral',
      right: 'right'
    },
    sources: [
      'https://www.saif.com/Documents/SafetyandHealth/Ergonomics/S1075_Office_stretches.pdf (arm up, elbow bent, forearm behind your head, other hand eases the elbow; 15 s hold, repeat each arm)',
      'https://admin.lmu.edu/hr/programsservices/wellbeing/ergonomics/stretches/ (office triceps stretch; move slowly)'
    ]
  },
  {
    name: 'Goalpost squeeze',
    area: 'shoulders',
    type: 'mobility',
    position: 'seated',
    pattern: 'reps',
    sides: 'none',
    setup: 'Raise your arms like a goalpost, elbows at shoulder height.',
    safety: 'Keep your shoulders away from your ears. Lower your arms if they ache.',
    startPose: 'goalpost',
    reps: 7,
    phases: [
      {
        sec: 4,
        cue: 'Squeeze your shoulder blades down and together.',
        pose: 'squeeze'
      },
      {
        sec: 2,
        cue: 'Relax your shoulder blades. Keep your arms up.',
        pose: 'goalpost'
      }
    ],
    sources: [
      'https://www.columbiadoctors.org/health-library/article/exercising-while-sitting-down/ (shoulder blade squeeze: arms near shoulder level, elbows out, squeeze, don’t shrug; 6 s hold, 8–12 reps)',
      'https://www.cuh.nhs.uk/patient-information/shoulder-strengthening-exercises/ (sit tall, draw shoulder blades back and down, hold)',
      'https://fitwill.app/exercise/10463/seated-squeeze-shoulder-blades-chest-stretch-on-a/ (seated goalpost arm position)'
    ]
  },
  {
    name: 'Chest opener',
    area: 'shoulders',
    type: 'stretch',
    position: 'seated',
    pattern: 'reps',
    sides: 'none',
    setup: 'Sit near the front of your chair, away from the backrest.',
    safety: 'Move gently and never into pain. Stop if you feel pinching, tingling, numbness, or dizziness.',
    startPose: 'neutral',
    reps: 5,
    phases: [
      {
        sec: 8,
        cue: 'Open your arms wide, shoulders back, and lift your chest.',
        pose: 'open'
      },
      {
        sec: 3,
        cue: 'Lower your arms and relax.',
        pose: 'neutral'
      }
    ],
    sources: ['https://www.nhs.uk/live-well/exercise/sitting-exercises/ (movement; hold 5–10 s, repeat 5 times)']
  }
]
