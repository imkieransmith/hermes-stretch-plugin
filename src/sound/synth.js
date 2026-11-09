/*! OpenChi sound cues: adapted from tap-audio (Nonobound). */
// Sound cue synthesis. tap-audio replaced cuelume there. cuelume
// builds every play from live Web Audio nodes timed on the audio clock, so a
// late start can skip a click's first few ms (most of what you hear): thin,
// quiet or missing taps. Here each cue is rendered ONCE to samples in plain
// JS, normalised to a fixed peak, and every play is that clip from sample 0.
// Beats are scheduled ahead on the audio clock, so the count stays even even
// if the window's timers are throttled. No files, no network.

/** Every cue peaks here (−12 dBFS) before its own `level` (dB). */
export const SOUND_PEAK = 10 ** (-12 / 20)

/**
 * The cues. A layer is a sine (`tone`, Hz) or filtered noise (`noise` +
 * `hz`, `q`); it rises over `attack` s, then falls 60 dB over `decay` s.
 * `to` + `glide` slide the pitch, `at` delays the layer.
 */
export const SOUND_CUES = {
  /** One count: a small soft wooden tock, quieter than a button. */
  tick: {
    level: -4,
    layers: [
      { noise: 'bandpass', hz: 2600, q: 1.4, peak: 0.3, attack: 0.0005, decay: 0.006 },
      { tone: 600, to: 420, glide: 0.015, peak: 1, attack: 0.001, decay: 0.07 },
      { tone: 1260, peak: 0.08, attack: 0.001, decay: 0.05 }
    ]
  },
  /** Get ready / switch sides: a lighter, higher tik, so it reads as "not yet". */
  ready: {
    level: -7,
    layers: [
      { noise: 'bandpass', hz: 4200, q: 2, peak: 0.35, attack: 0.0005, decay: 0.005 },
      { tone: 1480, to: 1320, glide: 0.01, peak: 1, attack: 0.001, decay: 0.035 },
      { tone: 2960, peak: 0.1, attack: 0.001, decay: 0.02 }
    ]
  },
  /** The first second of a step ("go" / each breath's 1): a soft marimba note. */
  go: {
    level: -3,
    layers: [
      { noise: 'lowpass', hz: 1400, q: 0.7, peak: 0.2, attack: 0.001, decay: 0.005 },
      { tone: 659.25, peak: 1, attack: 0.003, decay: 0.32 },
      { tone: 659.25 * 3.99, peak: 0.12, attack: 0.003, decay: 0.08 }
    ]
  },
  /** Finished: two soft bell notes rising a fifth, ringing out. */
  chime: {
    level: -3,
    layers: [
      { noise: 'lowpass', hz: 1500, q: 0.7, peak: 0.15, attack: 0.001, decay: 0.006 },
      { tone: 523.25, peak: 1, attack: 0.003, decay: 0.9 },
      { tone: 523.25 * 2.76, peak: 0.12, attack: 0.003, decay: 0.3 },
      { tone: 783.99, peak: 0.85, attack: 0.003, decay: 1.1, at: 0.14 },
      { tone: 783.99 * 2.76, peak: 0.08, attack: 0.003, decay: 0.3, at: 0.14 }
    ]
  }
}

const SOUND_TAIL_S = 0.002

const SOUND_RETUNE = 32

/** Render a cue to mono samples at `rate`, peaking at SOUND_PEAK + level. */
export function renderCue(recipe, rate) {
  const endOf = l => (l.at ?? 0) + l.attack + l.decay
  const length = Math.ceil(Math.max(...recipe.layers.map(endOf)) * rate)
  const out = new Float32Array(length)
  recipe.layers.forEach((layer, n) => addCueLayer(out, layer, rate, 1 + n))
  const fade = Math.min(length, Math.ceil(SOUND_TAIL_S * rate))
  for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade
  let peak = 0
  for (const x of out) peak = Math.max(peak, Math.abs(x))
  const scale = peak ? (SOUND_PEAK * 10 ** ((recipe.level ?? 0) / 20)) / peak : 0
  for (let i = 0; i < length; i++) out[i] *= scale
  return out
}

function addCueLayer(out, layer, rate, seed) {
  const start = Math.round((layer.at ?? 0) * rate)
  const length = Math.min(out.length - start, Math.ceil((layer.attack + layer.decay) * rate))
  const tau = layer.decay / Math.log(1000) // 60 dB over `decay`
  const from = layer.tone ?? layer.hz
  const glide = layer.glide ?? layer.attack + layer.decay
  const hzAt = t => (layer.to === undefined ? from : from * (layer.to / from) ** Math.min(1, t / glide))
  const random = seededRandom(seed)
  const filter = layer.noise ? biquad(layer.noise, layer.q ?? 1) : null
  let phase = 0
  for (let i = 0; i < length; i++) {
    const t = i / rate
    const level = t < layer.attack ? layer.peak * (t / layer.attack) : layer.peak * Math.exp(-(t - layer.attack) / tau)
    let x
    if (filter) {
      if (i % SOUND_RETUNE === 0) filter.tune(hzAt(t), rate)
      x = filter.step(random() * 2 - 1)
    } else {
      x = Math.sin(phase)
      phase += (2 * Math.PI * hzAt(t)) / rate
    }
    out[start + i] += x * level
  }
}

/** Two-pole filter (Audio EQ Cookbook, as BiquadFilterNode), retunable. */
function biquad(type, q) {
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    a1 = 0,
    a2 = 0
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0
  return {
    tune(hz, rate) {
      const w = (2 * Math.PI * Math.min(hz, rate * 0.45)) / rate
      const cos = Math.cos(w)
      const alpha = Math.sin(w) / (2 * q)
      const a0 = 1 + alpha
      if (type === 'bandpass') [b0, b1, b2] = [alpha, 0, -alpha]
      else if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
      else [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
      ;[b0, b1, b2] = [b0 / a0, b1 / a0, b2 / a0]
      ;[a1, a2] = [(-2 * cos) / a0, (1 - alpha) / a0]
    },
    step(x) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
      ;[x2, x1, y2, y1] = [x1, x, y1, y]
      return y
    }
  }
}

/** Mulberry32: fixed noise, so a cue sounds the same every time. */
function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let v = Math.imul(state ^ (state >>> 15), state | 1)
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61)
    return ((v ^ (v >>> 14)) >>> 0) / 0x100000000
  }
}
