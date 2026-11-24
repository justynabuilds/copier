// Fixed design sizes and the small sums that size things. No DOM, so it is unit-tested.

/** The copier is drawn at 420x640 and scaled to whatever box it sits in. */
export const W = 420
export const H = 640
/** Texture resolution per CSS px, so canvases stay sharp on 3x screens. */
export const TS = 3

// sheet sizes: the original slip, a copy, where the slip sits on a copy, and the glass
export const SW = 250, SH = 92, PW = 280, PH = 108, OX = 15, OY = 8, GW = 374, GH = 136

/** Scale and offset that fit the 420x640 desk inside a box, centred, without distortion. */
export function fitDesk(boxW: number, boxH: number) {
  const w = boxW || W, h = boxH || H
  const k = Math.min(w / W, h / H)
  return { k, x: (w - W * k) / 2, y: (h - H * k) / 2 }
}

/**
 * Size for the typed value: as large as fits the slip (max 19px), never below 12px.
 * Below that it condenses horizontally instead, so long addresses stay readable.
 * `width100` is the value's measured width at 100px in the chosen font.
 */
export function fitValue(width100: number) {
  const room = SW - 40
  const size = Math.max(12, Math.min(19, (room * 100) / (width100 || 1)))
  const condense = Math.min(1, room / (((width100 || 1) * size) / 100))
  return { size, condense }
}
