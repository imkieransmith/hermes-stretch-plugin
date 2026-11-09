/**
 * Every exercise, by id. The specs live one file per area (neck.js …
 * breathing.js), patterns in ./expand.js; expand.js turns
 * each into timed steps. Add an exercise by adding a spec to its area.
 *
 * An exercise (what the engine runs):
 *   id, name, setup, safety, prepPose (the picture while getting ready),
 *   sources (links: what each supports)
 *   type:     'stretch' | 'mobility' (picked for sessions), 'eyes' (closes
 *             a session), 'breathing' (closes a session if "End with a
 *             breathing exercise" is on; `breather: true` ones are also
 *             offered on their own when things get tense)
 *   area:     neck | shoulders | spine | wrists | legs | eyes | breathing
 *             (a session never puts two from one area back to back)
 *   position: 'seated' | 'standing' (standing ones go last, at most 2)
 *   steps:    [{ ms, label, cue, pose, round, barLabel?, between?, rep? }]
 *     label  caption beside the big number ("seconds left", "breathe in", "of 8")
 *     cue    the instruction under the title
 *     pose   what the figure shows during the step
 *     round  index into `rounds` (its bar strip); null = a pause with its
 *            own strip (`barLabel` under it; `between: true`: it sounds like
 *            the get-ready)
 *     rep    (count 'reps') the number shown for the whole step
 *   rounds:   bar labels, one per round (all null = no label row)
 *   roundText: i => the round for screen readers ("Left side", "Rep 3 of 8")
 *   count:    the big number during steps: 'down' (time left, the default),
 *             'up' (a breathing pace: 1, 2, 3, 4) or 'reps' (the rep you're
 *             on; each rep is its own strip, paced: `ms` is the time for it)
 */

import { BREATHING } from './breathing.js'
import { expand } from './expand.js'
import { EYES } from './eyes.js'
import { LEGS } from './legs.js'
import { NECK } from './neck.js'
import { SHOULDERS } from './shoulders.js'
import { SPINE } from './spine.js'
import { WRISTS } from './wrists.js'

export const SPECS = [...NECK, ...SHOULDERS, ...SPINE, ...WRISTS, ...LEGS, ...EYES, ...BREATHING]

export const EXERCISES = Object.fromEntries(SPECS.map(expand).map(ex => [ex.id, ex]))

/** Named for the tests: one stretch with sides, one breathing exercise with holds. */
export const NECK_TILT = EXERCISES['neck-side-tilt']
export const BOX_BREATHING = EXERCISES['box-breathing']
