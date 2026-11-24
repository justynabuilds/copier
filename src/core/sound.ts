// Synthesized foley and phone haptics. Everything is generated with the Web Audio API (no files):
// filtered noise for paper, lid and motor, a sawtooth hum for the scan, two square-wave beeps when copied.
// The audio context starts on the first gesture, as browsers require.

export type Sfx = {
  key: () => void
  scan: (seconds: number) => void
  feed: () => void
  lidUp: () => void
  lidDown: () => void
  paper: () => void
  settle: () => void
  copied: () => void
}

type NoiseOpts = { type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; hold?: number; dur?: number; delay?: number }

export function createSound(o: { enabled: () => boolean; haptics: () => boolean; later: (f: () => void, ms: number) => void }) {
  let actx: AudioContext | null = null, nbuf: AudioBuffer | null = null

  /** Starts (or resumes) audio. Call it from a user gesture. Returns null when sound is off or unavailable. */
  function wake() {
    if (!o.enabled()) return null
    try {
      if (!actx) {
        actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        nbuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate)
        const d = nbuf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      }
      if (actx.state === "suspended") actx.resume()
      return actx
    } catch (e) {
      return null
    }
  }

  function noise({ type = "bandpass", f = 1000, f2 = 0, q: Q = 1, gain = 0.05, attack = 0.005, hold = 0, dur = 0.05, delay = 0 }: NoiseOpts) {
    const a = wake()
    if (!a || !nbuf) return
    const t = a.currentTime + delay, src = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain()
    src.buffer = nbuf
    fl.type = type
    fl.frequency.setValueAtTime(f, t)
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + attack + hold + dur)
    fl.Q.value = Q
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + attack)
    g.gain.setValueAtTime(gain, t + attack + hold)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + dur)
    src.connect(fl).connect(g).connect(a.destination)
    src.start(t, Math.random())
    src.stop(t + attack + hold + dur + 0.05)
  }

  function tone(f: number, dur: number, gain: number, delay = 0) {
    const a = wake()
    if (!a) return
    const t = a.currentTime + delay, osc = a.createOscillator(), g = a.createGain()
    osc.type = "square"
    osc.frequency.value = f
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(a.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  function hum(dur: number) {
    const a = wake()
    if (!a) return
    const t = a.currentTime, osc = a.createOscillator(), fl = a.createBiquadFilter(), g = a.createGain()
    osc.type = "sawtooth"
    osc.frequency.setValueAtTime(46, t)
    osc.frequency.linearRampToValueAtTime(60, t + 0.25)
    osc.frequency.setValueAtTime(60, t + dur - 0.2)
    osc.frequency.linearRampToValueAtTime(42, t + dur)
    fl.type = "lowpass"
    fl.frequency.value = 240
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.05, t + 0.15)
    g.gain.setValueAtTime(0.05, t + dur - 0.2)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    osc.connect(fl).connect(g).connect(a.destination)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  const buzz = (ms: number) => {
    if (!o.haptics()) return
    try {
      navigator.vibrate?.(ms)
    } catch (e) {}
  }

  const sfx: Sfx = {
    key: () => { noise({ type: "lowpass", f: 800, gain: 0.09, dur: 0.05 }); noise({ f: 3000, q: 1.5, gain: 0.025, dur: 0.02 }); buzz(8) },
    scan: (d) => { hum(d); noise({ f: 650, q: 0.7, gain: 0.016, attack: 0.15, hold: d - 0.35, dur: 0.2 }); noise({ type: "lowpass", f: 480, gain: 0.07, dur: 0.06, delay: d - 0.05 }) },
    feed: () => { noise({ f: 1700, f2: 4000, q: 0.6, gain: 0.04, attack: 0.04, hold: 0.25, dur: 0.18 }); noise({ type: "lowpass", f: 1100, gain: 0.05, dur: 0.06, delay: 0.55 }) },
    lidUp: () => { noise({ type: "lowpass", f: 600, gain: 0.05, dur: 0.05 }); noise({ f: 900, f2: 500, q: 0.6, gain: 0.015, attack: 0.1, dur: 0.3 }) },
    lidDown: () => { noise({ f: 600, f2: 1400, q: 0.6, gain: 0.012, attack: 0.15, dur: 0.15 }); noise({ type: "lowpass", f: 380, gain: 0.12, dur: 0.09, delay: 0.42 }); o.later(() => buzz(12), 420) },
    paper: () => noise({ f: 2600, q: 0.8, gain: 0.025, dur: 0.08 }),
    settle: () => { noise({ f: 1900, f2: 900, q: 0.7, gain: 0.03, attack: 0.02, dur: 0.16 }); buzz(6) },
    copied: () => { tone(1568, 0.09, 0.035); tone(2093, 0.14, 0.03, 0.09); buzz(14) },
  }

  function close() {
    try {
      actx?.close()
    } catch (e) {}
  }

  return { wake, sfx, close }
}
