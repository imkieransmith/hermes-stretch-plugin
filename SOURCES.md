# Sources

What the card claims, what each exercise is based on, and where both come from. Anything the card says about your body or mind needs a source here. If you change the wording or add an exercise, update this file.

We keep our claims modest: less stiff, less tired, more relaxed. We make no medical or productivity claims, since the evidence that short breaks help people work better is weak [4].

## The offers

### Stretch session

> **Hours of sitting leave you stiff and tired. A few minutes of gentle movement while your agent works helps you loosen up.**

- **"Stiff"**
  - [1] links long spells of sitting to more muscle and joint discomfort.
  - In an office trial, breaking up sitting cut lower-back discomfort by about 32% [2]. The workers were overweight or obese, and they stood rather than stretched.
  - Mayo Clinic says sitting at a desk all day "can take a toll on your neck", and that simple neck stretches through the day help "prevent or reduce stiffness and pain" [5].
  - Mayo Clinic Health System says too much sitting in one position "can leave you feeling stiff and sore. It can also leave you feeling tired" [9].
- **"Tired"**
  - In a review of breaks of 10 minutes or less, breaks raised vigour and lowered fatigue [4]. The effects were small but significant.
  - Breaking up sitting also eased fatigue in [2], and [9] says sitting leaves you tired.
- **"A few minutes … loosen up"**
  - The review in [4] covers breaks of 10 minutes or less.
  - "Loosen up" is our everyday word for less stiffness and discomfort [1], [2], [5].
- **What it leaves out, on purpose**
  - Focus and productivity. In [4], breaks helped performance only on less demanding tasks. Overall, the effect was not significant.
  - Body parts. The copy names none, so it still holds as we add exercises.

### Breather

The card shows this when your messages get tense, or when you run **OpenChi: Start breathing session**.

> **Stressful moments leave you tense and on edge. A minute of slow, steady breathing while your agent works helps you relax and refocus.**

- **"Relax"**
  - A review of slow breathing (under 10 breaths a minute) in healthy adults found more comfort, relaxation, vigour and alertness [3].
  - It also found less arousal, anxiety, anger and confusion [3].
  - Our breathers (cyclic sigh, long exhale, even breathing) all run at 6 breaths a minute, well under that limit.
- **"Refocus"**
  - The same review found more alertness and less confusion [3]. Those measure how people felt, not how well they worked (see [4]).
- **"Tense and on edge"**
  - These name what slow breathing eases: arousal, anxiety and anger [3]. The words are general, so they fit both ways of reaching the card, and they never call you frustrated.

### The "All done" screen

> **If you can, stand up, walk around, and grab some water.**

- Getting up and moving is the better break. HSE's guidance on screen work says breaks "should allow users to get up from their workstations and move around, or at least stretch and change posture" [7]. The NHS guidelines for adults say to "break up long periods of not moving with some activity" [8]. So the stretches are the fallback, and this line points to the better break without turning it into an exercise.
- "If you can", because not everyone can stand.
- The water is a suggestion, not a claim, so it needs no source.

## The exercises

Each exercise lists its sources under `sources` in `src/exercises/<area>.js`: a link, and what it backs (the movement, the hold or rep count, the safety line). We checked every link in November 2026: the page loads and says what its note claims. Where we differ from a source, with a longer hold or a step of our own, the note says so.

Four general points:

- **Hold times** fall within the 10–30 s that most guidance gives for static stretches [5], [6]. A few sources hold briefly and repeat. Where we hold once for longer instead, as in the seated twist, the exercise's note says what backs it.
- **Safety lines** say little: move gently, and stop on pain, tingling, numbness or dizziness. Where a line names warning signs that its source doesn't, we added them out of caution.
- **Recovering from injury or surgery.** The README says to check with your doctor first. That is caution, not a claim, and it covers what one exercise's line can't. Aftercare for eye surgery, for example, also advises against bending forward, which rules out the seated forward fold.
- **Palming** is the one exercise with a surgery line of its own, because the risk isn't obvious. It puts your hands over your eyes, and aftercare for eye surgery says not to rub your eye (NHS, cataract surgery; in its `sources`).

## Our own design choices

We tuned these by feel. No source backs them; we list them so nobody takes them for evidence:

- the 5 s pauses (get ready, switch sides, next up);
- the offer delay (a task must use a tool and run for 10 s);
- the waits between offers (20 minutes for stretches by default, 30 for breathers);
- the session estimates (worked out from the library's average lengths);
- the session rules: an eye exercise closes every session; standing exercises come last, two at most; never two for one area in a row;
- leaving box breathing out of the breather (holding your breath can feel bad when you're already tense);
- the tension scoring (`src/tension.js`: its weights, phrases and threshold). It is a rough guide, and nobody has tested it.

## References

1. Baker R, et al. (2018). _The short term musculoskeletal and cognitive effects of prolonged sitting during office computer work._ Int J Environ Res Public Health 15(8):1678. https://pmc.ncbi.nlm.nih.gov/articles/PMC6122014/
2. Thorp AA, et al. (2014). _Breaking up workplace sitting time with intermittent standing bouts improves fatigue and musculoskeletal discomfort in overweight/obese office workers._ Occup Environ Med 71(11):765–771. https://pubmed.ncbi.nlm.nih.gov/25168375/
3. Zaccaro A, et al. (2018). _How breath-control can change your life: a systematic review on psycho-physiological correlates of slow breathing._ Front Hum Neurosci. https://pmc.ncbi.nlm.nih.gov/articles/PMC6137615/
4. Albulescu P, et al. (2022). _"Give me a break!" A systematic review and meta-analysis on the efficacy of micro-breaks for increasing well-being and performance._ PLOS ONE. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0272460
5. Mayo Clinic (2024). _Neck stretches for the workplace_ (video and transcript). https://www.mayoclinic.org/healthy-lifestyle/adult-health/multimedia/neck-stretches/vid-20084697
6. Kim SY, et al. (2019). _Flexibility exercise training for adults with fibromyalgia._ Cochrane Database Syst Rev. It quotes the 2013 ACSM guidelines: "Holding a static stretch for 10 to 30 s is recommended for most adults." https://pmc.ncbi.nlm.nih.gov/articles/PMC6718217/
7. HSE. _Working safely with display screen equipment: work routine and breaks._ https://www.hse.gov.uk/msd/dse/work-routine.htm
8. NHS. _Physical activity guidelines for adults aged 19 to 64._ https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/
9. Mayo Clinic Health System (2021). _Don't just sit there: Exercises for the office._ https://www.mayoclinichealthsystem.org/hometown-health/speaking-of-health/dont-just-sit-there-exercises-for-the-office
