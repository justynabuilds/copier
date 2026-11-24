// The default palettes, and the CSS variables the machine's styles read. No DOM, so it is unit-tested.

import { css, lum, parseColor, type RGB } from "./color.ts"

export type Theme = "light" | "dark" | "auto"

export type Palette = {
  body: string
  tray: string
  accent: string
  paper: string
  ink: string
  shadow: string
  /** Shadow strength in %, 0 to 200. */
  strength: number
}

export const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    body: "rgb(231, 229, 224)",
    tray: "rgb(231, 229, 224)",
    accent: "rgb(226, 72, 31)",
    paper: "rgb(244, 242, 236)",
    ink: "rgb(35, 35, 39)",
    shadow: "rgb(36, 30, 22)",
    strength: 70,
  },
  dark: {
    body: "rgb(44, 44, 46)",
    tray: "rgb(44, 44, 46)",
    accent: "rgb(226, 72, 31)",
    paper: "rgb(244, 242, 236)",
    ink: "rgb(35, 35, 39)",
    shadow: "rgb(0, 0, 0)",
    strength: 100,
  },
}

export const COLOUR_KEYS = ["body", "tray", "accent", "paper", "ink", "shadow", "strength"] as const

/**
 * The palette for one theme, read from attributes. Like the two palettes in the Framer panel:
 * `light-accent` / `dark-accent` set a colour for one theme only, `accent` sets it for both,
 * and anything left unset comes from the theme's default.
 */
export function paletteFor(theme: "light" | "dark", attr: (name: string) => string | null): Palette {
  const p: Palette = { ...PALETTES[theme] }
  for (const k of COLOUR_KEYS) {
    const v = [attr(`${theme}-${k}`), attr(k)].find((x) => x !== null && x.trim() !== "")
    if (v === undefined || v === null) continue
    if (k === "strength") {
      const n = parseFloat(v)
      if (Number.isFinite(n)) p.strength = n
    } else p[k] = v
  }
  return p
}

export type Resolved = { body: RGB; tray: RGB; accent: RGB; paper: RGB; ink: RGB; shadow: RGB; strength: number }

/** Parses a palette into numbers; the tray falls back to the body colour. */
export function resolve(p: Palette): Resolved {
  const body = parseColor(p.body, [44, 44, 46])
  return {
    body,
    tray: parseColor(p.tray, body),
    accent: parseColor(p.accent, [226, 72, 31]),
    paper: parseColor(p.paper, [244, 242, 236]),
    ink: parseColor(p.ink, [35, 35, 39]),
    shadow: parseColor(p.shadow, [0, 0, 0]),
    strength: Math.max(0, Math.min(2, (Number.isFinite(p.strength) ? p.strength : 100) / 100)),
  }
}

/** Every --cp-* variable the styles use, derived from the palette. */
export function cssVars(r: Resolved, valueFontFamily: string): Record<string, string> {
  const { shadow, strength: s } = r
  const lightBody = lum(r.body) > 0.5
  // shade inside the tray softens as the tray gets lighter, so a white tray doesn't get a black band
  const tk = 1 - 0.62 * Math.max(0, Math.min(1, (lum(r.tray) - 0.25) / 0.6))
  return {
    "--cp-b": css(r.body),
    "--cp-t": css(r.tray),
    "--cp-wi1": css(shadow, 0.5 * tk),
    "--cp-wi2": css(shadow, 0.24 * tk),
    "--cp-oh1": css(shadow, 0.6 * tk),
    "--cp-oh2": css(shadow, 0.26 * tk),
    "--cp-oh3": css(shadow, 0.07 * tk),
    "--cp-a": css(r.accent),
    "--cp-s1": css(shadow, 0.45 * s),
    "--cp-s2": css(shadow, 0.3 * s),
    "--cp-s3": css(shadow, 0.5 * s),
    "--cp-ps": `0 0.5px 1px ${css(shadow, 0.16 * s)}, 0 2px 5px -1px ${css(shadow, 0.12 * s)}, 0 14px 28px -12px ${css(shadow, 0.25 * s)}`,
    "--cp-ps-lift": `0 2px 4px ${css(shadow, 0.1 * s)}, 0 18px 30px -12px ${css(shadow, 0.3 * s)}, 0 44px 60px -26px ${css(shadow, 0.36 * s)}`,
    "--cp-eng": lightBody ? "rgba(0,0,0,0.36)" : "rgba(255,255,255,0.28)",
    "--cp-engs": lightBody ? "0 0.5px 0 rgba(255,255,255,0.7)" : "0 -0.5px 0 rgba(0,0,0,0.6)",
    "--cp-vf": valueFontFamily,
  }
}
