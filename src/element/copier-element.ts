import { fitDesk } from "../core/layout.ts"
import { mount, type FontSpec } from "../core/machine.ts"
import { PALETTES, cssVars, resolve, type Palette, type Theme } from "../core/palette.ts"
import { css } from "../core/color.ts"
import { markup, styles } from "../core/styles.ts"

export interface CopiedDetail {
  value: string
}

// Fonts already on the device. Nothing is downloaded: set value-font / label-font to use your own.
const MONO_FALLBACK = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const SANS_FALLBACK = '"Geist", "Inter", ui-sans-serif, system-ui, sans-serif'

const DEFAULTS = { label: "Email", value: "hello@example.com", mark: "JB·01 COPIER" }
const COLOURS = ["body", "tray", "accent", "paper", "ink", "shadow", "strength"] as const

/**
 * <photo-copier value="hello@example.com"></photo-copier>
 *
 * A copy-to-clipboard button as a desktop photocopier. Put the slip on the glass (drag or click it),
 * the lamp scans it, a toner copy slides into the tray, and taking the copy out copies the value.
 */
export class PhotoCopierElement extends HTMLElement {
  static observedAttributes = ["label", "value", "mark", "theme", ...COLOURS, "value-font", "label-font", "sound", "haptics", "copies", "still"]

  private root: ShadowRoot
  private desk: HTMLDivElement
  private stop?: () => void
  private key = ""
  private pending = 0
  private generation = 0
  private ro = new ResizeObserver(() => this.fit())
  private dark = matchMedia("(prefers-color-scheme: dark)")
  private motion = matchMedia("(prefers-reduced-motion: reduce)")
  private onScheme = () => this.schedule()

  constructor() {
    super()
    this.root = this.attachShadow({ mode: "open" })
    this.root.innerHTML = `<style>${styles}</style><div class="cp-desk"></div>`
    this.desk = this.root.querySelector(".cp-desk")!
  }

  connectedCallback() {
    this.ro.observe(this)
    this.dark.addEventListener("change", this.onScheme)
    this.fit()
    this.schedule()
  }

  disconnectedCallback() {
    this.ro.disconnect()
    this.dark.removeEventListener("change", this.onScheme)
    cancelAnimationFrame(this.pending)
    this.pending = 0
    this.generation++
    this.stop?.()
    this.stop = undefined
    this.key = ""
  }

  attributeChangedCallback() {
    if (this.isConnected) this.schedule()
  }

  // ---------- reading attributes ----------

  private text(name: keyof typeof DEFAULTS) {
    return this.getAttribute(name) ?? DEFAULTS[name]
  }
  private on(name: string) {
    const v = this.getAttribute(name)
    return v === null || !["off", "false", "0", "no"].includes(v.trim().toLowerCase())
  }
  private get theme(): "light" | "dark" {
    const t = (this.getAttribute("theme") || "dark") as Theme
    return t === "auto" ? (this.dark.matches ? "dark" : "light") : t === "light" ? "light" : "dark"
  }
  private palette(): Palette {
    const p: Palette = { ...PALETTES[this.theme] }
    for (const k of COLOURS) {
      const v = this.getAttribute(k)
      if (v === null || v.trim() === "") continue
      if (k === "strength") p.strength = parseFloat(v)
      else p[k] = v
    }
    return p
  }
  private fonts(): { value: FontSpec; label: FontSpec } {
    return {
      value: { family: this.getAttribute("value-font") || MONO_FALLBACK, weight: 500, style: "normal" },
      label: { family: this.getAttribute("label-font") || SANS_FALLBACK, weight: 600, style: "normal" },
    }
  }

  // ---------- building ----------

  /** Coalesce attribute changes into one update per frame. */
  private schedule() {
    if (this.pending) return
    this.pending = requestAnimationFrame(() => {
      this.pending = 0
      this.update()
    })
  }

  private fit() {
    const { k, x, y } = fitDesk(this.clientWidth, this.clientHeight)
    this.desk.style.transform = `translate(${x}px, ${y}px) scale(${k})`
  }

  private update() {
    const pal = resolve(this.palette())
    const fonts = this.fonts()
    for (const [name, v] of Object.entries(cssVars(pal, fonts.value.family))) this.desk.style.setProperty(name, v)

    const still = this.getAttribute("still")
    const content = { label: this.text("label"), value: this.text("value"), mark: this.text("mark") }
    const keepCopies = (this.getAttribute("copies") || "stay") !== "clear"
    // only what is printed or drawn into textures needs a rebuild; body, tray and shadow are plain CSS
    const key = [content.label, content.value, content.mark, css(pal.accent), css(pal.paper), css(pal.ink), still ?? "live", keepCopies, JSON.stringify(fonts)].join("|")
    if (key === this.key) return
    this.key = key

    this.stop?.()
    this.stop = undefined
    const gen = ++this.generation
    const fontsReady = document.fonts
      ? Promise.all([
          document.fonts.load(`${fonts.value.style} ${fonts.value.weight} 19px ${fonts.value.family}`),
          document.fonts.load(`${fonts.label.style} ${fonts.label.weight} 9px ${fonts.label.family}`),
        ]).catch(() => undefined)
      : Promise.resolve()
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(() => {
      if (gen !== this.generation) return
      this.desk.innerHTML = markup
      this.stop = mount(this.desk, {
        ...content,
        accent: pal.accent,
        paper: pal.paper,
        ink: pal.ink,
        live: still === null,
        canvasState: still === "tray" ? "tray" : "rest",
        keepCopies,
        reduced: () => this.motion.matches,
        sound: () => this.on("sound"),
        haptics: () => this.on("haptics"),
        onCopy: () => this.dispatchEvent(new CustomEvent<CopiedDetail>("copied", { detail: { value: content.value }, bubbles: true, composed: true })),
        valueFont: fonts.value,
        labelFont: fonts.label,
      })
      this.dispatchEvent(new CustomEvent("ready", { bubbles: true, composed: true }))
    })
  }
}
