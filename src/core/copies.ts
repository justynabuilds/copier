// The copies: each one slides out into the tray, and taking one out (drag it off the tray, click it,
// or press Enter on it) copies the value. In the tray only the top copy comes out.

import { PH, PW } from "./layout.ts"
import type { Sfx } from "./sound.ts"
import { bleed, rng } from "./textures.ts"

type Page = { el: HTMLDivElement; x: number; y: number; r: number; out: boolean }
type PageDrag = { sx: number; sy: number; x0: number; y0: number; lx: number; vx: number; tilt: number; k: number; moved: boolean }

export type CopiesContext = {
  /** The machine element the copies live in; they slide out under the overhang. */
  machine: HTMLElement
  overhang: HTMLElement
  draw: (n: number, lidOpen: boolean) => HTMLCanvasElement
  value: string
  keepCopies: boolean
  sfx: Sfx
  wake: () => unknown
  later: (f: () => void, ms: number) => ReturnType<typeof setTimeout>
  on: <E extends Event>(el: EventTarget, ev: string, fn: (e: E) => void) => void
  reduced: () => boolean
  deskScale: () => number
  /** Puts the value on the clipboard and tells everyone. */
  copy: () => void
  /** Called once a new copy has landed in the tray. */
  landed: () => void
}

// the tray in page coordinates (a page sits at left 70, top 236 inside the machine)
const TRAY = { l: 38 - 70, r: 382 - 70, t: 226 - 236, b: 394 - 236 }

export function createCopies(c: CopiesContext) {
  const pages: Page[] = []
  let made = 0
  const pageT = (p: Page, extra = "") => `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg) ${extra}`
  const inTray = (p: Page) => {
    const cx = p.x + PW / 2, cy = p.y + PH / 2
    return cx > TRAY.l && cx < TRAY.r && cy > TRAY.t && cy < TRAY.b + 20
  }

  /** Print a copy into the tray. `lidOpen` decides the toner border; `animate` slides it out of the machine. */
  function eject(lidOpen: boolean, animate: boolean) {
    made++
    const n = made, el = document.createElement("div")
    el.className = "cp-page"
    const canvas = bleed(c.draw(n, lidOpen), PW, PH)
    canvas.setAttribute("aria-hidden", "true")
    el.appendChild(canvas)
    el.setAttribute("role", "button")
    el.tabIndex = 0
    el.setAttribute("aria-label", `Copy ${c.value} to the clipboard`)
    const inTrayCount = pages.filter((p) => !p.out).length
    const R = rng(n * 91), rot = (R() - 0.5) * 4, dx = (R() - 0.5) * 12, dy = Math.min(inTrayCount, 4) * 2.4
    const p: Page = { el, x: dx, y: dy, r: rot, out: false }
    pages.push(p)
    c.machine.insertBefore(el, c.overhang)
    bind(p)
    el.style.transform = pageT(p)
    const T = animate && !c.reduced() ? 820 : 0
    if (T) {
      c.sfx.feed()
      el.animate(
        [
          { transform: "translate(0px, -112px) rotate(0deg)" },
          { transform: `translate(${dx * 0.7}px, ${dy + 5}px) rotate(${rot * 0.5}deg)`, offset: 0.64, easing: "cubic-bezier(.25,.6,.3,1)" },
          { transform: pageT(p) },
        ],
        { duration: T, easing: "cubic-bezier(.25,.7,.3,1)" }
      )
    }
    c.later(c.landed, T)
  }

  /** With copies="clear", a copy that has done its job slides away. */
  function retire(p: Page) {
    if (c.keepCopies) return
    c.later(() => {
      p.el.animate([{ transform: pageT(p), opacity: 1 }, { transform: pageT(p, "translateY(24px)"), opacity: 0 }], { duration: c.reduced() ? 1 : 420, easing: "ease-in", fill: "forwards" })
      c.later(() => {
        p.el.remove()
        pages.splice(pages.indexOf(p), 1)
      }, c.reduced() ? 10 : 440)
    }, 1600)
  }

  function bind(p: Page) {
    const el = p.el
    let s: PageDrag | null = null
    c.on(el, "pointerdown", (e: PointerEvent) => {
      if (!p.out && pages.filter((x) => !x.out).slice(-1)[0] !== p) return // in the tray only the top copy comes out
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      c.wake()
      el.getAnimations().forEach((a) => a.cancel())
      s = { sx: e.clientX, sy: e.clientY, x0: p.x, y0: p.y, lx: e.clientX, vx: 0, tilt: 0, k: c.deskScale(), moved: false }
    })
    c.on(el, "pointermove", (e: PointerEvent) => {
      if (!s) return
      const dx = (e.clientX - s.sx) / s.k, dy = (e.clientY - s.sy) / s.k
      if (!s.moved && Math.hypot(dx, dy) > 4) {
        s.moved = true
        el.classList.add("cp-held")
        c.sfx.paper()
      }
      if (!s.moved) return
      // the sheet tilts with the speed of the drag, like paper held at one corner
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
        // a click copies without moving the sheet
        c.copy()
        el.animate([{ transform: pageT(p) }, { transform: pageT(p, "translateY(-2px) scale(1.012)") }, { transform: pageT(p) }], { duration: 260, easing: "ease-out" })
        return
      }
      c.sfx.settle()
      const from = el.style.transform
      if (!p.out && !inTray(p)) {
        // pulled out of the tray: it stays on the desk, and the value is copied
        p.out = true
        el.classList.add("cp-out")
        p.r += st.tilt * 0.4
        c.copy()
        retire(p)
      } else if (!p.out) {
        // dropped back inside the tray: it slides home
        p.x = st.x0
        p.y = st.y0
      }
      el.style.transform = pageT(p)
      el.animate([{ transform: from }, { transform: pageT(p) }], { duration: 480, easing: "cubic-bezier(.22,1,.36,1)" })
    }
    c.on(el, "pointerup", up)
    c.on(el, "pointercancel", up)
    c.on(el, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        c.copy()
      }
    })
  }

  return { eject }
}
