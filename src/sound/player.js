/**
 * The one sound player: schedules a plan's cues ahead on the audio clock.
 * Created once in register(); never play sound from a component.
 */

import { SOUND_CUES, renderCue } from './synth.js'

/** A beat this late (ms) still plays; later than that it's dropped, never bunched up. */
const SOUND_LATE_MS = 60

const SOUND_FADE_S = 0.012

/**
 * The player. Nothing touches Web Audio until the first wake()/sync(), so
 * it's inert in Node. `sync(plan)` makes the scheduled beats match `plan`:
 * an unchanged future (the routine just moved on a step) is left alone;
 * anything else cancels what hasn't started and schedules afresh.
 */
export function createSound({ Ctor, now = () => Date.now() } = {}) {
  const AudioCtor =
    Ctor ?? (typeof window !== 'undefined' ? (window.AudioContext ?? window.webkitAudioContext) : undefined)
  let context = null
  let out = null
  const buffers = {}
  /** Beats handed to the audio clock: { key, at, source, gain }. */
  let voices = []
  let plan = []
  const keyOf = b => `${b.cue}@${b.at}`

  const make = () => {
    if (context || !AudioCtor) return context
    try {
      context = new AudioCtor({ latencyHint: 'interactive' })
    } catch {
      return null
    }
    out = context.createGain()
    out.connect(context.destination)
    for (const [name, recipe] of Object.entries(SOUND_CUES)) {
      const samples = renderCue(recipe, context.sampleRate)
      buffers[name] = context.createBuffer(1, samples.length, context.sampleRate)
      buffers[name].copyToChannel(samples, 0)
    }
    context.onstatechange = () => {
      if (context && context.state === 'running') sync(plan)
    }
    return context
  }
  const running = () => Boolean(context) && context.state === 'running'
  const wake = () => {
    if (!make()) return
    if (context.state !== 'running') context.resume().catch(() => {})
  }
  const startVoice = (beat, t) => {
    const source = context.createBufferSource()
    source.buffer = buffers[beat.cue]
    const gain = context.createGain()
    source.connect(gain).connect(out)
    const voice = { key: keyOf(beat), at: beat.at, source, gain }
    source.onended = () => {
      voices = voices.filter(v => v !== voice)
      gain.disconnect()
    }
    source.start(context.currentTime + Math.max(0, (beat.at - t) / 1000))
    voices.push(voice)
  }
  const cancel = (v, fade) => {
    try {
      if (fade) {
        v.gain.gain.setTargetAtTime(0, context.currentTime, SOUND_FADE_S / 3)
        v.source.stop(context.currentTime + SOUND_FADE_S * 3)
      } else v.source.stop()
    } catch {}
  }
  function sync(next) {
    plan = next
    const t = now()
    const want = next.filter(b => b.at >= t - SOUND_LATE_MS)
    if (want.length && !running()) {
      wake() // once it runs, onstatechange syncs again
      if (!running()) return
    }
    if (!context) return
    const have = new Set(voices.map(v => v.key))
    if (want.every(b => have.has(keyOf(b))) && voices.every(v => v.at <= t || want.some(b => keyOf(b) === v.key)))
      return
    const started = new Set()
    voices = voices.filter(v => {
      if (v.at <= t) return started.add(v.key) // already sounding: let it ring
      cancel(v, false)
      return false
    })
    for (const b of want) if (!started.has(keyOf(b))) startVoice(b, t)
  }
  return {
    wake,
    sync,
    /** Mute now: drop what's queued and fade what's ringing. */
    silence() {
      plan = []
      if (context) for (const v of voices) cancel(v, v.at <= now())
      voices = []
    },
    /** Play a cue now unless the same cue started within `ms` (e.g. the chime on skip-to-done). */
    playOnce(cue, ms = 500) {
      const t = now()
      if (voices.some(v => v.key.startsWith(`${cue}@`) && Math.abs(v.at - t) < ms)) return
      if (!running()) return
      startVoice({ cue, at: t }, t)
    },
    close() {
      plan = []
      voices = []
      if (context) context.close().catch(() => {})
      context = null
    },
    /** Tests/debug: keys of the beats handed to the audio clock. */
    scheduled: () => voices.map(v => v.key)
  }
}
