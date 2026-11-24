import "../src/element/index.ts"
import type { CopiedDetail } from "../src/element/index.ts"
import { PALETTES } from "../src/core/palette.ts"
import { parseColor } from "../src/core/color.ts"

/* ---------------- state ---------------- */

const initial = () => ({
  label: "Email",
  value: "hello@example.com",
  mark: "JB·01 COPIER",
  theme: "light",
  // colours per palette, like the Framer panel; "" / -1 = the theme default
  light: { accent: "", body: "", tray: "", paper: "", ink: "", shadow: "", strength: -1 },
  dark: { accent: "", body: "", tray: "", paper: "", ink: "", shadow: "", strength: -1 },
  valueFont: "Device mono",
  valueWeight: 500,
  valueItalic: false,
  labelFont: "Device sans",
  labelWeight: 600,
  labelItalic: false,
  sound: true,
  haptics: true,
  copies: "stay",
  size: 420,
  stage: "white",
})
const S = initial()
type Key = keyof typeof S

const VALUE_FONTS: Record<string, string> = {
  "Device mono": "",
  "IBM Plex Mono": '"IBM Plex Mono", ui-monospace, monospace',
  "Geist Mono": '"Geist Mono", ui-monospace, monospace',
  "Space Mono": '"Space Mono", ui-monospace, monospace',
}
const LABEL_FONTS: Record<string, string> = {
  "Device sans": "",
  Geist: '"Geist", ui-sans-serif, system-ui, sans-serif',
  Inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
}
const COLOURS = ["accent", "body", "tray", "paper", "ink", "shadow"] as const
type Colour = (typeof COLOURS)[number]
/** The palette the preview shows, and the one the colour controls edit. */
const themeKey = (): "light" | "dark" => (S.theme === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : S.theme === "dark" ? "dark" : "light")
const paletteName = () => (themeKey() === "dark" ? "Dark" : "Light")
const hex = (c: string) => "#" + parseColor(c, [0, 0, 0]).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")

/* ---------------- panel schema ---------------- */

type Base = { k: Key | Colour | "strength"; label: string; hint?: string | (() => string) }
type Ctl = Base & (
  | { type: "text"; max?: number }
  | { type: "slider"; min: number; max: number; step?: number; unit: string; fallback?: () => number }
  | { type: "select"; options: () => string[] }
  | { type: "segment"; options: [string, string][] }
  | { type: "toggle" }
  | { type: "colour" }
)

const SCHEMA: [string, Ctl[]][] = [
  ["Content", [
    { k: "value", label: "Value", type: "text", max: 60, hint: "Typed on the slip and copied to the clipboard. Long values condense to fit." },
    { k: "label", label: "Label", type: "text", max: 24 },
    { k: "mark", label: "Lid text", type: "text", max: 24, hint: "Engraved on the lid. Leave empty to hide." },
  ]],
  ["Look", [
    { k: "theme", label: "Theme", type: "segment", options: [["light", "Light"], ["dark", "Dark"], ["auto", "Auto"]], hint: "Auto follows the visitor's device." },
    { k: "accent", label: "Accent", type: "colour", hint: () => `Start key, display and scan lamp. Editing the ${paletteName()} palette: switch Theme to edit the other.` },
    { k: "body", label: "Body", type: "colour" },
    { k: "tray", label: "Tray", type: "colour" },
    { k: "paper", label: "Paper", type: "colour" },
    { k: "ink", label: "Ink", type: "colour" },
    { k: "shadow", label: "Shadow", type: "colour" },
    { k: "strength", label: "Shadow strength", type: "slider", min: 0, max: 200, step: 5, unit: "%", fallback: () => PALETTES[themeKey()].strength },
  ]],
  ["Type", [
    { k: "valueFont", label: "Value font", type: "select", options: () => Object.keys(VALUE_FONTS) },
    { k: "valueWeight", label: "Value weight", type: "segment", options: [["400", "400"], ["500", "500"], ["700", "700"]] },
    { k: "valueItalic", label: "Value italic", type: "toggle" },
    { k: "labelFont", label: "Label font", type: "select", options: () => Object.keys(LABEL_FONTS), hint: "Device fonts download nothing." },
    { k: "labelWeight", label: "Label weight", type: "segment", options: [["500", "500"], ["600", "600"], ["700", "700"]] },
    { k: "labelItalic", label: "Label italic", type: "toggle" },
  ]],
  ["Behaviour", [
    { k: "sound", label: "Sound", type: "toggle" },
    { k: "haptics", label: "Haptics", type: "toggle", hint: "Small vibrations on phones that support it." },
    { k: "copies", label: "Copies", type: "segment", options: [["stay", "Stay"], ["clear", "Clear"]], hint: "Stay where they're dropped, or slide away after copying." },
  ]],
  ["Preview", [
    { k: "size", label: "Width", type: "slider", min: 260, max: 520, step: 10, unit: "px" },
    { k: "stage", label: "Background", type: "segment", options: [["white", "White"], ["graphite", "Graphite"]] },
  ]],
]

