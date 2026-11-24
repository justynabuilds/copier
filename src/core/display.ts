// The orange dot-matrix display behind black glass. Long messages scroll, COPYING blinks.
// It only animates while the copier is on screen and the tab is visible.

import { css, mix, WHITE, type RGB } from "./color.ts"
import { TS } from "./layout.ts"
import { MX, matrixColumns } from "./matrix.ts"
import { sized } from "./textures.ts"

type Msg = { cols: boolean[][]; scroll: boolean; t0: number; blink: boolean }

export function createDisplay(matrix: HTMLCanvasElement, o: { accent: RGB; reduced: () => boolean }) {
  const accentHi = mix(o.accent, WHITE, 0.3)
  matrix.width = MX.w * TS
  matrix.height = MX.h * TS
  sized(matrix, MX.w, MX.h)
  let msg: Msg = { cols: [], scroll: false, t0: 0, blink: false }, raf = 0, onScreen = true

  function show(text: string, opt: { blink?: boolean } = {}) {
    const cols = matrixColumns(text)
    msg = { cols, scroll: cols.length > MX.cols, t0: performance.now(), blink: !!opt.blink && !o.reduced() }
    if (!raf) raf = requestAnimationFrame(draw)
  }

  function draw(now: number) {
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
    raf = onScreen && ((msg.scroll && !o.reduced()) || msg.blink) ? requestAnimationFrame(draw) : 0
  }

  /** Pause the marquee while `el` is off screen or the tab is hidden. Returns a cleanup. */
  function watch(el: Element) {
    let inView = true
    const wake = () => {
      onScreen = inView && !document.hidden
      if (onScreen && !raf) raf = requestAnimationFrame(draw)
    }
    const io = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? true
      wake()
    })
    io.observe(el)
    document.addEventListener("visibilitychange", wake)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", wake)
    }
  }

  const stop = () => cancelAnimationFrame(raf)

  return { show, watch, stop }
}
