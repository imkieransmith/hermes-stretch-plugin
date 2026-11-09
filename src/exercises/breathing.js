/**
 * Breathing. Exercise specs (the shape is in ./index.js)
 * (expanded into timed steps by expand.js; a test checks every spec’s
 * fields, wording and length).
 *
 * `breather: true`: offered on its own when things get tense. Only the ones
 * with no breath holds (holding your breath can feel bad when you are
 * already wound up).
 */

const SETUP = 'Sit back, drop your shoulders, and rest your hands in your lap.'
const LIGHT_HEADED = 'If you feel light-headed, stop and breathe normally.'

export const BREATHING = [
  {
    name: 'Cyclic sigh',
    area: 'breathing',
    type: 'breathing',
    position: 'seated',
    pattern: 'breathing',
    sides: 'none',
    setup: SETUP,
    safety: `Never force a breath. ${LIGHT_HEADED}`,
    startPose: 'ready',
    cycles: 6,
    phases: [
      {
        sec: 3,
        caption: 'breathe in',
        cue: 'Breathe in deeply through your nose.',
        pose: 'in'
      },
      {
        sec: 1,
        caption: 'top up',
        cue: 'Top up with one more short breath in.',
        pose: 'in'
      },
      {
        sec: 6,
        caption: 'breathe out',
        cue: 'Breathe out slowly through your mouth.',
        pose: 'out'
      }
    ],
    sources: [
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947 (cyclic sighing: inhale through the nose, top up with a second inhale, slow exhale through the mouth; Balban et al. 2023)'
    ],
    breather: true
  },
  {
    name: 'Long exhale',
    area: 'breathing',
    type: 'breathing',
    position: 'seated',
    pattern: 'breathing',
    sides: 'none',
    setup: SETUP,
    safety: `Never force a breath. ${LIGHT_HEADED}`,
    startPose: 'ready',
    cycles: 6,
    phases: [
      {
        sec: 4,
        caption: 'breathe in',
        cue: 'Breathe in slowly through your nose.',
        pose: 'in'
      },
      {
        sec: 6,
        caption: 'breathe out',
        cue: 'Breathe out slowly through your mouth.',
        pose: 'out'
      }
    ],
    sources: [
      'https://www.calm.com/blog/long-exhale (4 in, 6 out; exhale should feel soft, not strained)',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947 (exhale-led breathing studied against box breathing)'
    ],
    breather: true
  },
  {
    name: 'Box breathing',
    area: 'breathing',
    type: 'breathing',
    position: 'seated',
    pattern: 'breathing',
    sides: 'none',
    setup: SETUP,
    safety: `Never strain on the holds. ${LIGHT_HEADED}`,
    startPose: 'ready',
    cycles: 4,
    phases: [
      {
        sec: 4,
        caption: 'breathe in',
        cue: 'Breathe in slowly through your nose.',
        pose: 'in'
      },
      {
        sec: 4,
        caption: 'hold',
        cue: 'Hold your breath gently, with your lungs full.',
        pose: 'hold'
      },
      {
        sec: 4,
        caption: 'breathe out',
        cue: 'Breathe out slowly through your mouth.',
        pose: 'out'
      },
      {
        sec: 4,
        caption: 'hold',
        cue: 'Hold your breath gently, with your lungs empty.',
        pose: 'hold'
      }
    ],
    sources: [
      'https://health.clevelandclinic.org/box-breathing-benefits (four counts each: in, hold, out, hold; breathe gently, don’t strain)',
      'https://sfh-tr.nhs.uk/media/o3fpizwx/breathing-exercises-leaflet.pdf (may feel dizzy at first; sit down)'
    ]
  },
  {
    name: 'Even breathing',
    area: 'breathing',
    type: 'breathing',
    position: 'seated',
    pattern: 'breathing',
    sides: 'none',
    setup: SETUP,
    safety: `Breathe gently, not deeply. ${LIGHT_HEADED}`,
    startPose: 'ready',
    cycles: 6,
    phases: [
      {
        sec: 5,
        caption: 'breathe in',
        cue: 'Breathe in gently through your nose.',
        pose: 'in'
      },
      {
        sec: 5,
        caption: 'breathe out',
        cue: 'Breathe out gently through your mouth.',
        pose: 'out'
      }
    ],
    sources: [
      'https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/ (in through the nose, out through the mouth; count 1–5 in, 1–5 out; don’t force it)'
    ],
    breather: true
  }
]
