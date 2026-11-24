// The machine: builds every texture, then drives the lid, lamp, display, copies, sound and clipboard.
// It works on plain DOM inside the element's shadow root and returns a cleanup function.
// Everything is drawn once into canvases and moved with CSS and the Web Animations API,
// so nothing re-renders while it plays.

import { BLACK, WHITE, css, mix, type RGB } from "./color.ts"
import { GH, GW, OX, OY, PH, PW, SH, SW, TS, W, fitValue } from "./layout.ts"
import { MX, matrixColumns } from "./matrix.ts"
import { bleed, cv, foamURL, formation, into, noiseURL, paperCanvas, rng, sized, valueNoise } from "./textures.ts"

// ─── Sheets ──────────────────────────────────────────────────────────────────

function tracked(g: CanvasRenderingContext2D, text: string, x: number, y: number, track: number) {
  let cx = x
  for (const ch of text) {
    g.fillText(ch, cx, y)
    cx += g.measureText(ch).width + track
  }
}

// ─── Mount: builds the textures and wires the whole machine ─────────────────

export type FontSpec = { family: string; weight: number | string; style: string }

export type MountOptions = {
  label: string
  value: string
  mark: string
  accent: RGB
  paper: RGB
  ink: RGB
  /** false: a still, non-interactive state for thumbnails and previews */
  live: boolean
  /** the still state: "rest" (slip on the desk) or "tray" (a copy in the tray) */
  canvasState: string
  keepCopies: boolean
  reduced: () => boolean
  sound: () => boolean
  haptics: () => boolean
  onCopy: () => void
  valueFont: FontSpec
  labelFont: FontSpec
}

