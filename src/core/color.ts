// Colour parsing and the palette maths that turns a few chosen colours into every shade the machine uses.
// No DOM, so it is unit-tested.

export type RGB = [number, number, number]
export function parseColor(input: string, fallback: RGB): RGB {
  if (!input) return fallback
  let s = String(input).trim()
  // Framer tokens arrive as var(--token, rgb(...)): use the fallback inside
  const v = s.match(/^var\([^,]+,\s*(.+)\)$/)
  if (v) s = v[1]
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (m) return [+m[1], +m[2], +m[3]]
  const h = s.match(/^#([0-9a-f]{3,8})$/i)
  if (h) {
    let x = h[1]
    if (x.length < 6) x = x.split("").map((c) => c + c).join("")
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]
  }
  return fallback
}
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
export const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
export const WHITE: RGB = [255, 255, 255]
export const BLACK: RGB = [0, 0, 0]
