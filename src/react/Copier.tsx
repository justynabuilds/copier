import { useEffect, useRef, type CSSProperties } from "react"
import "../element/index.ts"
import type { CopiedDetail, PhotoCopierElement } from "../element/index.ts"

export type CopierColours = {
  accent?: string
  body?: string
  tray?: string
  paper?: string
  ink?: string
  shadow?: string
  /** Shadow strength in %, 0 to 200. */
  strength?: number
}

export interface CopierProps extends CopierColours {
  /** Typed on the slip and copied to the clipboard. */
  value?: string
  /** Small printed label above the value. Default "Email". */
  label?: string
  /** Engraved on the lid. Empty hides it. */
  mark?: string
  theme?: "dark" | "light" | "auto"
  /** Colours for the light theme only; they win over the shared colour props. */
  light?: CopierColours
  /** Colours for the dark theme only; they win over the shared colour props. */
  dark?: CopierColours
  valueFont?: string
  valueWeight?: number
  valueStyle?: "normal" | "italic"
  labelFont?: string
  labelWeight?: number
  labelStyle?: "normal" | "italic"
  sound?: boolean
  haptics?: boolean
  /** "stay": copies stay where they're dropped. "clear": they slide away after copying. */
  copies?: "stay" | "clear"
  /** Render a still, non-interactive state (for thumbnails). */
  still?: "rest" | "tray"
  onCopied?: (detail: CopiedDetail) => void
  className?: string
  style?: CSSProperties
}

const COLOUR_KEYS = ["accent", "body", "tray", "paper", "ink", "shadow", "strength"] as const

export function Copier(props: CopierProps) {
  const ref = useRef<PhotoCopierElement>(null)
  const handler = useRef(props.onCopied)
  handler.current = props.onCopied

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const on = (e: Event) => handler.current?.((e as CustomEvent<CopiedDetail>).detail)
    el.addEventListener("copied", on)
    return () => el.removeEventListener("copied", on)
  }, [])

  const flag = (v: boolean | undefined) => (v === undefined ? undefined : v ? "on" : "off")
  const colours: Record<string, string | number | undefined> = {}
  for (const k of COLOUR_KEYS) {
    colours[k] = props[k]
    colours[`light-${k}`] = props.light?.[k]
    colours[`dark-${k}`] = props.dark?.[k]
  }
  return (
    <photo-copier
      ref={ref}
      class={props.className}
      style={props.style}
      value={props.value}
      label={props.label}
      mark={props.mark}
      theme={props.theme}
      {...colours}
      value-font={props.valueFont}
      value-weight={props.valueWeight}
      value-style={props.valueStyle}
      label-font={props.labelFont}
      label-weight={props.labelWeight}
      label-style={props.labelStyle}
      sound={flag(props.sound)}
      haptics={flag(props.haptics)}
      copies={props.copies}
      still={props.still}
    />
  )
}

type ColourAttr = (typeof COLOUR_KEYS)[number]
type ColourAttrs = { [K in ColourAttr | `light-${ColourAttr}` | `dark-${ColourAttr}`]?: string | number }

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "photo-copier": ColourAttrs & {
        ref?: React.Ref<PhotoCopierElement>
        class?: string
        style?: React.CSSProperties
        value?: string
        label?: string
        mark?: string
        theme?: string
        "value-font"?: string
        "value-weight"?: number
        "value-style"?: string
        "label-font"?: string
        "label-weight"?: number
        "label-style"?: string
        sound?: string
        haptics?: string
        copies?: string
        still?: string
      }
    }
  }
}
