// Interaction self-test in a real browser, in real time. Open /demo/selftest.html; results print on the page.
import "../src/element/index.ts"
import type { CopiedDetail } from "../src/element/index.ts"

const live = document.getElementById("live") as HTMLElementTagNameMap["photo-copier"]
const still = document.getElementById("still") as HTMLElementTagNameMap["photo-copier"]
const $ = (el: HTMLElement, s: string) => el.shadowRoot!.querySelector<HTMLElement>(s)
const $$ = (el: HTMLElement, s: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(s)]
const out = document.getElementById("out")!
const results: string[] = []
let failed = 0
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const until = async (cond: () => boolean, ms = 6000) => { const end = performance.now() + ms; while (!cond() && performance.now() < end) await wait(50); return cond() }
const ready = (el: HTMLElement) => new Promise<void>((r) => el.addEventListener("ready", () => r(), { once: true }))
function check(name: string, ok: boolean, info = "") {
  if (!ok) failed++
  results.push(`${ok ? "pass" : "FAIL"}  ${name}${info ? `  (${info})` : ""}`)
}
const key = (el: HTMLElement, k: string) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }))
}

async function run() {
  await until(() => !!$(live, ".cp-machine") && !!$(still, ".cp-page"), 6000)
  check("renders the machine and its front texture at once", $$(live, "canvas").length >= 6, `${$$(live, "canvas").length} canvases`)
  check("hidden textures finish building in idle time", await until(() => $$(live, "canvas").length >= 8, 4000), `${$$(live, "canvas").length} canvases`)
  check("the accent reaches the styles", $(live, ".cp-desk")!.style.getPropertyValue("--cp-a") === "rgba(226,72,31,1)")
  check("light theme uses the light body", $(live, ".cp-desk")!.style.getPropertyValue("--cp-b") === "rgba(231,229,224,1)")

  // still mode: a believable frozen state, scaled into a smaller box
  check("still=tray shows a copy in the tray with the slip inside", $$(still, ".cp-page").length === 1 && $(still, ".cp-original")!.classList.contains("cp-inside"))
  const k = parseFloat(/scale\(([\d.]+)\)/.exec($(still, ".cp-desk")!.style.transform)?.[1] ?? "0")
  check("the 420x640 desk scales to fit a 210px box", Math.abs(k - 0.5) < 0.01, `scale ${k}`)

  // keyboard: Enter on the slip feeds it, scans and prints a copy
  const copied: string[] = []
  live.addEventListener("copied", (e) => copied.push((e as CustomEvent<CopiedDetail>).detail.value))
  const orig = $(live, ".cp-original") as HTMLButtonElement
  orig.focus()
  orig.click() // a keyboard press arrives as a click with detail 0
  check("the lid lifts as the slip goes in", await until(() => $(live, ".cp-machine")!.classList.contains("cp-open"), 1000))
  check("a copy lands in the tray", await until(() => $$(live, ".cp-page").length === 1, 6000))
  check("the lid closes again after the copy", await until(() => $(live, ".cp-machine")!.classList.contains("cp-shut"), 3000))
  check("the machine is ready again", await until(() => $(live, ".cp-machine")!.classList.contains("cp-ready"), 2000))

  const page = $$(live, ".cp-page")[0]
  check("the copy is a keyboard button with a clear label", page.getAttribute("role") === "button" && page.tabIndex === 0 && /test@example\.com/.test(page.getAttribute("aria-label") || ""))
  key(page, "Enter")
  await wait(100)
  check("Enter on the copy fires copied with the value", copied[0] === "test@example.com", copied.join(", "))
  check("screen readers hear that it was copied", /Copied test@example\.com/.test($(live, ".cp-sr")!.textContent || ""))

  // Start makes another copy
  ;($(live, ".cp-start") as HTMLButtonElement).click()
  check("Start prints another copy", await until(() => $$(live, ".cp-page").length === 2, 7000))

  // changing what's printed rebuilds a fresh machine
  const rebuilt = ready(live)
  live.setAttribute("value", "new@example.com")
  await Promise.race([rebuilt, wait(4000)])
  await wait(100)
  check("a new value rebuilds a fresh machine (empty tray)", $$(live, ".cp-page").length === 0 && !$(live, ".cp-original")!.classList.contains("cp-inside"))
  check("the slip label names the new value", /email/i.test($(live, ".cp-original")!.getAttribute("aria-label") || ""))

  // colour-only changes don't rebuild
  const before = $(live, ".cp-machine")
  live.setAttribute("body", "#203040")
  await wait(150)
  check("changing the body colour restyles without a rebuild", $(live, ".cp-machine") === before && $(live, ".cp-desk")!.style.getPropertyValue("--cp-b") === "rgba(32,48,64,1)")

  // per-theme colours: a dark-only accent waits until the theme is dark
  live.setAttribute("dark-accent", "#3d6bff")
  await wait(150)
  check("dark-accent leaves the light theme alone", $(live, ".cp-desk")!.style.getPropertyValue("--cp-a") === "rgba(226,72,31,1)")
  const darkReady = ready(live)
  live.setAttribute("theme", "dark")
  await Promise.race([darkReady, wait(4000)])
  check("switching to dark applies the dark accent", $(live, ".cp-desk")!.style.getPropertyValue("--cp-a") === "rgba(61,107,255,1)")

  // font weight is printed into the textures, so it rebuilds the machine
  const machineBefore = $(live, ".cp-machine")
  const weightReady = ready(live)
  live.setAttribute("value-weight", "700")
  const rebuiltForWeight = await Promise.race([weightReady.then(() => true), wait(4000).then(() => false)])
  check("a new value weight rebuilds the machine", rebuiltForWeight && $(live, ".cp-machine") !== machineBefore)

  out.textContent = `${results.join("\n")}\n\n${failed ? `${failed} failed` : `all ${results.length} passed`}`
  document.body.dataset.done = failed ? "fail" : "pass"
}
run()
