/**
 * Timings shared by every exercise (get ready, rest, next up).
 * Every in-between pause is the same 5 s (get ready, switch sides, next up),
 * so the rhythm is the same whatever the exercise.
 */

/** "Get ready" before the first step. */
export const PREP_MS = 5_000

/** A stretch's pause between sides ("switch sides"). */
export const REST_MS = 5_000

/** "Next up": the get-ready between two exercises in a session (read the new setup). */
export const NEXT_MS = 5_000
