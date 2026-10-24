# Keep Defence

A browser-based, grid-based tower defence game. Build walls, towers, traps and houses around your keep and survive endless, growing waves. Text glyphs and coloured squares only, styled after Dwarf Fortress and classic Mac System 6/7.

See [`SPEC.md`](SPEC.md) for the full design and [`tasks/plan.md`](tasks/plan.md) for the build plan.

## Requirements

- Node.js 22 or 24 LTS (other versions may work but aren't supported by Vitest)
- npm

## Getting started

```sh
npm install
npm run dev
```

Then open http://localhost:5173.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Typecheck and build the production bundle into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Run the unit tests in watch mode |
| `npm run coverage` | Run the tests with a coverage report (`coverage/index.html`) |
| `npm run typecheck` | Typecheck without building |
| `npm run format` | Format all files with Prettier |

## Project structure

```
index.html        Page shell: map canvas + side panel
src/main.ts       Bootstraps the game and runs the loop
src/sim/          Pure, deterministic game simulation (no DOM)
src/render/       Canvas drawing
src/ui/           Side panel and input handling
src/styles.css    System 6/7 style window chrome
tests/sim/        Unit tests for the simulation
```
