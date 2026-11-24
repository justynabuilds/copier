// The machine: wires the parts together and runs the sequence.
//   slip on the desk -> lid lifts -> slip flips face down onto the glass -> lamp scans ->
//   a copy slides into the tray -> lid closes -> taking the copy out copies the value.
// It works on plain DOM inside the element's shadow root and returns a cleanup function.
// Everything is drawn once into canvases and moved with CSS and the Web Animations API,
// so nothing re-renders while it plays.

import type { RGB } from "./color.ts"
import { createCopies } from "./copies.ts"
import { createDisplay } from "./display.ts"
import { GH, GW, SH, SW, W } from "./layout.ts"
import type { FontSpec } from "./fonts.ts"
import { createSheets } from "./sheets.ts"
import { createSound } from "./sound.ts"
import { bleed, foamURL, into, noiseURL, sized } from "./textures.ts"

export type { FontSpec }

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

// desk geometry: where the machine starts, where the slip rests, where it lands on the glass
const MY = 146
const REST = { x: 85, y: 22, r: -1.6 }
const GLASS_SPOT = { x: 35, y: MY + 40 }
const LAMP0 = 5, LAMP1 = 5 + GW + 20

export function mount(desk: HTMLElement, o: MountOptions) {
  const q = (s: string) => desk.querySelector(s) as HTMLElement
  const machine = q(".cp-machine"), carriage = q(".cp-carriage"), beam = q(".cp-beam"), beamIn = q(".cp-beam-in")
  const orig = q(".cp-original") as HTMLButtonElement, startBtn = q(".cp-start"), live = q(".cp-sr")
  const leaks = Array.from(desk.querySelectorAll(".cp-leak")) as HTMLElement[]
  const reduce = o.reduced

  // ── timers and listeners, all cleaned up together
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

  // ── the parts
  const sound = createSound({ enabled: o.sound, haptics: o.haptics, later })
  const { sfx, wake } = sound
  const display = createDisplay(q(".cp-matrix") as HTMLCanvasElement, { accent: o.accent, reduced: reduce })
  const show = display.show
  const sheets = createSheets(o)
  const deskScale = () => desk.getBoundingClientRect().width / W || 1
  let lidOpen = false, loaded = false, busy = false

  const copies = createCopies({
    machine,
    overhang: q(".cp-overhang"),
    draw: sheets.copy,
    value: o.value,
    keepCopies: o.keepCopies,
    sfx,
    wake,
    later,
    on,
    reduced: reduce,
    deskScale,
    copy: copyToClipboard,
    landed: () => {
      busy = false
      machine.classList.add("cp-ready")
      show("TAKE COPY")
    },
  })

  // ── lid and lamp
  function setLid(open: boolean, quiet = false) {
    if (open === lidOpen) return
    lidOpen = open
    machine.classList.toggle("cp-open", open)
    machine.classList.toggle("cp-shut", !open)
    if (!quiet) open ? sfx.lidUp() : sfx.lidDown()
  }
  function sweep(from: number, to: number, duration: number, easing: string) {
    const op: KeyframeAnimationOptions = { duration, easing, fill: "forwards" }
    const k = (x: number) => `translateX(${x}px)`
    carriage.animate([{ transform: k(from - 25) }, { transform: k(to - 25) }], op)
    beam.animate([{ transform: k(from - 85) }, { transform: k(to - 85) }], op)
    beamIn.animate([{ transform: k(85 - from) }, { transform: k(85 - to) }], op)
    // with the lid down, light only escapes along its edges
    for (const l of leaks) l.animate([{ transform: k(18 + from - 35) }, { transform: k(18 + to - 35) }], op)
  }

  // ── the original: the sheet travels to the corner of the glass and turns face down on the way
  const place = (x: number, y: number, r: number, extra = "") => `translate(${x}px, ${y}px) rotate(${r}deg) ${extra}`
  const overGlass = (x: number, y: number) => {
    const cx = x + SW / 2, cy = y + SH / 2
    return cx > 18 && cx < 402 && cy > MY + 10 && cy < MY + 190
  }
  orig.setAttribute("aria-label", `Put the ${o.label.toLowerCase()} in the copier`)

  function load(x: number, y: number, r: number, s = 1) {
    drain()
    busy = true
    wake()
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

  // ── one copy: key press, lamp sweep, copy out, lid down
  function run(closeAfter: boolean) {
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
        copies.eject(open, true)
        if (closeAfter) later(() => setLid(false), reduce() ? 0 : 900)
      }, scanT)
    }, 170)
  }

  // ── clipboard
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

  // ── build: what's visible at rest now; everything hidden in idle moments, one piece per tick
  desk.style.setProperty("--cp-grain", `url(${noiseURL(128, 70, 3)})`)
  desk.style.setProperty("--cp-foam", `url(${foamURL()})`)
  q(".cp-mark").textContent = o.mark
  q(".cp-face").appendChild(bleed(sheets.front(), SW, SH))
  sheets.rulers(q(".cp-scale") as HTMLCanvasElement)
  const queue: (() => void)[] = [
    () => {
      const back = sheets.back()
      q(".cp-back").appendChild(bleed(back, SW, SH))
      q(".cp-slip").appendChild(sized(back, SW, SH))
    },
    () => into(q(".cp-lit-slip") as HTMLCanvasElement, sheets.lit(), SW, SH),
    () => into(q(".cp-dust") as HTMLCanvasElement, sheets.dust(false), GW, GH),
    () => into(q(".cp-lit-dust") as HTMLCanvasElement, sheets.dust(true), GW, GH),
    () => sheets.copyBase(),
    () => sheets.tonerField(),
  ]
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
  /** Finish building right away (before the first interaction needs the hidden textures). */
  const drain = () => {
    while (queue.length) queue.shift()!()
  }
  idleId = idle(pump)
  carriage.style.transform = `translateX(${LAMP0 - 25}px)`
  orig.style.transform = place(REST.x, REST.y, REST.r)

  const stopAll = () => {
    cleanups.forEach((f) => f())
    timers.forEach(clearTimeout)
    display.stop()
    cancelIdle(idleId)
  }

  // ── still mode: a believable frozen state for thumbnails and previews
  if (!o.live) {
    drain()
    if (o.canvasState === "tray") {
      loaded = true
      machine.classList.add("cp-loaded")
      orig.classList.add("cp-inside")
      copies.eject(true, false)
      show("TAKE COPY")
    } else show("READY") // a still frame can't show the scrolling hint
    return stopAll
  }

  // ── live
  show("PLACE ORIGINAL")
  cleanups.push(display.watch(desk))

  // drag the slip (or click it) onto the glass
  type SlipDrag = { sx: number; sy: number; x: number; y: number; k: number; moved: boolean }
  let og: SlipDrag | null = null
  on(orig, "pointerdown", (e: PointerEvent) => {
    if (loaded || busy) return
    e.preventDefault()
    orig.setPointerCapture(e.pointerId)
    wake()
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
    // dropped off the glass: back to its spot on the desk
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
    wake()
    if (busy) return
    if (!loaded) return load(REST.x, REST.y, REST.r) // the sheet is still on the desk: feed it in, then copy
    // lift the lid for every copy so they all print the same, and the scan stays visible
    busy = true
    setLid(true)
    later(() => run(true), reduce() ? 0 : 520)
  })

  return () => {
    stopAll()
    sound.close()
  }
}
