# TODO

## Goal

Add a second kind of break. Stretching stays the default while Hermes works.
When your messages show an uptick in frustration (2 tense messages within
10 minutes), the same card below the input offers **box breathing** instead.
It uses the same compact and large layouts and the same controls. Detection
runs on this device only: message text is checked as you send it, never
stored, never sent anywhere, and never changed.

## Verification

- `npm run check` (syntax check + all unit tests)
- Manual in Hermes Desktop (user): the checklist in task 5

## Tasks

### 1. Data-driven exercises (refactor, no visible change)

Make the routine engine run any exercise from a list of timed steps, so
stretching and breathing share one engine and one UI.

Expected scope:

- `desktop/plugin.js` (routine logic, `EXERCISE`, `routineSegments`, `currentPose`, UI)
- `tests/logic.test.mjs`, `tests/plugin.test.mjs`

Actions:

- [x] Define an exercise as `{ id, kind, name, summary, setup, steps[], rounds }`. Each step has `{ label, ms, cue, pose, round }`. The neck tilt becomes hold left 20 s → rest 4 s → hold right 20 s.
- [x] Rework the routine state to `offer | prep | step(i) | done`, keeping pause, resume, skip and catch-up ticking. The routine state records which exercise is running.
- [x] Group the bar segments by round (stretch: Left · rest · Right; breathing: one segment per round).
- [x] Take the large layout's number caption, cue and "Rep 1 of 2" line from the step instead of hard-coded stretch text.
- [x] Update the existing tests to the new model. The neck tilt's timings and behaviour stay identical.

Verify:

- `npm run check`. Stretching in Hermes looks and behaves as it does in b11.

### 2. Box breathing exercise

Expected scope:

- `desktop/plugin.js`

Actions:

- [x] Add `BOX_BREATHING`: 4 rounds of in 4 s / hold 4 s / out 4 s / hold 4 s (64 s, plus get ready). Labels are "Breathe in", "Hold", "Breathe out" and "Hold"; cues are short and calm.
- [x] Breathing figure stays a placeholder (same dashed box as the stretch), labelled with the current pose: `in`, `hold`, `out`. Real art comes later with the other assets, so they all match.
- [x] The big number counts each step down (4, 3, 2, 1). The large view shows "Round 2 of 4".
- [x] The compact offer and idle copy come from the exercise. Breathing offer: "Take a breather while Hermes works?" (neutral; it never mentions your messages).

Verify:

- Unit tests for the step sequence, segments and pose.

### 3. Tension detection (local, read-only)

Expected scope:

- `desktop/plugin.js`, `tests/logic.test.mjs`, `tests/stubs/plugin-sdk.mjs`

Actions:

- [x] Pure `isTenseMessage(text)` that strips code blocks, inline code, quoted lines (`>`), URLs and file paths first, so pasted logs don't count.
- [x] Signals: swearing (`fuck*`, `shit*`, `wtf`, `ffs`, `omfg`, `bullshit`, `goddamn`, …); frustration phrases ("what are you doing", "what the hell", "I told you", "I already said", "you keep", "for the last time", "are you serious", …); shouting (mostly caps over several words); "!!!" or "?!".
- [x] Score rather than yes/no: pure `tensionScore(text)` returns a weighted sum of the signals that fired. The weights are a constant object in `plugin.js` (`TENSION_WEIGHTS = { swear: 1, phrase: 1, … }`), not a database or file. Pure `tensionUptick(entries, now)` sums the scores from the last 10 minutes and compares them with `TENSION_THRESHOLD`.
- [x] v1 weights match the agreed behaviour: any signal makes a message count, and 2 counting messages cross the threshold. Later tuning (e.g. casual swearing counting less than "what are you doing") only changes the table.
- [x] Register a `COMPOSER_AREAS.middleware` contribution whose handler checks the draft text, records only a timestamp and score when the score is above 0, held in memory (a small array, trimmed to the last 10 minutes and lost on restart; nothing written to storage), and always returns the draft unchanged. A throw is caught so a send can never be blocked.
- [x] Tests with true and false positives: swearing in a stack trace or code block, "kill the process", "shit" inside "shitake", a calm all-caps acronym like "README API URL".

