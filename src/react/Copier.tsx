import { useEffect, useRef, type CSSProperties } from "react"
import "../element/index.ts"
import type { CopiedDetail, PhotoCopierElement } from "../element/index.ts"

export interface CopierProps {
  /** Typed on the slip and copied to the clipboard. */
  value?: string
  /** Small printed label above the value. Default "Email". */
  label?: string
  /** Engraved on the lid. Empty hides it. */
  mark?: string
  theme?: "dark" | "light" | "auto"
  accent?: string
  body?: string
  tray?: string
  paper?: string
  ink?: string
  shadow?: string
  /** Shadow strength in %, 0 to 200. */
  strength?: number
  valueFont?: string
  labelFont?: string
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
  return (
    <photo-copier
      ref={ref}
      class={props.className}
      style={props.style}
      value={props.value}
      label={props.label}
      mark={props.mark}
      theme={props.theme}
      accent={props.accent}
      body={props.body}
      tray={props.tray}
      paper={props.paper}
      ink={props.ink}
      shadow={props.shadow}
      strength={props.strength}
      value-font={props.valueFont}
      label-font={props.labelFont}
      sound={flag(props.sound)}
      haptics={flag(props.haptics)}
      copies={props.copies}
      still={props.still}
    />
  )
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "photo-copier": {
        ref?: React.Ref<PhotoCopierElement>
        class?: string
        style?: React.CSSProperties
        value?: string
        label?: string
        mark?: string
        theme?: string
        accent?: string
        body?: string
        tray?: string
        paper?: string
        ink?: string
        shadow?: string
        strength?: number
        "value-font"?: string
        "label-font"?: string
        sound?: string
        haptics?: string
        copies?: string
        still?: string
      }
    }
  }
}
