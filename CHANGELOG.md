# Changelog

All notable changes to this project are listed here. Versions follow [semantic versioning](https://semver.org).

## Unreleased

- The built script is served from the demo site (`https://photo-copier.vercel.app/copier.iife.js`), so the playground's HTML works as pasted, including in Framer and Webflow embeds.
- License: PolyForm Noncommercial 1.0.0 (free for personal and non-commercial use).
- Per-theme colours: `light-*` and `dark-*` attributes (React: `light={{ }}`, `dark={{ }}`), like the two palettes in the Framer panel.
- Font weight and italic for the value and the label (`value-weight`, `value-style`, `label-weight`, `label-style`).
- The machine is split into focused parts (sequence, copies, sheets, display, sound). Rendering is pixel-identical to 0.1.0.

## 0.1.0

First version, ported from the Framer component.

- `<photo-copier>` web component and a React adapter on one framework-free engine.
- Drag or click the slip onto the glass: the lid lifts, the lamp scans, a toner copy slides into the tray; taking the copy out copies the value.
- Every copy is unique (open-lid toner border, specks, drum line), with synthesized sound and phone haptics.
- Light, dark and auto themes; accent, body, tray, paper, ink and shadow colours; value and label fonts.
- Keyboard support, a live region for screen readers, reduced-motion support, and a still mode for thumbnails.
- Demo, props playground and an in-browser self-test.