Verify:

- `npm run check`

### 4. Breathing offer policy

Expected scope:

- `desktop/plugin.js`, `tests/plugin.test.mjs`

Actions:

- [x] When an uptick is detected, arm a breather for the next working spell (the arm expires after 2 minutes if Hermes never starts). The tense message itself triggers that spell.
- [x] Offer the breather after about 3 s of Hermes working, with no tool use needed. If Hermes finishes before you start, the offer is withdrawn quietly, as with stretches. Once breathing has started, it runs to the end whatever Hermes does.
- [x] Give breathing its own persisted cooldown (`lastBreatherAt`, 30 min), separate from the stretch cooldown. A breather offered in a spell replaces that spell's stretch offer.
- [x] Clear the tense timestamps once a breather is offered, so one rough patch triggers one offer.
- [x] Settings: toggle "Offer a breather when things get tense", with a description saying messages are checked on this device and nothing is stored or sent. **Default on** (see Notes).
- [x] ⌘K "Start box breathing" (on demand) and "Preview a breather offer (prototype)".
- [x] Debug view: tense-message count in the window and the armed state (no text).
- [x] Plugin tests: middleware passes drafts through unchanged; 2 tense sends then a busy spell offer breathing; the cooldown blocks a second offer; a stretch offer is unaffected otherwise.

Verify:

- `npm run check`

### 5. Docs and manual check

Expected scope:

- `README.md`, `AGENTS.md`

Actions:

- [x] README: describe breathing, what's detected, and the privacy promise. Wording must be accurate: messages *are* read on your device (that's how detection works), but the text is never stored, sent anywhere or changed. Point to the middleware handler and `tensionScore` in `desktop/plugin.js` as the proof. AGENTS.md: the exercise model and the middleware rule (never modify or block a send).
- [x] Bump `DEV_BUILD`.
- [ ] Manual checklist for the user in Hermes:
  - One swear: no offer.
  - Two tense messages within 10 min: breather offer after about 3 s.
  - Swearing inside a code block doesn't count.
  - A stretch still offers on long tool tasks.
  - The breather cooldown holds.
  - The settings toggle turns detection off.

Verify:

- `npm run check`, plus the user's run in Hermes

## Notes

- **Done in b12** (53 tests pass). Extras found along the way:
  - Fixed a pre-existing bug: after an exercise finished and the card hid
    itself, the routine stayed in `done` and blocked every later offer. The
    card now resets to idle once it's gone, and `done` no longer blocks
    offers (`canOfferOver`), which also matters with `DEV.keepPaneOpen` on.
  - A withdrawn offer resets the card to the default stretch.
  - ⌘K also gained "Start a stretch".

- **Decisions from the user:** neutral offer copy; trigger is 2 tense messages in 10 minutes; breathing has its own cooldown; first cut is box breathing with no voice.
- **Future: weighted scoring.** Casual swearing alone may be too sensitive for some people (the user swears casually). The scoring structure in task 3 is there so weights and threshold can be tuned without a rewrite.
- **Future: audio exercises.** A body scan is one step whose length is the clip's length. The step engine from task 1 should cover it; only audio delivery is open.
- **Out of scope now:** voice cues, the body scan, audio delivery (embedding in `plugin.js` vs the Python half), learning each user's baseline, a "Hermes needs you" cue.
- **Default on** (confirmed). The public README is explicit about privacy and points to the code.
- **Coverage:** only messages sent from Desktop's composer are seen. Messages sent from the CLI, Telegram, etc. aren't checked. Edits and resends go through the same composer, so they're probably checked too (unverified).
- **Unverified:** whether middleware runs for the message-edit composer and for queued/steer sends; whether `draft.text` includes `@` / `/` tokens as plain text.
- **Risk:** the word list is English-only and heuristic. False positives cost one gentle, dismissible offer, which is acceptable.
- **The engine refactor (task 1) is the riskiest step.** It's done first and on its own, so stretching can be re-checked before breathing lands.
