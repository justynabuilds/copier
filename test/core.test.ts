import { test } from "node:test"
import assert from "node:assert/strict"
import { mix, parseColor, lum } from "../src/core/color.ts"
import { PALETTES, cssVars, resolve } from "../src/core/palette.ts"
import { H, SW, W, fitDesk, fitValue } from "../src/core/layout.ts"
import { FONT, MX, matrixColumns } from "../src/core/matrix.ts"
import { rng, valueNoise } from "../src/core/textures.ts"

test("colours parse from rgb, hex, short hex and Framer-style var() tokens", () => {
  assert.deepEqual(parseColor("rgb(226, 72, 31)", [0, 0, 0]), [226, 72, 31])
  assert.deepEqual(parseColor("#e2481f", [0, 0, 0]), [226, 72, 31])
  assert.deepEqual(parseColor("#fff", [0, 0, 0]), [255, 255, 255])
  assert.deepEqual(parseColor("var(--token-x, rgb(1, 2, 3))", [0, 0, 0]), [1, 2, 3])
  assert.deepEqual(parseColor("not a colour", [9, 9, 9]), [9, 9, 9])
  assert.deepEqual(mix([0, 0, 0], [255, 255, 255], 0.5), [127.5, 127.5, 127.5])
})

test("the tray falls back to the body colour, and strength is clamped to 0 to 200%", () => {
  const r = resolve({ ...PALETTES.dark, tray: "", strength: 500 })
  assert.deepEqual(r.tray, r.body)
  assert.equal(r.strength, 2)
})

test("engraving flips between dark and light ink with the body colour", () => {
  const light = cssVars(resolve(PALETTES.light), "mono")
  const dark = cssVars(resolve(PALETTES.dark), "mono")
  assert.ok(lum(resolve(PALETTES.light).body) > 0.5)
  assert.equal(light["--cp-eng"], "rgba(0,0,0,0.36)")
  assert.equal(dark["--cp-eng"], "rgba(255,255,255,0.28)")
  assert.equal(dark["--cp-a"], "rgba(226,72,31,1)")
  assert.equal(dark["--cp-vf"], "mono")
})

test("a lighter tray gets softer shading inside, so a white tray has no black band", () => {
  const alpha = (v: string) => parseFloat(v.split(",")[3])
  const darkTray = cssVars(resolve({ ...PALETTES.dark, tray: "rgb(30,30,30)" }), "m")
  const whiteTray = cssVars(resolve({ ...PALETTES.dark, tray: "rgb(255,255,255)" }), "m")
  assert.ok(alpha(whiteTray["--cp-oh1"]) < alpha(darkTray["--cp-oh1"]) * 0.5)
})

test("the desk fits any box centred without distortion", () => {
  assert.deepEqual(fitDesk(W, H), { k: 1, x: 0, y: 0 })
  const wide = fitDesk(1000, 640)
  assert.equal(wide.k, 1)
  assert.equal(wide.x, (1000 - W) / 2)
  const small = fitDesk(210, 640)
  assert.equal(small.k, 0.5)
  assert.equal(small.y, (640 - H * 0.5) / 2)
})

test("the typed value grows to fit, stops at 19px, and condenses below 12px instead of shrinking", () => {
  const room = SW - 40
  assert.deepEqual(fitValue(100), { size: 19, condense: 1 })            // short value: capped at 19px
  const mid = fitValue((room * 100) / 15)                                 // fits exactly at 15px
  assert.ok(Math.abs(mid.size - 15) < 1e-9 && mid.condense === 1)
  const long = fitValue((room * 100) / 6)                                 // would need 6px
  assert.equal(long.size, 12)
  assert.ok(Math.abs(long.condense - 0.5) < 1e-9)                         // drawn at 12px, squeezed to half width
})

test("the display font covers every message the copier shows", () => {
  for (const msg of ["PLACE ORIGINAL", "DROP", "READY", "COPYING", "TAKE COPY", "COPIED ✓"])
    for (const ch of msg) assert.ok(FONT[ch], `missing glyph ${ch} in ${msg}`)
  const cols = matrixColumns("READY")
  assert.equal(cols.length, 5 * 6)                                        // 5 columns + 1 gap per letter
  assert.ok(cols.every((c) => c.length === MX.rows))
  assert.ok(matrixColumns("PLACE ORIGINAL").length > MX.cols, "the long hint scrolls")
})

test("seeded randomness repeats exactly, so each copy's specks are stable but unique", () => {
  const a = rng(42), b = rng(42), c = rng(43)
  const sa = [a(), a(), a()], sb = [b(), b(), b()]
  assert.deepEqual(sa, sb)
  assert.notDeepEqual(sa, [c(), c(), c()])
  const n = valueNoise(16, 8, 4, rng(1))
  assert.equal(n.length, 16 * 8)
  assert.ok(n.every((v) => v >= 0 && v <= 1))
})
