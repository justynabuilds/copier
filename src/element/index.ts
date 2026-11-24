import { PhotoCopierElement } from "./copier-element.ts"

export { PhotoCopierElement }
export type { CopiedDetail } from "./copier-element.ts"

if (!customElements.get("photo-copier")) customElements.define("photo-copier", PhotoCopierElement)

declare global {
  interface HTMLElementTagNameMap {
    "photo-copier": PhotoCopierElement
  }
}
