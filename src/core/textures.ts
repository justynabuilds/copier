// Everything drawn once into canvases: seeded random, value noise, paper with fibres and tooth, grain and foam.

import { TS } from "./layout.ts"
import type { RGB } from "./color.ts"

export function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function cv(w: number, h: number) {
  const c = document.createElement("canvas")
  c.width = Math.ceil(w)
  c.height = Math.ceil(h)
  return c
}
export function sized(c: HTMLCanvasElement, w: number, h: number) {
  c.style.width = w + "px"
  c.style.height = h + "px"
  return c
}
export function into(el: HTMLCanvasElement, src: HTMLCanvasElement, w: number, h: number) {
  el.width = src.width
  el.height = src.height
  sized(el, w, h)
  el.getContext("2d")!.drawImage(src, 0, 0)
}
// Rotated sheets: keep the paper edge inside the bitmap so it is smoothed, not stair-stepped
export function bleed(c: HTMLCanvasElement, w: number, h: number, px = 2) {
  const o = cv(c.width + px * 2 * TS, c.height + px * 2 * TS)
  o.getContext("2d")!.drawImage(c, px * TS, px * TS)
  o.style.cssText = `position:absolute;left:${-px}px;top:${-px}px;width:${w + px * 2}px;height:${h + px * 2}px;max-width:none`
  return o
}
export function valueNoise(w: number, h: number, cell: number, R: () => number) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2
  const g = new Float32Array(gw * gh).map(() => R())
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1]
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
    }
  return out
}
// Paper fibre clouds: faint in reflected light, strong when the lamp shines through
export function formation(w: number, h: number, seed: number) {
  const R = rng(seed), Wd = w * TS, Hd = h * TS
  const a = valueNoise(Wd, Hd, 26 * TS, R), b = valueNoise(Wd, Hd, 8 * TS, R), c = valueNoise(Wd, Hd, 2.5 * TS, R)
  const f = new Float32Array(Wd * Hd)
  for (let i = 0; i < f.length; i++) f[i] = a[i] * 0.45 + b[i] * 0.35 + c[i] * 0.2
  return f
}
// Surface tooth: a fine height field lit from the top left, sized so it survives at screen resolution.
// Every sheet of the same size shares it, so it's computed once.
const toothCache = new Map<string, Float32Array>()
function toothShade(Wd: number, Hd: number) {
  const key = Wd + "x" + Hd
  const hit = toothCache.get(key)
  if (hit) return hit
  const R = rng(991), a = valueNoise(Wd, Hd, 1.3 * TS, R), b = valueNoise(Wd, Hd, 4.5 * TS, R)
  const hgt = new Float32Array(Wd * Hd), out = new Float32Array(Wd * Hd)
  for (let i = 0; i < hgt.length; i++) hgt[i] = a[i] * 0.62 + b[i] * 0.38
  for (let y = 0, p = 0; y < Hd; y++)
    for (let x = 0; x < Wd; x++, p++) {
      const dx = hgt[p + (x < Wd - 1 ? 1 : 0)] - hgt[p - (x > 0 ? 1 : 0)]
      const dy = hgt[p + (y < Hd - 1 ? Wd : 0)] - hgt[p - (y > 0 ? Wd : 0)]
      out[p] = -(dx * 0.6 + dy * 0.8) * 70
    }
  toothCache.set(key, out)
  return out
}
export function paperCanvas(w: number, h: number, rgb: RGB, form: Float32Array, amt: number, seed: number, fibre = true, relief = 1) {
  const R = rng(seed), Wd = w * TS, Hd = h * TS, c = cv(Wd, Hd), g = c.getContext("2d")!, id = g.createImageData(Wd, Hd), d = id.data
  const shade = toothShade(Wd, Hd)
  for (let y = 0, i = 0, p = 0; y < Hd; y++)
    for (let x = 0; x < Wd; x++, p++, i += 4) {
      const n = (form[p] - 0.5) * amt + shade[p] * relief + (R() - 0.5) * 6
      d[i] = rgb[0] + n
      d[i + 1] = rgb[1] + n
      d[i + 2] = rgb[2] + n * 0.95
      d[i + 3] = 255
    }
  g.putImageData(id, 0, 0)
  if (fibre) {
    g.lineCap = "round"
    for (let i = 0; i < (w * h) / 60; i++) {
      const x = R() * Wd, y = R() * Hd, len = (1.5 + R() * 5) * TS, an = R() * 6.28, bend = (R() - 0.5) * len * 0.6
      const ex = x + Math.cos(an) * len, ey = y + Math.sin(an) * len
      g.strokeStyle = R() < 0.6 ? `rgba(90,82,66,${0.025 + R() * 0.045})` : `rgba(255,255,252,${0.1 + R() * 0.14})`
      g.lineWidth = (0.2 + R() * 0.35) * TS
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo((x + ex) / 2 - Math.sin(an) * bend, (y + ey) / 2 + Math.cos(an) * bend, ex, ey)
      g.stroke()
    }
  }
  return c
}
export function noiseURL(size: number, amp: number, seed: number) {
  const R = rng(seed), c = cv(size, size), g = c.getContext("2d")!, id = g.createImageData(size, size)
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 128 + (R() - 0.5) * amp
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v
    id.data[i + 3] = 255
  }
  g.putImageData(id, 0, 0)
  return c.toDataURL()
}
// The white pad under the lid: open-cell foam, a little grey from use
export function foamURL() {
  const R = rng(8), s = 240, c = cv(s, s), g = c.getContext("2d")!
  g.fillStyle = "#dedcd6"
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${0.03 + R() * 0.05})` : `rgba(255,255,255,${0.15 + R() * 0.2})`
    g.beginPath()
    g.arc(R() * s, R() * s, 0.4 + R() * 1.4, 0, 7)
    g.fill()
  }
  return c.toDataURL()
}
