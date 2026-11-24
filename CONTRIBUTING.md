# Contributing

Thanks for helping with Copier. This page covers everything you need to make a change and check it.

## Setup

You need Node 22.18 or newer (the exact version is in `.nvmrc`; run `nvm use` if you use nvm) and npm.

```
npm install
npm run dev        # demo at http://localhost:4177
```

## Where a change goes

The code has three layers. Most changes start at the bottom and move up.

1. **Core** (`src/core/`): `machine.ts` runs the sequence and calls the parts: `sheets.ts` (drawing), `copies.ts` (the tray), `display.ts`, `sound.ts`. Colour, palette, font, layout and display-font logic have no DOM and are tested in `test/core.test.ts`; add or update a test there for any change to them.
2. **Web component** (`src/element/copier-element.ts`): reads attributes, fits the drawing into its box, rebuilds or restyles the machine, fires events. Styles and markup live in `src/core/styles.ts`.
3. **React adapter** (`src/react/Copier.tsx`): a thin wrapper. When you add an attribute to the element, add the matching prop here.

When you add or change an attribute, also update the attribute table in `README.md`, and check that the playground (`demo/playground.ts`) has a control for every attribute.

## Checks before you push

```
npm run typecheck
npm test
npm run build
```

Then run `npm run dev`, open `/demo/selftest.html` and check that every line passes. The self-test drives the real component in the browser (clicks, keyboard, motion) and catches what unit tests can't.

The same typecheck, tests and build run automatically on GitHub for every push and pull request.

## Commits and pull requests

- Keep commits small, with a short one-line message, for example `fix long values on the slip`.
- One topic per pull request. Say what changed and how you checked it.
- Add a line to `CHANGELOG.md` under "Unreleased" for anything a user would notice.

## Code style

- TypeScript, two-space indent (see `.editorconfig`), no semicolons.
- Comments explain why, not what.
- Keep the pure modules (color, palette, fonts, layout, matrix) free of DOM code so they stay testable.
