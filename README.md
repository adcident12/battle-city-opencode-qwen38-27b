# Battle City

A single-player Battle City clone that runs entirely in your browser — pure vanilla JavaScript + Canvas, zero dependencies, no build step.

![Battle City in play](docs/screenshot.png)

## About

A faithful core version of the classic tank game. You defend your base against 20 enemy tanks per stage across 12 hand-drawn stages on a 13×13 tile (390×390 px) playfield: thread through brick walls, dodge rivers and steel, pick up power-ups mid-fight — and never let the eagle at your base get shot.

The game is written in vanilla, untranspiled JavaScript rendered with Canvas 2D, with retro sound effects synthesized from scratch via WebAudio (no audio files). Map data, the collision grid, and level validation are pure functions covered by a `node:test` unit suite, and the whole game boots by opening a single `index.html`.

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Edge, Firefox, Safari)
- Node.js 18+ **only** if you want to run the test suite

There is no package manager, no install step, and no network access required — the game makes zero HTTP requests beyond loading its own files.

### Run

Option A — just open the file:

```
open index.html in your browser
```

Option B — serve the folder with any static server, e.g. Python:

```bash
cd battle-city-opencode-qwen38-27b
python -m http.server 8080
# then visit http://localhost:8080
```

## Controls

| Key              | Action                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| Arrows / WASD    | Move                                                                          |
| Space or Enter   | Fire (in play) · Start (menu) · Return to menu (game over / victory)          |
| P or Escape      | Pause / resume                                                                |
| M                | Mute / unmute sound                                                           |

## Gameplay

- 12 stages, 20 enemy tanks per stage, up to 6 on screen at once
- 3 lives; a destroyed tank respawns at the base with 2 s of spawn protection
- One hit on the eagle (base) ends the game immediately
- High score persists between sessions via `localStorage`
- Active power-ups reset at every stage (score and lives are kept)

### Enemy types

| Type    | Key | Score | HP | Speed | Notes                              |
| ------- | --- | ----- | -- | ----- | ---------------------------------- |
| Basic   | B   | 100   | 1  | 60 px/s |                                    |
| Fast    | F   | 200   | 1  | 110 px/s |                                 |
| Power   | P   | 300   | 1  | 85 px/s | Fires faster bullets (480 px/s)    |
| Armor   | A   | 400   | 4  | 60 px/s | Needs 4 hits; flashes when damaged |

### Power-ups

Each stage, half of the enemy tanks are pre-rolled "carriers": killing one drops a pickup at its death spot (worth +500), which despawns after 12 s if uncollected.

| Pickup       | Weight | Effect                                                              |
| ------------ | ------ | ------------------------------------------------------------------- |
| Tank `T`     | 25%    | Player speed ×1.25 and a second concurrent bullet                   |
| Bullet `B`   | 25%    | Bullets pierce brick rows and can destroy steel                     |
| Helmet `H`   | 25%    | 15 s invulnerability shield around your tank                        |
| Shovel `S`   | 25%    | Fort bricks become steel for 30 s; destroyed bricks are restored on expiry |
| Star `★`     | 15%    | Enemy AI turns aggressive (faster reactions, aims at you and the base) for the rest of the stage |
| Bomb `☢`     | 15%    | Destroys every enemy on screen instantly, full score for each       |

### Tile types

- `B` brick — blocks tanks, one bullet destroys one tile
- `S` steel — blocks everything; only a powered bullet destroys it
- `R` river — blocks tanks, bullets pass over
- `T` tree — pure cover: drawn on top of tanks, blocks nothing

## Tech Stack

- Vanilla JavaScript (ES5-style, IIFE modules exposed on `window`) — no transpiler, no bundler, no dependencies
- Canvas 2D rendering, `requestAnimationFrame` loop with a clamped delta time
- WebAudio API for all sound effects (synthesized beeps, no assets)
- `localStorage` for the high score
- `node:test` (Node's built-in runner) for logic unit tests

The codebase was built spec-first: design spec and a 9-task TDD implementation plan live in `docs/superpowers/`, and the game was developed against them.

## Project Structure

```
├── index.html        # Page shell: canvas + HUD + overlay
├── styles.css        # Layout, HUD blocks, overlay styling
├── levels.js         # 12 stage maps + per-stage enemy queues
├── grid.js           # Map building, fort, tank/bullet collision (pure functions)
├── audio.js          # WebAudio sound effects (pure module)
├── game.js           # Game loop, state machine, entities, rendering
├── tests/            # node:test suites (levels + grid)
└── docs/
    ├── screenshot.png
    └── superpowers/  # design spec + implementation plan
```

## Testing

```bash
node --test tests/levels.test.js tests/grid.test.js
```

14 tests cover level data integrity (13×13 maps, clear spawn/fort rows, 20-enemy queues) and grid logic (map building, fort brick placement, tank/bullet collision resolution). The game loop itself is DOM-bound and verified by hand in the browser.