export function mount(desk: HTMLElement, o: MountOptions) {
  const q = (s: string) => desk.querySelector(s) as HTMLElement
  const machine = q(".cp-machine"), carriage = q(".cp-carriage"), beam = q(".cp-beam"), beamIn = q(".cp-beam-in"), orig = q(".cp-original") as HTMLButtonElement
  const startBtn = q(".cp-start"), live = q(".cp-sr"), matrix = q(".cp-matrix") as HTMLCanvasElement
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (f: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t)
      f()
    }, ms)
    timers.add(t)
    return t
  }
  const cleanups: (() => void)[] = []
  const on = <E extends Event>(el: EventTarget, ev: string, fn: (e: E) => void) => {
    const h = fn as EventListener
    el.addEventListener(ev, h)
    cleanups.push(() => el.removeEventListener(ev, h))
  }
  const reduce = o.reduced
  const MY = 146
  const REST = { x: 85, y: 22, r: -1.6 }
  const GLASS_SPOT = { x: 35, y: MY + 40 }
  const VF = (size: number) => `${o.valueFont.style} ${o.valueFont.weight} ${size}px ${o.valueFont.family}`
  // the typed value sets its own size so the whole address fits the slip, in any font
  // and below 12px it condenses instead of shrinking further, so long values stay readable
  const W100 = (() => {
    const g = cv(1, 1).getContext("2d")!
    g.font = VF(100)
    return g.measureText(o.value || " ").width || 1
  })()
  const { size: FS, condense: HS } = fitValue(W100)
  const accentHi = mix(o.accent, WHITE, 0.3)
  const litPaper = mix(o.accent, WHITE, 0.86)
  const litDust = mix(o.accent, WHITE, 0.62)
  const labelInk = mix(o.ink, o.paper, 0.55)

  // ── printing on the original, in its own coordinates
  function slipText(g: CanvasRenderingContext2D, s: { label: string; ink: string; alpha: number; spread?: boolean }) {
    const R = rng(11)
    g.save()
    g.textBaseline = "alphabetic"
    g.globalAlpha = s.alpha
    g.fillStyle = s.label
    g.font = `${o.labelFont.style} ${o.labelFont.weight} 9.4px ${o.labelFont.family}`
    tracked(g, o.label.toUpperCase(), 18, 27, 1.3)
    g.font = VF(FS)
    const chars = [...o.value]
    const xs = chars.map((_, i) => g.measureText(chars.slice(0, i).join("")).width)
    g.translate(18, 0)
    g.scale(HS, 1)
    ;[...o.value].forEach((ch, i) => {
      const dx = (R() - 0.5) * 0.35, dy = (R() - 0.5) * 0.4, p = 0.86 + R() * 0.14
      g.globalAlpha = s.alpha * p
      g.fillStyle = s.ink
      g.fillText(ch, xs[i] + dx, 62 + dy)
      if (s.spread) {
        g.globalAlpha = s.alpha * 0.35
        g.fillText(ch, xs[i] + dx + 0.35, 62 + dy + 0.2)
      }
    })
    g.restore()
  }
  function mirroredText(blur: number, alpha: number) {
    const c = cv(SW * TS, SH * TS), g = c.getContext("2d")!
    g.filter = blur ? `blur(${blur * TS}px)` : "none"
    g.setTransform(-TS, 0, 0, TS, SW * TS, 0)
    slipText(g, { label: "#000", ink: "#000", alpha })
    return c
  }
  function edges(g: CanvasRenderingContext2D) {
    const e = (x0: number, y0: number, x1: number, y1: number, k: number) => {
      const gg = g.createLinearGradient(x0, y0, x1, y1)
      gg.addColorStop(0, `rgba(30,30,30,${k})`)
      gg.addColorStop(1, "rgba(30,30,30,0)")
      g.fillStyle = gg
      g.fillRect(0, 0, SW, SH)
    }
    e(SW, 0, SW - 7, 0, 0.12)
    e(0, SH, 0, SH - 6, 0.14)
    e(0, 0, 5, 0, 0.06)
  }
  function makeFront(form: Float32Array) {
    const c = paperCanvas(SW, SH, o.paper, form, 14, 4, true, 0.6), g = c.getContext("2d")!
    const t = cv(c.width, c.height), tg = t.getContext("2d")!
    tg.scale(TS, TS)
    slipText(tg, { label: css(labelInk), ink: css(o.ink), alpha: 1 })
    const m = cv(c.width, c.height), mg = m.getContext("2d")!, id = mg.createImageData(m.width, m.height), R = rng(9)
    for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = (0.8 + R() * 0.2) * 255
    mg.putImageData(id, 0, 0)
    tg.setTransform(1, 0, 0, 1, 0, 0)
    tg.globalCompositeOperation = "destination-in"
    tg.drawImage(m, 0, 0)
    g.drawImage(t, 0, 0)
    g.scale(TS, TS)
    const lg = g.createLinearGradient(0, 0, SW, SH)
    lg.addColorStop(0, "rgba(255,255,255,0.08)")
    lg.addColorStop(1, "rgba(0,0,0,0.05)")
    g.fillStyle = lg
    g.fillRect(0, 0, SW, SH)
    return c
  }
  function makeBack(form: Float32Array) {
    const c = paperCanvas(SW, SH, mix(o.paper, BLACK, 0.075), form, 14, 5, true, 0.6), g = c.getContext("2d")!
    g.drawImage(mirroredText(0.6, 0.035), 0, 0)
    g.scale(TS, TS)
    const lg = g.createLinearGradient(0, 0, SW, SH)
    lg.addColorStop(0, "rgba(255,255,255,0.10)")
    lg.addColorStop(0.5, "rgba(255,255,255,0)")
    lg.addColorStop(1, "rgba(0,0,0,0.10)")
    g.fillStyle = lg
    g.fillRect(0, 0, SW, SH)
    edges(g)
    return c
  }
  function makeLit(form: Float32Array) {
    const c = paperCanvas(SW, SH, litPaper, form, 46, 6, false, 0.3), g = c.getContext("2d")!
    g.globalCompositeOperation = "multiply"
    g.drawImage(mirroredText(0.55, 0.62), 0, 0)
    g.globalCompositeOperation = "source-over"
    g.globalAlpha = 0.5
    g.drawImage(mirroredText(0, 0.25), 0, 0)
    return c
  }
  // copier paper and the open-glass toner field are built once, ahead of the first copy
  let baseSheet: HTMLCanvasElement | null = null, toner: HTMLCanvasElement | null = null
  function copyBase() {
    if (!baseSheet) baseSheet = paperCanvas(PW, PH, mix(o.paper, [242, 242, 238], 0.6), formation(PW, PH, 301), 10, 401, false, 0.7)
    return baseSheet
  }
  function tonerField() {
    if (toner) return toner
    const R = rng(555), Wd = PW * TS, Hd = PH * TS
    const f = cv(Wd, Hd), fg = f.getContext("2d")!, fid = fg.createImageData(Wd, Hd), d = fid.data
    const mott = valueNoise(Wd, Hd, 9 * TS, R), band = R() * 6.28
    for (let y = 0; y < Hd; y++) {
      const row = 0.8 + 0.05 * Math.sin(y / TS / 6 + band)
      for (let x = 0; x < Wd; x++) {
        if (x >= OX * TS && x < (OX + SW) * TS && y >= OY * TS && y < (OY + SH) * TS) continue
        const i = (y * Wd + x) * 4, a = row + (mott[y * Wd + x] - 0.5) * 0.18 + (R() - 0.5) * 0.3
        d[i] = 22
        d[i + 1] = 22
        d[i + 2] = 24
        d[i + 3] = Math.max(0, Math.min(1, a)) * 255
      }
    }
    fg.putImageData(fid, 0, 0)
    return (toner = f)
  }
  function makeCopy(n: number, lidOpen: boolean) {
    const R = rng(1000 + n * 17), Wd = PW * TS, Hd = PH * TS
    const c = cv(Wd, Hd), g = c.getContext("2d")!
    g.drawImage(copyBase(), 0, 0)
    if (lidOpen) {
      // lid open: the empty glass prints as a toner field, flipped per copy so no two match
      g.save()
      g.translate(n % 2 ? Wd : 0, n % 3 === 0 ? Hd : 0)
      g.scale(n % 2 ? -1 : 1, n % 3 === 0 ? -1 : 1)
      g.drawImage(tonerField(), 0, 0)
      g.restore()
    }
    g.save()
    g.scale(TS, TS)
    // the copier picks up the edge of the original
    g.strokeStyle = lidOpen ? "rgba(35,35,37,0.4)" : "rgba(60,60,62,0.22)"
    g.lineWidth = lidOpen ? 0.7 : 0.5
    g.strokeRect(OX + 0.35, OY + 0.35, SW - 0.7, SH - 0.7)
    if (!lidOpen) {
      g.fillStyle = "rgba(60,60,62,0.10)"
      g.fillRect(OX + SW - 1, OY + 2, 1.4, SH)
      g.fillRect(OX + 2, OY + SH - 0.6, SW, 1.2)
    }
    const sh = g.createLinearGradient(OX, OY, OX + SW, OY)
    sh.addColorStop(0, "rgba(0,0,0,0.06)")
    sh.addColorStop(0.25, "rgba(0,0,0,0)")
    sh.addColorStop(1, "rgba(0,0,0,0.04)")
    g.fillStyle = sh
    g.fillRect(OX, OY, SW, SH)
    g.restore()
    // the type, in toner, a hair off square
    const t = cv(SW * TS, SH * TS), tg = t.getContext("2d")!
    tg.scale(TS, TS)
    slipText(tg, { label: "#1d1d1f", ink: "#121214", alpha: 1, spread: true })
    const m = cv(t.width, t.height), mg = m.getContext("2d")!, mid = mg.createImageData(m.width, m.height)
    for (let i = 0; i < mid.data.length; i += 4) mid.data[i + 3] = (R() < 0.05 ? 0.5 : 0.88 + R() * 0.12) * 255
    mg.putImageData(mid, 0, 0)
    tg.setTransform(1, 0, 0, 1, 0, 0)
    tg.globalCompositeOperation = "destination-in"
    tg.drawImage(m, 0, 0)
    g.save()
    g.translate(OX * TS, OY * TS)
    g.rotate((R() - 0.5) * 0.004)
    g.drawImage(t, 0, 0)
    g.restore()
    g.save()
    g.scale(TS, TS)
    for (let i = 0; i < (lidOpen ? 46 : 26); i++) {
      const near = R() < 0.6, x = near ? OX + 16 + R() * 215 : R() * PW, y = near ? OY + 44 + R() * 26 : R() * PH
      g.fillStyle = `rgba(18,18,20,${0.2 + R() * 0.5})`
      g.beginPath()
      g.arc(x, y, 0.2 + R() * (near ? 0.3 : 0.5), 0, 7)
      g.fill()
    }
    if (R() < 0.6) {
      const x = OX + 20 + R() * (SW - 40)
      g.fillStyle = `rgba(30,30,32,${0.06 + R() * 0.07})`
      g.fillRect(x, 0, 0.6, PH)
    }
    // a warm sheet straight off the fuser isn't flat
    const wv = g.createLinearGradient(0, 0, PW, 0), ph = R()
    for (let k = 0; k <= 6; k++) wv.addColorStop(k / 6, `rgba(${k % 2 ? "255,255,255" : "0,0,0"},${0.025 + 0.02 * Math.sin(k + ph * 6)})`)
    g.fillStyle = wv
    g.fillRect(0, 0, PW, PH)
    g.restore()
    return c
  }
  function makeDust(lit: boolean) {
    const R = rng(77), c = cv(GW * TS, GH * TS), g = c.getContext("2d")!
    g.scale(TS, TS)
    for (let i = 0; i < 70; i++) {
      const x = R() * GW, y = R() * GH, r = 0.25 + R() * R() * 0.9
      g.fillStyle = lit ? css(litDust, 0.35 + R() * 0.6) : `rgba(255,255,255,${0.04 + R() * 0.07})`
      g.beginPath()
      g.arc(x, y, r, 0, 7)
      g.fill()
    }
    for (let i = 0; i < 5; i++) {
      const x = R() * GW, y = R() * GH, a = R() * 6.28, l = 3 + R() * 7
      g.strokeStyle = lit ? css(litDust, 0.45) : "rgba(255,255,255,0.05)"
      g.lineWidth = 0.35
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 1.5, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
      g.stroke()
    }
    // a thumbprint where someone pressed a sheet flat
    g.save()
    g.translate(300, 96)
    g.rotate(-0.5)
    g.lineWidth = 0.5
    for (let k = 0; k < 11; k++) {
      g.strokeStyle = lit ? css(litDust, 0.16 - k * 0.01) : `rgba(255,255,255,${0.028 - k * 0.002})`
      g.beginPath()
      g.ellipse(0, 0, 2 + k * 1.2, 3 + k * 1.55, 0, 0.2, Math.PI * 1.85)
      g.stroke()
    }
    g.restore()
    return c
  }
  function drawScale() {
    // printed rulers along the top and left edge of the glass
    const s = q(".cp-scale") as HTMLCanvasElement
    s.width = GW * TS
    s.height = GH * TS
    sized(s, GW, GH)
    const g = s.getContext("2d")!
    g.scale(TS, TS)
    const tick = css(accentHi, 0.3), major = css(accentHi, 0.42)
    for (let x = 6, i = 1; x < GW - 4; x += 6, i++) {
      g.fillStyle = i % 5 === 0 ? major : tick
      g.fillRect(x, 0, 0.55, i % 5 === 0 ? 5 : 2.5)
    }
    for (let y = 6, i = 1; y < GH - 4; y += 6, i++) {
      g.fillStyle = i % 5 === 0 ? major : tick
      g.fillRect(0, y, i % 5 === 0 ? 5 : 2.5, 0.55)
    }
    g.font = '600 5px "Geist", "Inter", sans-serif'
    g.fillStyle = css(accentHi, 0.38)
    g.fillText("A6", 258, 10)
    g.fillText("A5", 330, 10)
    g.save()
    g.translate(10, 112)
    g.rotate(-Math.PI / 2)
    g.fillText("A6", 0, 0)
    g.restore()
  }

  // ── dot matrix display
  matrix.width = MX.w * TS
  matrix.height = MX.h * TS
  sized(matrix, MX.w, MX.h)
  type Msg = { cols: boolean[][]; scroll: boolean; t0: number; blink: boolean }
  let msg: Msg = { cols: [], scroll: false, t0: 0, blink: false }, mxRaf = 0, onScreen = true
  function show(text: string, opt: { blink?: boolean } = {}) {
    const cols = matrixColumns(text)
    msg = { cols, scroll: cols.length > MX.cols, t0: performance.now(), blink: !!opt.blink && !reduce() }
    if (!mxRaf) mxRaf = requestAnimationFrame(drawMatrix)
  }
  function drawMatrix(now: number) {
    const g = matrix.getContext("2d")!
    g.setTransform(TS, 0, 0, TS, 0, 0)
    g.clearRect(0, 0, MX.w, MX.h)
    const oy = (MX.h - MX.rows * MX.pitch) / 2 + 0.3, ox = (MX.w - MX.cols * MX.pitch) / 2 + 0.3, d = MX.pitch - 0.55
    const cols = msg.cols
    let start = 0
    if (msg.scroll) start = (Math.floor((now - msg.t0) / 70) % (cols.length + 14)) - 4
    else start = -Math.floor((MX.cols - cols.length) / 2)
    const lit = !msg.blink || Math.floor((now - msg.t0) / 420) % 2 === 0
    for (let x = 0; x < MX.cols; x++) {
      const col = cols[x + start]
      for (let y = 0; y < MX.rows; y++) {
        const onDot = lit && col && col[y]
        if (onDot) {
          g.shadowColor = css(o.accent, 0.6)
          g.shadowBlur = 1.6 * TS
          g.fillStyle = css(accentHi)
        } else {
          g.shadowBlur = 0
          g.fillStyle = css(accentHi, 0.055)
        }
        g.beginPath()
        g.arc(ox + x * MX.pitch + d / 2, oy + y * MX.pitch + d / 2, d * 0.46, 0, 7)
        g.fill()
      }
    }
    // marquee and blink keep the loop alive; a static message stops it
    mxRaf = onScreen && ((msg.scroll && !reduce()) || msg.blink) ? requestAnimationFrame(drawMatrix) : 0
  }

  // ── sound and haptics
  let actx: AudioContext | null = null, nbuf: AudioBuffer | null = null
  function audio() {
    if (!o.sound()) return null
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
  type NoiseOpts = { type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; hold?: number; dur?: number; delay?: number }
  function noise({ type = "bandpass", f = 1000, f2 = 0, q: Q = 1, gain = 0.05, attack = 0.005, hold = 0, dur = 0.05, delay = 0 }: NoiseOpts) {
    const a = audio()
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
    const a = audio()
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
    const a = audio()
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
  const sfx = {
    key: () => { noise({ type: "lowpass", f: 800, gain: 0.09, dur: 0.05 }); noise({ f: 3000, q: 1.5, gain: 0.025, dur: 0.02 }); buzz(8) },
    scan: (d: number) => { hum(d); noise({ f: 650, q: 0.7, gain: 0.016, attack: 0.15, hold: d - 0.35, dur: 0.2 }); noise({ type: "lowpass", f: 480, gain: 0.07, dur: 0.06, delay: d - 0.05 }) },
    feed: () => { noise({ f: 1700, f2: 4000, q: 0.6, gain: 0.04, attack: 0.04, hold: 0.25, dur: 0.18 }); noise({ type: "lowpass", f: 1100, gain: 0.05, dur: 0.06, delay: 0.55 }) },
    lidUp: () => { noise({ type: "lowpass", f: 600, gain: 0.05, dur: 0.05 }); noise({ f: 900, f2: 500, q: 0.6, gain: 0.015, attack: 0.1, dur: 0.3 }) },
    lidDown: () => { noise({ f: 600, f2: 1400, q: 0.6, gain: 0.012, attack: 0.15, dur: 0.15 }); noise({ type: "lowpass", f: 380, gain: 0.12, dur: 0.09, delay: 0.42 }); later(() => buzz(12), 420) },
    paper: () => noise({ f: 2600, q: 0.8, gain: 0.025, dur: 0.08 }),
    settle: () => { noise({ f: 1900, f2: 900, q: 0.7, gain: 0.03, attack: 0.02, dur: 0.16 }); buzz(6) },
    copied: () => { tone(1568, 0.09, 0.035); tone(2093, 0.14, 0.03, 0.09); buzz(14) },
  }

  // ── lid and lamp
  let lidOpen = false, loaded = false, busy = false, made = 0
  function setLid(open: boolean, quiet = false) {
    if (open === lidOpen) return
    lidOpen = open
    machine.classList.toggle("cp-open", open)
    machine.classList.toggle("cp-shut", !open)
    if (!quiet) open ? sfx.lidUp() : sfx.lidDown()
  }
  const LAMP0 = 5, LAMP1 = 5 + GW + 20
  const leaks = Array.from(desk.querySelectorAll(".cp-leak")) as HTMLElement[]
  function sweep(from: number, to: number, duration: number, easing: string) {
    const op: KeyframeAnimationOptions = { duration, easing, fill: "forwards" }
    const k = (x: number) => `translateX(${x}px)`
    carriage.animate([{ transform: k(from - 25) }, { transform: k(to - 25) }], op)
    beam.animate([{ transform: k(from - 85) }, { transform: k(to - 85) }], op)
    beamIn.animate([{ transform: k(85 - from) }, { transform: k(85 - to) }], op)
    // with the lid down, light only escapes along its edges
    for (const l of leaks) l.animate([{ transform: k(18 + from - 35) }, { transform: k(18 + to - 35) }], op)
  }

  // ── the original: drag or click it onto the glass
  const place = (x: number, y: number, r: number, extra = "") => `translate(${x}px, ${y}px) rotate(${r}deg) ${extra}`
  const deskScale = () => desk.getBoundingClientRect().width / W || 1
  const overGlass = (x: number, y: number) => {
    const cx = x + SW / 2, cy = y + SH / 2
    return cx > 18 && cx < 402 && cy > MY + 10 && cy < MY + 190
  }
  orig.setAttribute("aria-label", `Put the ${o.label.toLowerCase()} in the copier`)
  type SlipDrag = { sx: number; sy: number; x: number; y: number; k: number; moved: boolean }
  let og: SlipDrag | null = null

  function load(x: number, y: number, r: number, s = 1) {
    // the sheet travels to the corner of the glass and turns face down on the way
    drain()
    busy = true
    audio()
    setLid(true)
    orig.classList.add("cp-lifted", "cp-flying")
    show("READY")
    const T = reduce() ? 1 : 820, delay = reduce() ? 0 : 160
    const mx = (x + GLASS_SPOT.x) / 2, my = Math.min(y, GLASS_SPOT.y) - 26
    orig.animate(
      [
        { transform: place(x, y, r, `scale(${s}) rotateY(0deg)`) },
        { transform: place(mx, my, r * 0.5, "scale(1.07) rotateY(90deg)"), offset: 0.5 },
        { transform: place(GLASS_SPOT.x, GLASS_SPOT.y, 0, "scale(1.01) rotateY(180deg)"), offset: 0.88 },
        { transform: place(GLASS_SPOT.x, GLASS_SPOT.y, 0, "scale(1) rotateY(180deg)") },
      ],
      { duration: T, easing: "cubic-bezier(.45,.05,.3,1)", fill: "forwards", delay }
    )
    later(() => sfx.paper(), reduce() ? 0 : 300)
    later(() => {
      sfx.settle()
      loaded = true
      machine.classList.add("cp-loaded")
      orig.classList.add("cp-inside")
      orig.classList.remove("cp-lifted")
      orig.setAttribute("aria-label", `The ${o.label.toLowerCase()} is in the copier`)
      later(() => run(true), reduce() ? 0 : 380)
    }, T + delay + 20)
  }

  // ── copying
  type Page = { el: HTMLDivElement; x: number; y: number; r: number; out: boolean }
  type PageDrag = { sx: number; sy: number; x0: number; y0: number; lx: number; vx: number; tilt: number; k: number; moved: boolean }
  const pages: Page[] = []
  const pageT = (p: Page, extra = "") => `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg) ${extra}`
  const TRAY = { l: 38 - 70, r: 382 - 70, t: 226 - 236, b: 394 - 236 }
  const inTray = (p: Page) => {
    const cx = p.x + PW / 2, cy = p.y + PH / 2
    return cx > TRAY.l && cx < TRAY.r && cy > TRAY.t && cy < TRAY.b + 20
  }
  function run(auto: boolean) {
    busy = true
    machine.classList.remove("cp-ready")
    startBtn.classList.add("cp-down")
    later(() => startBtn.classList.remove("cp-down"), 150)
    sfx.key()
    const scanT = reduce() ? 200 : 1250, backT = reduce() ? 100 : 560, open = lidOpen
    show("COPYING", { blink: true })
    later(() => {
      machine.classList.add("cp-scanning")
      sfx.scan(scanT / 1000)
      sweep(LAMP0, LAMP1, scanT, "cubic-bezier(.45,.05,.4,1)")
      later(() => {
        machine.classList.remove("cp-scanning")
        sweep(LAMP1, LAMP0, backT, "cubic-bezier(.5,0,.2,1)")
        eject(open, true)
        if (auto) later(() => setLid(false), reduce() ? 0 : 900)
      }, scanT)
    }, 170)
  }
  function eject(open: boolean, animate: boolean) {
    made++
    const n = made, el = document.createElement("div")
    el.className = "cp-page"
    const c = bleed(makeCopy(n, open), PW, PH)
    c.setAttribute("aria-hidden", "true")
    el.appendChild(c)
    el.setAttribute("role", "button")
    el.tabIndex = 0
    el.setAttribute("aria-label", `Copy ${o.value} to the clipboard`)
    const inTrayCount = pages.filter((p) => !p.out).length
    const R = rng(n * 91), rot = (R() - 0.5) * 4, dx = (R() - 0.5) * 12, dy = Math.min(inTrayCount, 4) * 2.4
    const p = { el, x: dx, y: dy, r: rot, out: false }
    pages.push(p)
    machine.insertBefore(el, q(".cp-overhang"))
    bindPage(p)
    el.style.transform = pageT(p)
    const T = animate && !reduce() ? 820 : 0
    if (T) {
      sfx.feed()
      el.animate(
        [
          { transform: "translate(0px, -112px) rotate(0deg)" },
          { transform: `translate(${dx * 0.7}px, ${dy + 5}px) rotate(${rot * 0.5}deg)`, offset: 0.64, easing: "cubic-bezier(.25,.6,.3,1)" },
          { transform: pageT(p) },
        ],
        { duration: T, easing: "cubic-bezier(.25,.7,.3,1)" }
      )
    }
    later(() => {
      busy = false
      machine.classList.add("cp-ready")
      show("TAKE COPY")
    }, T)
  }
  function fallback() {
    const ta = document.createElement("textarea")
    ta.value = o.value
    ta.setAttribute("readonly", "")
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none"
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand("copy")
    } catch (e) {}
    ta.remove()
  }
  let copiedT: ReturnType<typeof setTimeout> | undefined, flashT: ReturnType<typeof setTimeout> | undefined
  function copyToClipboard() {
    try {
      navigator.clipboard.writeText(o.value).catch(fallback)
    } catch (e) {
      fallback()
    }
    sfx.copied()
    show("COPIED ✓")
    machine.classList.add("cp-flash")
    clearTimeout(flashT)
    flashT = later(() => machine.classList.remove("cp-flash"), 900)
    live.textContent = ""
    live.textContent = `Copied ${o.value} to the clipboard.`
    clearTimeout(copiedT)
    copiedT = later(() => show(loaded ? "READY" : "PLACE ORIGINAL"), 2600)
    o.onCopy()
  }
  function retire(p: Page) {
    // copies that shouldn't stay on the desk slide away once they've done their job
    if (o.keepCopies) return
    later(() => {
      p.el.animate([{ transform: pageT(p), opacity: 1 }, { transform: pageT(p, "translateY(24px)"), opacity: 0 }], { duration: reduce() ? 1 : 420, easing: "ease-in", fill: "forwards" })
      later(() => {
        p.el.remove()
        pages.splice(pages.indexOf(p), 1)
      }, reduce() ? 10 : 440)
    }, 1600)
  }
  function bindPage(p: Page) {
    const el = p.el
    let s: PageDrag | null = null
    on(el, "pointerdown", (e: PointerEvent) => {
      if (!p.out && pages.filter((x) => !x.out).slice(-1)[0] !== p) return // in the tray only the top copy comes out
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      audio()
      el.getAnimations().forEach((a) => a.cancel())
      s = { sx: e.clientX, sy: e.clientY, x0: p.x, y0: p.y, lx: e.clientX, vx: 0, tilt: 0, k: deskScale(), moved: false }
    })
    on(el, "pointermove", (e: PointerEvent) => {
      if (!s) return
      const dx = (e.clientX - s.sx) / s.k, dy = (e.clientY - s.sy) / s.k
      if (!s.moved && Math.hypot(dx, dy) > 4) {
        s.moved = true
        el.classList.add("cp-held")
        sfx.paper()
      }
      if (!s.moved) return
      s.vx = s.vx * 0.7 + (e.clientX - s.lx) * 0.3
      s.lx = e.clientX
      s.tilt += (Math.max(-7, Math.min(7, s.vx * 0.5)) - s.tilt) * 0.3
      p.x = s.x0 + dx
      p.y = s.y0 + dy
      el.style.transform = pageT(p, `rotate(${s.tilt}deg) scale(1.035)`)
    })
    const up = () => {
      if (!s) return
      const st = s
      s = null
      el.classList.remove("cp-held")
      if (!st.moved) {
        copyToClipboard()
        el.animate([{ transform: pageT(p) }, { transform: pageT(p, "translateY(-2px) scale(1.012)") }, { transform: pageT(p) }], { duration: 260, easing: "ease-out" })
        return
      }
      sfx.settle()
      const from = el.style.transform
      if (!p.out && !inTray(p)) {
        p.out = true
        el.classList.add("cp-out")
        p.r += st.tilt * 0.4
        copyToClipboard()
        retire(p)
      } else if (!p.out) {
        p.x = st.x0
        p.y = st.y0
      }
      el.style.transform = pageT(p)
      el.animate([{ transform: from }, { transform: pageT(p) }], { duration: 480, easing: "cubic-bezier(.22,1,.36,1)" })
    }
    on(el, "pointerup", up)
    on(el, "pointercancel", up)
    on(el, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        copyToClipboard()
      }
    })
  }

  // ── build
  desk.style.setProperty("--cp-grain", `url(${noiseURL(128, 70, 3)})`)
  desk.style.setProperty("--cp-foam", `url(${foamURL()})`)
  q(".cp-mark").textContent = o.mark
  const form = formation(SW, SH, 21)
  q(".cp-face").appendChild(bleed(makeFront(form), SW, SH))
  drawScale()
  // everything hidden at rest is built in idle moments, one piece per tick, so loading never stalls
  const queue: (() => void)[] = []
  const ric = (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  const cic = (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
  const idle = (cb: () => void): number => (ric ? ric.call(window, cb) : window.setTimeout(cb, 16))
  const cancelIdle = (id: number) => (cic ? cic.call(window, id) : window.clearTimeout(id))
  let idleId = 0
  const pump = () => {
    idleId = 0
    queue.shift()?.()
    if (queue.length) idleId = idle(pump)
  }
  const drain = () => {
    while (queue.length) queue.shift()!()
  }
  queue.push(
    () => {
      const back = makeBack(form)
      q(".cp-back").appendChild(bleed(back, SW, SH))
      q(".cp-slip").appendChild(sized(back, SW, SH))
    },
    () => into(q(".cp-lit-slip") as HTMLCanvasElement, makeLit(form), SW, SH),
    () => into(q(".cp-dust") as HTMLCanvasElement, makeDust(false), GW, GH),
    () => into(q(".cp-lit-dust") as HTMLCanvasElement, makeDust(true), GW, GH),
    () => copyBase(),
    () => tonerField()
  )
  idleId = idle(pump)
  carriage.style.transform = `translateX(${LAMP0 - 25}px)`
  orig.style.transform = place(REST.x, REST.y, REST.r)

  if (!o.live) {
    // canvas and previews: a still, believable state
    drain()
    if (o.canvasState === "tray") {
      loaded = true
      machine.classList.add("cp-loaded")
      orig.classList.add("cp-inside")
      eject(true, false)
      show("TAKE COPY")
    } else show("READY") // a still frame can't show the scrolling hint
    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(mxRaf)
      cancelIdle(idleId)
    }
  }
  show("PLACE ORIGINAL")

  // the display only animates while the copier is on screen and the tab is visible
  let inView = true
  const wake = () => {
    onScreen = inView && !document.hidden
    if (onScreen && !mxRaf) mxRaf = requestAnimationFrame(drawMatrix)
  }
  const io = new IntersectionObserver((entries) => {
    inView = entries[0]?.isIntersecting ?? true
    wake()
  })
  io.observe(desk)
  on(document, "visibilitychange", wake)

  on(orig, "pointerdown", (e: PointerEvent) => {
    if (loaded || busy) return
    e.preventDefault()
    orig.setPointerCapture(e.pointerId)
    audio()
    orig.getAnimations().forEach((a) => a.cancel())
    og = { sx: e.clientX, sy: e.clientY, x: REST.x, y: REST.y, k: deskScale(), moved: false }
  })
  on(orig, "pointermove", (e: PointerEvent) => {
    if (!og) return
    const dx = (e.clientX - og.sx) / og.k, dy = (e.clientY - og.sy) / og.k
    if (!og.moved && Math.hypot(dx, dy) > 4) {
      og.moved = true
      orig.classList.add("cp-lifted")
      sfx.paper()
    }
    if (!og.moved) return
    og.x = REST.x + dx
    og.y = REST.y + dy
    orig.style.transform = place(og.x, og.y, REST.r * 0.4, "scale(1.03)")
    setLid(og.y + SH > MY - 30) // the lid lifts as the sheet comes near
    show(lidOpen && overGlass(og.x, og.y) ? "DROP" : "PLACE ORIGINAL")
  })
  const release = () => {
    if (!og) return
    const s = og
    og = null
    if (!s.moved) return load(REST.x, REST.y, REST.r)
    if (overGlass(s.x, s.y)) return load(s.x, s.y, REST.r * 0.4, 1.03)
    orig.classList.remove("cp-lifted")
    sfx.settle()
    setLid(false)
    show("PLACE ORIGINAL")
    orig.animate([{ transform: orig.style.transform }, { transform: place(REST.x, REST.y, REST.r) }], { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" })
    orig.style.transform = place(REST.x, REST.y, REST.r)
  }
  on(orig, "pointerup", release)
  on(orig, "pointercancel", release)
  on(orig, "click", (e: MouseEvent) => {
    if (e.detail === 0 && !loaded && !busy) load(REST.x, REST.y, REST.r) // keyboard
  })
  on(startBtn, "click", () => {
    audio()
    if (busy) return
    if (!loaded) return load(REST.x, REST.y, REST.r) // the sheet is still on the desk: feed it in, then copy
    // lift the lid for every copy so they all print the same, and the scan stays visible
    busy = true
    setLid(true)
    later(() => run(true), reduce() ? 0 : 520)
  })

  return () => {
    cleanups.forEach((f) => f())
    timers.forEach(clearTimeout)
    cancelAnimationFrame(mxRaf)
    cancelIdle(idleId)
    io.disconnect()
    try {
      actx?.close()
    } catch (e) {}
  }
}