/* ---------------- build panel ---------------- */

const panel = document.getElementById("panel")!
const wOut = document.getElementById("stage-w")!
const frame = document.getElementById("frame")!
let copier = document.getElementById("copier") as HTMLElementTagNameMap["photo-copier"]
const refresh: (() => void)[] = []
let uid = 0

const isPal = (k: string): k is Colour | "strength" => (COLOURS as readonly string[]).includes(k) || k === "strength"
function get(k: string): unknown {
  if (isPal(k)) return S[themeKey()][k]
  return S[k as Key]
}
function set(k: string, v: unknown) {
  if (isPal(k)) (S[themeKey()] as Record<string, unknown>)[k] = v
  else if (k === "valueWeight" || k === "labelWeight") (S as Record<string, unknown>)[k] = Number(v)
  else (S as Record<string, unknown>)[k] = v
  refreshAll()
  apply()
}
function refreshAll() { refresh.forEach((f) => f()) }
function fillTrack(r: HTMLInputElement) {
  const p = ((+r.value - +r.min) / (+r.max - +r.min)) * 100
  r.style.setProperty("--p", `${Math.max(0, Math.min(100, p))}%`)
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

const head = document.createElement("div")
head.className = "panel-head"
head.innerHTML = `<span>Properties</span><span style="display:flex;gap:14px"><button type="button" class="reset" data-a="restart">Restart</button><button type="button" class="reset" data-a="reset">Reset all</button></span>`
head.querySelector('[data-a="reset"]')!.addEventListener("click", () => { Object.assign(S, initial()); refreshAll(); apply(); restart() })
head.querySelector('[data-a="restart"]')!.addEventListener("click", restart)
panel.appendChild(head)

for (const [title, ctls] of SCHEMA) {
  const sec = document.createElement("section")
  sec.className = "sec"
  sec.innerHTML = `<h2>${title}</h2>`
  for (const c of ctls) {
    const row = document.createElement("div")
    row.className = "row"
    const id = `c${++uid}`
    const lab = `<label for="${id}">${c.label}</label>`
    const k = c.k
    let update: () => void = () => {}

    if (c.type === "text") {
      row.innerHTML = `${lab}<div class="ctl"><div class="fx"><input id="${id}" type="text" maxlength="${c.max ?? 40}" spellcheck="false"></div></div>`
      const i = row.querySelector("input")!
      update = () => { if (document.activeElement !== i) i.value = String(get(k)) }
      i.addEventListener("input", () => set(k, i.value))
    } else if (c.type === "slider") {
      row.innerHTML = `${lab}<div class="ctl"><div class="sl"><input type="range" id="${id}" min="${c.min}" max="${c.max}" step="${c.step ?? 1}"><output></output></div></div>`
      const r = row.querySelector("input")!, out = row.querySelector("output")!
      update = () => {
        const v = (get(k) as number) < 0 && c.fallback ? c.fallback() : (get(k) as number)
        r.value = String(v)
        out.textContent = `${v}${c.unit === "%" ? "%" : ` ${c.unit}`}`
        fillTrack(r)
      }
      r.addEventListener("input", () => set(k, +r.value))
    } else if (c.type === "select") {
      row.innerHTML = `${lab}<div class="ctl"><select class="in" id="${id}">${c.options().map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></div>`
      const s = row.querySelector("select")!
      update = () => { s.value = String(get(k)) }
      s.addEventListener("change", () => set(k, s.value))
    } else if (c.type === "segment") {
      row.innerHTML = `<span class="lab">${c.label}</span><div class="ctl"><div class="seg" role="group" aria-label="${c.label}">${c.options.map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join("")}</div></div>`
      const bs = [...row.querySelectorAll("button")]
      update = () => bs.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(get(k)))))
      bs.forEach((b) => b.addEventListener("click", () => set(k, b.dataset.v)))
    } else if (c.type === "toggle") {
      row.innerHTML = `<span class="lab" id="${id}">${c.label}</span><div class="ctl"><button type="button" class="tog" role="switch" aria-labelledby="${id}"></button></div>`
      const b = row.querySelector("button")!
      update = () => b.setAttribute("aria-checked", String(!!get(k)))
      b.addEventListener("click", () => set(k, !get(k)))
    } else if (c.type === "colour") {
      row.innerHTML = `${lab}<div class="ctl"><div class="fx col"><span class="sw"><input type="color" aria-label="${c.label} colour"></span><input id="${id}" spellcheck="false" maxlength="7"><button type="button" class="x" aria-label="Back to the theme colour">×</button></div></div>`
      const [pick, hx] = row.querySelectorAll("input")
      const sw = row.querySelector<HTMLElement>(".sw")!, x = row.querySelector<HTMLButtonElement>(".x")!
      update = () => {
        const v = String(get(k))
        pick.value = v || hex(PALETTES[themeKey()][k as Colour])
        sw.style.background = pick.value
        hx.placeholder = "From theme"
        if (document.activeElement !== hx) hx.value = v.toUpperCase()
        x.hidden = !v
      }
      pick.addEventListener("input", () => set(k, pick.value))
      hx.addEventListener("input", () => { const v = hx.value.trim(); if (!v || /^#?[0-9a-f]{6}$/i.test(v)) set(k, (v && !v.startsWith("#") ? `#${v}` : v)) })
      x.addEventListener("click", () => set(k, ""))
    }

    if (c.hint) {
      const h = document.createElement("p")
      h.className = "hint"
      row.querySelector(".ctl")!.appendChild(h)
      const prev = update
      update = () => { prev(); const t = typeof c.hint === "function" ? c.hint() : c.hint!; h.textContent = t; h.hidden = !t }
    }
    refresh.push(update)
    sec.appendChild(row)
  }
  panel.appendChild(sec)
}

/* ---------------- apply to the component ---------------- */

function attrs(): [string, string][] {
  const a: [string, string][] = []
  if (S.value !== "hello@example.com") a.push(["value", S.value])
  if (S.label !== "Email") a.push(["label", S.label])
  if (S.mark !== "JB·01 COPIER") a.push(["mark", S.mark])
  if (S.theme !== "dark") a.push(["theme", S.theme])
  // a colour set the same in both palettes is one shared attribute; otherwise light-/dark- per palette
  for (const c of [...COLOURS, "strength"] as const) {
    const unset = (v: string | number) => v === "" || v === -1
    const l = S.light[c], d = S.dark[c]
    if (!unset(l) && l === d) a.push([c, String(l)])
    else {
      if (!unset(l)) a.push([`light-${c}`, String(l)])
      if (!unset(d)) a.push([`dark-${c}`, String(d)])
    }
  }
  if (VALUE_FONTS[S.valueFont]) a.push(["value-font", VALUE_FONTS[S.valueFont]])
  if (S.valueWeight !== 500) a.push(["value-weight", String(S.valueWeight)])
  if (S.valueItalic) a.push(["value-style", "italic"])
  if (LABEL_FONTS[S.labelFont]) a.push(["label-font", LABEL_FONTS[S.labelFont]])
  if (S.labelWeight !== 600) a.push(["label-weight", String(S.labelWeight)])
  if (S.labelItalic) a.push(["label-style", "italic"])
  if (!S.sound) a.push(["sound", "off"])
  if (!S.haptics) a.push(["haptics", "off"])
  if (S.copies !== "stay") a.push(["copies", S.copies])
  return a
}
const KNOWN = ["value", "label", "mark", "theme", ...[...COLOURS, "strength"].flatMap((c) => [c, `light-${c}`, `dark-${c}`]),
  "value-font", "value-weight", "value-style", "label-font", "label-weight", "label-style", "sound", "haptics", "copies"]

function apply() {
  const want = new Map(attrs())
  for (const k of KNOWN) {
    const v = want.get(k)
    if (v == null) { if (copier.hasAttribute(k)) copier.removeAttribute(k) }
    else if (copier.getAttribute(k) !== v) copier.setAttribute(k, v)
  }
  copier.style.width = `${S.size}px`
  wOut.textContent = `${S.size} px`
  frame.classList.toggle("graphite", S.stage === "graphite")
  renderCode()
}

/** A fresh machine: slip back on the desk, tray empty. */
function restart() {
  const next = document.createElement("photo-copier")
  next.id = "copier"
  copier.replaceWith(next)
  copier = next
  listen()
  apply()
}

/* ---------------- code + events ---------------- */

let tab: "html" | "react" = "html"
const codeEl = document.getElementById("code")!
const escHTML = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
const camel = (k: string) => k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())

