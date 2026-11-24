import { css } from "../core/color.ts"
import { fontSpecs } from "../core/fonts.ts"
import { fitDesk } from "../core/layout.ts"
import { mount } from "../core/machine.ts"
import { COLOUR_KEYS, cssVars, paletteFor, resolve, type Theme } from "../core/palette.ts"
import { markup, styles } from "../core/styles.ts"

export interface CopiedDetail {
  value: string
}

const DEFAULTS = { label: "Email", value: "hello@example.com", mark: "JB·01 COPIER" }

/**
 * <photo-copier value="hello@example.com"></photo-copier>
 *
 * A copy-to-clipboard button as a desktop photocopier. Put the slip on the glass (drag or click it),
 * the lamp scans it, a toner copy slides into the tray, and taking the copy out copies the value.
 */
export class PhotoCopierElement extends HTMLElement {
  static observedAttributes = [
    "label", "value", "mark", "theme",
    ...COLOUR_KEYS.flatMap((k) => [k, `light-${k}`, `dark-${k}`]),
    "value-font", "value-weight", "value-style", "label-font", "label-weight", "label-style",
    "sound", "haptics", "copies", "still",
  ]

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
  private attr = (name: string) => this.getAttribute(name)

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
    const pal = resolve(paletteFor(this.theme, this.attr))
    const fonts = fontSpecs(this.attr)
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
