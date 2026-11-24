// Font settings for the typed value and the printed label. No DOM, so it is unit-tested.

export type FontSpec = { family: string; weight: number | string; style: string }

// Fonts already on the device. Nothing is downloaded: load your own font on the page and name it here.
export const MONO_FALLBACK = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
export const SANS_FALLBACK = '"Geist", "Inter", ui-sans-serif, system-ui, sans-serif'

const weight = (v: string | null, fallback: number) => {
  const n = parseInt(v ?? "", 10)
  return Number.isFinite(n) && n >= 100 && n <= 900 ? n : fallback
}
const style = (v: string | null) => (v && v.trim().toLowerCase() === "italic" ? "italic" : "normal")

/** Value font (default device mono, 500) and label font (default device sans, 600) from attributes. */
export function fontSpecs(attr: (name: string) => string | null): { value: FontSpec; label: FontSpec } {
  return {
    value: { family: attr("value-font") || MONO_FALLBACK, weight: weight(attr("value-weight"), 500), style: style(attr("value-style")) },
    label: { family: attr("label-font") || SANS_FALLBACK, weight: weight(attr("label-weight"), 600), style: style(attr("label-style")) },
  }
}
