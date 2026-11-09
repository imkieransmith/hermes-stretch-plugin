/**
 * Eyes. Exercise specs (the shape is in ./index.js)
 * (expanded into timed steps by expand.js; a test checks every spec’s
 * fields, wording and length).
 */

export const EYES = [
  {
    name: 'Look far',
    area: 'eyes',
    type: 'eyes',
    position: 'seated',
    pattern: 'steps',
    sides: 'none',
    setup: 'Turn away from your screen, towards a window or a far wall.',
    safety: 'Keep your glasses on if you need them for distance.',
    startPose: 'centre',
    steps: [
      {
        sec: 20,
        caption: 'seconds left',
        cue: 'Look at something at least six metres away.',
        pose: 'far',
        strip: 'look 1'
      },
      {
        sec: 5,
        caption: 'blink',
        cue: 'Blink slowly a few times.',
        pose: 'blink',
        strip: 'rest',
        rest: true
      },
      {
        sec: 20,
        caption: 'seconds left',
        cue: 'Look at something else at least six metres away.',
        pose: 'far',
        strip: 'look 2'
      }
    ],
    sources: [
      'https://www.aao.org/eye-health/diseases/what-is-eye-strain (20-20-20 rule: at least 20 ft away for at least 20 s)',
      'https://www.aao.org/eye-health/tips-prevention/computer-usage (we blink less at screens; look up and away)'
    ]
  },
  {
    name: 'Palming',
    area: 'eyes',
    type: 'eyes',
    position: 'seated',
    pattern: 'steps',
    sides: 'none',
    setup: 'Rest your elbows on your desk. Open your eyes when the ticking stops.',
    safety: 'Don’t press on your eyes. Skip this while an eye is healing from surgery.',
    startPose: 'centre',
    steps: [
      {
        sec: 8,
        caption: 'rub',
        cue: 'Rub your palms together until they feel warm.',
        pose: 'rub',
        strip: 'rub'
      },
      {
        sec: 40,
        caption: 'seconds left',
        cue: 'Close your eyes and cup your palms over them.',
        pose: 'palms',
        strip: 'palms'
      }
    ],
    sources: [
      'https://www.webmd.com/eye-health/eye-exercises (cup palms over closed eyes, no pressure, about 30 s; our 40 s hold and warming the palms first are ours)',
      'https://www.nhs.uk/tests-and-treatments/cataract-surgery/ (aftercare: do not rub your eye; the healing-from-surgery line)'
    ]
  },
  {
    name: 'Slow blinks',
    area: 'eyes',
    type: 'eyes',
    position: 'seated',
    pattern: 'reps',
    sides: 'none',
    setup: 'Sit back and look at something past your screen.',
    safety: 'Keep it gentle. Stop if your eyes sting or hurt.',
    startPose: 'open',
    reps: 10,
    phases: [
      {
        sec: 2,
        cue: 'Close your eyes gently. Don’t squeeze.',
        pose: 'closed'
      },
      {
        sec: 2,
        cue: 'Open them and look past your screen.',
        pose: 'open'
      }
    ],
    sources: [
      'https://www.optum.com/en/health-articles.html/health-conditions/5-exercises-will-help-improve-your-eyesight (close both eyes as usual for 2 s, then open)',
      'https://www.aao.org/eye-health/tips-prevention/computer-usage (we blink 5–7 times a minute at screens instead of about 15)'
    ]
  },
  {
    name: 'Conscious blinking',
    area: 'eyes',
    type: 'eyes',
    position: 'seated',
    pattern: 'reps',
    sides: 'none',
    setup: 'Sit back and relax your face.',
    safety: 'Squeeze gently, not hard. Stop if your eyes hurt.',
    startPose: 'open',
    reps: 10,
    phases: [
      {
        sec: 1,
        cue: 'Close your eyes.',
        pose: 'closed'
      },
      {
        sec: 2,
        cue: 'Gently squeeze them shut.',
        pose: 'squeeze'
      },
      {
        sec: 2,
        cue: 'Open them again.',
        pose: 'open'
      }
    ],
    sources: [
      'https://doi.org/10.1016/j.clae.2025.102453 (close-squeeze-open cycle; Wolffsohn et al. 2025)',
      'https://www.news-medical.net/news/20250619/New-app-helps-relieve-dry-eye-through-optimised-blinking-routine.aspx (plain summary of the same study: close, squeeze shut and reopen)'
    ]
  }
]
