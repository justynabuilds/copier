// Everything printed or drawn on paper and glass: the slip (front, back, and backlit by the lamp),
// each toner copy, the dust on the glass and the rulers. Drawn once into canvases at 3x.

import { BLACK, WHITE, css, mix, type RGB } from "./color.ts"
import { GH, GW, OX, OY, PH, PW, SH, SW, TS, fitValue } from "./layout.ts"
import type { FontSpec } from "./fonts.ts"
import { cv, formation, paperCanvas, rng, sized, valueNoise } from "./textures.ts"

export type SheetOptions = {
  label: string
  value: string
  accent: RGB
  paper: RGB
  ink: RGB
  valueFont: FontSpec
  labelFont: FontSpec
}

function tracked(g: CanvasRenderingContext2D, text: string, x: number, y: number, track: number) {
  let cx = x
  for (const ch of text) {
    g.fillText(ch, cx, y)
    cx += g.measureText(ch).width + track
  }
}

export function createSheets(o: SheetOptions) {
  const VF = (size: number) => `${o.valueFont.style} ${o.valueFont.weight} ${size}px ${o.valueFont.family}`
  // the typed value sets its own size so the whole address fits the slip, in any font,
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
  /** Paper fibre clouds shared by the slip's front, back and backlit views. */
  const form = formation(SW, SH, 21)

  // printing on the original, in its own coordinates
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
    chars.forEach((ch, i) => {
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

  /** The slip face up, as it lies on the desk. */
  function front() {
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

  /** The slip face down on the glass: plain back with faint mirrored show-through. */
  function back() {
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

  /** The slip with the lamp behind it: fibres and mirrored type glow through. */
  function lit() {
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

  /** Copy number n. With the lid open the empty glass prints as a toner border; every copy differs. */
  function copy(n: number, lidOpen: boolean) {
    const R = rng(1000 + n * 17), Wd = PW * TS, Hd = PH * TS
    const c = cv(Wd, Hd), g = c.getContext("2d")!
    g.drawImage(copyBase(), 0, 0)
    if (lidOpen) {
      // flipped per copy so no two toner fields match
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

  /** Dust, hairs and a thumbprint on the glass; `lit` is the version the lamp lights up. */
  function dust(lit: boolean) {
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

  /** Printed rulers along the top and left edge of the glass. */
  function rulers(s: HTMLCanvasElement) {
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

  return { front, back, lit, copy, dust, rulers, copyBase, tonerField }
}