function code(): string {
  const a = attrs()
  if (tab === "html") {
    const lines = a.map(([k, v]) => `  ${k}="${esc(v)}"`)
    return `<script src="copier.iife.js"></script>\n\n<photo-copier${lines.length ? "\n" + lines.join("\n") + "\n" : ""}></photo-copier>`
  }
  const p: string[] = []
  const per: Record<"light" | "dark", string[]> = { light: [], dark: [] }
  const val = (k: string, v: string) => (k.endsWith("strength") || k.endsWith("weight") ? v : JSON.stringify(v))
  for (const [k, v] of a) {
    const m = /^(light|dark)-(.+)$/.exec(k)
    if (m) per[m[1] as "light" | "dark"].push(`${m[2]}: ${val(m[2], v)}`)
    else if (k === "sound" || k === "haptics") p.push(`${k}={false}`)
    else if (k === "strength" || k.endsWith("weight")) p.push(`${camel(k)}={${v}}`)
    else if (k.endsWith("-style")) p.push(`${camel(k)}="italic"`)
    else p.push(`${camel(k)}=${JSON.stringify(v)}`)
  }
  for (const t of ["light", "dark"] as const) if (per[t].length) p.push(`${t}={{ ${per[t].join(", ")} }}`)
  p.push(`onCopied={({ value }) => console.log(value)}`)
  return `import { Copier } from "@justbuilt/copier/react"\n\n<Copier\n${p.map((x) => "  " + x).join("\n")}\n/>`
}
function renderCode() {
  codeEl.innerHTML = escHTML(code()).replace(/(&lt;\/?[\w-]+|\/?&gt;)/g, '<span class="a">$1</span>')
}
const tabs = [...document.querySelectorAll<HTMLButtonElement>("#code-tabs button")]
tabs.forEach((b) => b.addEventListener("click", () => {
  tab = b.dataset.tab as typeof tab
  tabs.forEach((x) => x.setAttribute("aria-selected", String(x === b)))
  renderCode()
}))
const copyBtn = document.getElementById("copy")!
copyBtn.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(code()); copyBtn.textContent = "Copied" }
  catch {
    const r = document.createRange(); r.selectNodeContents(codeEl)
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r)
    copyBtn.textContent = "Selected"
  }
  copyBtn.classList.add("done")
  setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.classList.remove("done") }, 1600)
})

const evList = document.getElementById("events")!
function logEvent(type: string, text: string) {
  evList.querySelector(".empty")?.remove()
  const li = document.createElement("li")
  li.innerHTML = `<b>${type}</b><span>${escHTML(text)}</span>`
  evList.prepend(li)
  while (evList.children.length > 20) evList.lastElementChild!.remove()
}
function listen() {
  copier.addEventListener("copied", (e) => logEvent("copied", (e as CustomEvent<CopiedDetail>).detail.value))
}

listen()
refreshAll()
apply()
