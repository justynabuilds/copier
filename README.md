# Copier

A copy-to-clipboard button as a desktop photocopier. The visitor puts the slip on the glass (drags it, or just clicks it), the lid lifts, the lamp scans it, a toner copy slides into the tray, and taking the copy out puts the value on the clipboard. Every copy is a little different: open-lid toner border, specks, a drum line, a hair off square.

It ships as a plain web component that works on any site (Webflow embed, WordPress, Squarespace, Shopify, plain HTML) and as a React component. Both run on the same framework-free engine and render inside a shadow root, so the host site's CSS can't break them.

**[Live demo](https://photo-copier.vercel.app)** · **[Playground](https://photo-copier.vercel.app/playground)** (every option in a panel, with copyable HTML and React code)

## Quick start

Any site, including a Framer or Webflow embed. The script is served from the live demo, so this works as pasted:

```html
<script src="https://photo-copier.vercel.app/copier.iife.js"></script>
<photo-copier value="hello@example.com" style="width: 100%; height: 100%"></photo-copier>
<script>
  document.querySelector("photo-copier").addEventListener("copied", (e) => console.log(e.detail.value))
</script>
```

React:

```tsx
import { Copier } from "@justbuilt/copier/react"

<Copier value="hello@example.com" theme="light" onCopied={({ value }) => track("copied", value)} />
```

The copier is drawn at 420 × 640 and scales to fit whatever box you give it, keeping its shape (420px wide by default). To host the script yourself, build it with `npm run build` (see [Development](#development)) and point the `src` at your copy; `copier.js` is the ES module version.

## Attributes

| Attribute | Default | |
| --- | --- | --- |
| `value` | `hello@example.com` | Typed on the slip and copied to the clipboard. Long values condense to fit. |
| `label` | `Email` | Small printed label above the value. |
| `mark` | `JB·01 COPIER` | Engraved on the lid. Empty hides it. |
| `theme` | `dark` | `dark`, `light` or `auto` (follows the visitor's device). |
| `accent` | `rgb(226, 72, 31)` | Start key, display and scan lamp. |
| `body`, `tray` | from the theme | Machine and tray colour. The tray falls back to the body. |
| `paper`, `ink` | from the theme | The slip and its type. |
| `shadow`, `strength` | from the theme | Shadow colour and strength in % (0 to 200). |
| `light-*`, `dark-*` | none | Any colour above for one theme only, for example `dark-accent` or `light-body`. They win over the shared colour, so with `theme="auto"` each mode can have its own palette. |
| `value-font`, `label-font` | device mono, device sans | Any CSS font family. Nothing is downloaded: load the font on your page. |
| `value-weight`, `label-weight` | `500`, `600` | Font weight, 100 to 900. |
| `value-style`, `label-style` | `normal` | `italic` for italic type. |
| `sound` | on | `off` mutes the lid, motor, paper and the copied beep. |
| `haptics` | on | `off` turns off the small vibrations on phones. |
| `copies` | `stay` | `stay`: copies stay where they're dropped. `clear`: they slide away after copying. |
| `still` | none | `rest` or `tray`: a frozen, non-interactive state for thumbnails and previews. |

React props use the same names in camelCase (`valueFont`, `labelWeight`), with `sound` and `haptics` as booleans and per-theme colours as objects: `light={{ accent: "#e2481f" }}`, `dark={{ accent: "#3d6bff" }}`.

## Events

| Event | `detail` | |
| --- | --- | --- |
| `copied` | `{ value }` | The value was put on the clipboard. |
| `ready` | none | The machine finished building (after the first render and after each rebuild). |

## Styling

Size it like an image: set `width`, `height` or both on the element. With both, the copier is centred inside the box without distortion. Colours are attributes rather than CSS variables because the machine derives every shade, shadow and glow from them.

## Behaviour and accessibility

- The slip is a button: Enter or Space feeds it in. Each copy in the tray is a button too: Enter or Space copies the value.
- Drag the slip towards the glass and the lid lifts; drop it on the glass to copy (dropped anywhere else, it slides back). Click it and it flies in by itself.
- Start prints another copy, lifting the lid each time so every copy matches. With the slip still on the desk, Start feeds it in first.
- Drag a copy out of the tray to copy the value; in the tray only the top copy comes out.
- A polite live region announces "Copied … to the clipboard." for screen readers.
- `prefers-reduced-motion`: the machine jumps between states instead of animating.
- Textures for hidden parts build in idle time, and the display only animates while the copier is on screen.

## How the code is organised

```
src/core/machine.ts                    runs the sequence: lid, lamp, feeding the slip, scanning, clipboard, build queue
src/core/copies.ts                     copies in the tray: printing them out, taking them out (click, keys, drag)
src/core/sheets.ts                     everything printed on paper and glass: slip, backlit slip, toner copies, dust, rulers
src/core/display.ts                    the dot-matrix display: messages, marquee, blink, pauses off screen
src/core/sound.ts                      synthesized foley and phone haptics
src/core/textures.ts                   seeded noise, paper with fibres and tooth, grain and foam, all drawn to canvas
src/core/palette.ts                    default palettes, per-theme colours and the --cp-* variables (unit-tested)
src/core/fonts.ts                      value and label font settings (unit-tested)
src/core/layout.ts                     design size, sheet sizes, desk fitting and value sizing (unit-tested)
src/core/matrix.ts, color.ts           dot-matrix display font and colour maths (unit-tested)
src/core/styles.ts                     shadow-root styles and the machine's markup
src/element/copier-element.ts          the <photo-copier> custom element
src/element/index.ts                   registers the element; the library entry point
src/react/Copier.tsx                   React adapter
index.html, demo/                      demo page, props playground, in-browser self-test
test/core.test.ts                      unit tests (node --test)
vite.config.ts                         library build (dist/)
vite.site.config.ts, vercel.json       demo site build and hosting
```

The element reads its attributes, turns the colours into CSS variables and fits the 420 × 640 drawing into its box. When something that's printed or drawn changes (value, label, fonts, accent, paper, ink), it rebuilds the machine; colour-only changes just restyle it. `machine.ts` runs the sequence and hands each job to its own part: `sheets.ts` draws, `copies.ts` handles the tray, `display.ts` the readout and `sound.ts` the foley. Everything is drawn once into canvases and moved with CSS and the Web Animations API, so nothing re-renders while it plays.

## Development

Requires Node 22.18 or newer (see `.nvmrc`) and npm.

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm run dev` | Demo at http://localhost:4177, playground at `/demo/playground.html`, self-test at `/demo/selftest.html`. |
| `npm test` | Unit tests for the colour, palette, font, layout, display and noise maths. |
| `npm run typecheck` | TypeScript check. |
| `npm run build` | `dist/copier.js` (ESM), `dist/copier.iife.js` (script tag) and `dist/types`. |
| `npm run build:site` | The demo site Vercel serves (`site-dist`): `/`, `/playground`, `/demo/selftest.html`, plus `/copier.iife.js` and `/copier.js` for embeds. |

Typecheck, tests and build also run on GitHub for every push. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to make a change and [CHANGELOG.md](CHANGELOG.md) for what changed.

## License

Free for personal and other non-commercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Commercial use (client work, products, sites that make money) needs a paid license: open an issue to ask.
