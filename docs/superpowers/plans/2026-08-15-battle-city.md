# Battle City — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Core-version Battle City browser game (1 player, 12 levels), playable by opening `index.html`, zero dependencies.

**Architecture:** Vanilla JS, no build. Four browser globals via plain `<script>` tags:
`Grid` (pure map/collision logic), `LEVELS` (data), `BCAudio` (WebAudio beeps), and the game
boot code in `game.js` (entities, state machine, rendering). `grid.js` and `levels.js` are
dual-environment (browser + Node) so `node --test` verifies logic with zero install.

**Tech:** HTML5 Canvas 2D, WebAudio, `node:test` (Node built-in, no package.json needed).

**Spec:** `docs/superpowers/specs/2026-08-15-battle-city-design.md`

## Global Constraints

- Working dir: `D:\my-tools\game`
- No npm, no package.json, no build, no image/audio files
- `node --test tests/` must pass at every commit
- Playfield: grid 13x13, `TILE=30`, canvas 390x390
- Tile chars: `.` empty, `B` brick, `S` steel, `R` river, `T` tree
- Tank 28x28 px, 4-dir movement, continuous (no grid snap)
- Speeds px/s: player 90 (112 w/ tank power), B 60, F 110, P 85, A 60
- Bullet: 4x4, 360 px/s (P enemy 480), max 1 on field (2 w/ tank power)
- Scores: B 100, F 200, P 300, A 400, power-up pickup 500
- Armor (A): HP 4, recolor on hits 1-3
- 20 enemies/level, max 6 on field, spawn order (1,0) -> (6,0) -> (11,0)
- Fort: eagle tile (6,12) + brick ring (5,11),(6,11),(7,11),(5,12),(7,12); eagle hit = game over
- Player spawn (4,12), spawn protection 2s, lives start 3
- Power-ups: 50% of enemies (random per level), box 24x24, 12s lifetime
- High-score key: `battlecity_highscore`

## Dual-Environment Pattern

`grid.js` and `levels.js` expose a global var for the browser AND `module.exports` for Node:

```js
var LEVELS = [ /* ... */ ];
if (typeof module !== "undefined" && module.exports) module.exports = LEVELS;
```

`grid.js` wraps its API in an IIFE assigned to `var Grid`, same footer.

## Target File Tree

```
D:\my-tools\game\
  index.html
  styles.css
  grid.js          (dual-env)
  levels.js        (dual-env, 12 validated maps)
  audio.js
  game.js
  tests/
    levels.test.js
    grid.test.js
  docs/superpowers/...   (existing spec + this plan)
```

---

## Task 1: levels.js + map validation tests (TDD)

**Files:** Create `tests/levels.test.js`, `levels.js`

**Step 1.1 — Write failing test `tests/levels.test.js`:**

```js
const test = require("node:test");
const assert = require("node:assert");
const LEVELS = require("../levels.js");

test("12 levels", () => { assert.equal(LEVELS.length, 12); });

test("each map is 13x13 with valid chars", () => {
  for (let i = 0; i < 12; i++) {
    const lv = LEVELS[i];
    assert.equal(lv.map.length, 13, `L${i + 1} rows`);
    for (let y = 0; y < 13; y++) {
      assert.equal(lv.map[y].length, 13, `L${i + 1} row ${y} len`);
      assert.ok(/^[.BSTR]*$/.test(lv.map[y]), `L${i + 1} row ${y}`);
    }
  }
});

test("each level has 20 enemies from B F P A", () => {
  for (let i = 0; i < 12; i++)
    assert.match(LEVELS[i].enemies, /^[BFPA]{20}$/, `L${i + 1} enemies`);
});

test("spawn + fort zones clear on every map", () => {
  for (let i = 0; i < 12; i++) {
    const m = LEVELS[i].map;
    for (const x of [1, 6, 11]) assert.equal(m[0][x], ".", `L${i + 1} spawn (${x},0)`);
    for (let x = 4; x <= 7; x++) assert.equal(m[12][x], ".", `L${i + 1} row12 x${x}`);
    for (let x = 5; x <= 7; x++) for (const y of [11, 12]) assert.equal(m[y][x], ".", `L${i + 1} fort (${x},${y})`);
  }
});

test("player spawn reaches all 3 enemy spawns (flood fill)", () => {
  for (let i = 0; i < 12; i++) {
    const m = LEVELS[i].map;
    const walk = (ch) => ch === "." || ch === "T";
    const seen = new Set(["12,4"]);
    const stack = [[12, 4]];
    while (stack.length) {
      const [y, x] = stack.pop();
      for (const [dy, dx] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ny = y + dy, nx = x + dx, key = ny + "," + nx;
        if (ny < 0 || ny > 12 || nx < 0 || nx > 12 || seen.has(key)) continue;
        if (!walk(m[ny][nx])) continue;
        seen.add(key); stack.push([ny, nx]);
      }
    }
    for (const [y, x, name] of [[0,1,"W"],[0,6,"C"],[0,11,"E"]])
      assert.ok(seen.has(y + "," + x), `L${i + 1} spawn ${name} unreachable`);
  }
});
```

**Step 1.2 — Run, confirm FAIL:** `node --test tests/levels.test.js` -> `Cannot find module '../levels.js'`.

**Step 1.3 — Write `levels.js`** with the VALIDATED data (already passed the standalone checker).
Full map data is embedded in the task below — use it verbatim.

**Step 1.4 — Run, confirm PASS:** `node --test tests/levels.test.js` -> 5/5 pass.

**Step 1.5 — Commit:** `git add levels.js tests/levels.test.js && git commit -m "feat(levels): 12 validated maps + node:test validation"`

### levels.js map data (verbatim, validated: `ALL 12 MAPS OK`)

```js
var LEVELS = [
  { map: [
    ".............",
    ".BB......BB..",
    ".............",
    ".B.TTTT.TT.B.",
    ".............",
    ".BBB.....BBB.",
    "......S......",
    "..B.BBB.B.B..",
    ".............",
    "...B.....B...",
    "...B.RRR.B...",
    ".............",
    "............."
  ], enemies: "BFBFBBBFBFBBBFBFBBBF" },
  { map: [
    ".............",
    "...B...S.B...",
    "..BB.RRR.BB..",
    ".BBB.RRR.BBB.",
    "......S......",
    "..BB.TTT.BB..",
    ".S.B.....B.S.",
    ".S.B.....B.S.",
    "......S......",
    "..B..RRR..B..",
    "..B...R...B..",
    ".............",
    "............."
  ], enemies: "BFBFBFBBPFBFBFBFBFBA" },
  { map: [
    ".............",
    "TTT.......TTT",
    "TTT...T...TTT",
    "...B.....B...",
    "..B..RRR..B..",
    "..B...R...B..",
    "..B..TST..B..",
    "..B..TST..B..",
    "..B...R...B..",
    "..B..RRR..B..",
    "...B.....B...",
    ".............",
    "............."
  ], enemies: "FBFBFBBBFBFBFBBBFBPF" },
  { map: [
    ".............",
    ".SS.......SS.",
    ".SB.......BS.",
    "..B...B...B..",
    "..B...S...B..",
    ".....TTT.....",
    "..S.......S..",
    ".....BBB.....",
    ".B.S..S.S..B.",
    "..B..RRR..B..",
    "..B.......B..",
    ".............",
    "............."
  ], enemies: "BFPFBFBBPFBFBFBAPFBA" },
  { map: [
    ".............",
    ".BB..RRR..BB.",
    ".....RRR.....",
    "..BB.RRR.BB..",
    "..B..RRR..B..",
    ".S...RRR...S.",
    "......S......",
    "..B..RRR..B..",
    "..BB.RRR.BB..",
    ".....RRR.....",
    ".BB..RRR..BB.",
    ".............",
    "............."
  ], enemies: "FBFAPBFBPFBFBBBAPFBF" },
  { map: [
    ".............",
    ".BBB.SSS.BBB.",
    ".B.B..S..B.B.",
    ".B.........B.",
    "..S..TTT..S..",
    ".....BBB.....",
    "..B..TTT..B..",
    ".....BBB.....",
    "..S..RRR..S..",
    ".B.R.TT..R.B.",
    "...S.RRR.S...",
    ".............",
    "............."
  ], enemies: "PFBFAFBFBBPFAFBFBBPF" },
  { map: [
    ".............",
    "S.BB.SSS.BB.S",
    "S.B.......B.S",
    "...B.....B...",
    "...T.SSS.T...",
    "TTT.S....STTT",
    "TTT...S...TTT",
    "TTT...S...TTT",
    "TTT.S....STTT",
    "...T.SSS.T...",
    "...B.....B...",
    ".............",
    "............."
  ], enemies: "PFAPFBFBBPFAPFBBPFBP" },
  { map: [
    ".............",
    ".TTT.....TTT.",
    "......S......",
    "..BBR...RBB..",
    "..BBRRRRRBB..",
    "...B.R.R.B...",
    "...B.RRR.B...",
    "....R...R....",
    ".....S.S.....",
    ".BB.......BB.",
    "..T..TTT..T..",
    ".............",
    "............."
  ], enemies: "BAAFBBFAPBFAFBBBBAFP" },
  { map: [
    ".............",
    "S.BB.....BB.S",
    "S.B...B...B.S",
    "..BB......BB.",
    "..B..SSS..B..",
    ".BB.......BB.",
    ".....BBB.....",
    ".....TTT.....",
    ".BB.......BB.",
    "R.BB.....BB.R",
    "...S.....S...",
    ".............",
    "............."
  ], enemies: "PAFBFPBAPBFAFBBPBFFA" },
  { map: [
    ".............",
    "..BR..S..RB..",
    "..BBR.S.RBB..",
    "...RRR.RRR...",
    ".....RRR.....",
    "TT..SS.SS..TT",
    "TTTT.S.S.TTTT",
    "TTTT.S.S.TTTT",
    "TT..SS.SS..TT",
    ".....RRR.....",
    "...RRR.RRR...",
    ".............",
    "............."
  ], enemies: "FAPBAPFAFBBAPBFAPBFA" },
  { map: [
    ".............",
    "BBB.BBBBB.BBB",
    "BBB.......BBB",
    "BB.B.TTT.B.BB",
    "B..B.....B..B",
    ".S.S.....S.S.",
    "..RB.TTT.BR..",
    ".....BBB.....",
    "..RB.TTT.BR..",
    ".S.S.....S.S.",
    "B..B.....B..B",
    ".............",
    "............."
  ], enemies: "APFAFBPAPBPFBBAPBPFA" },
  { map: [
    ".............",
    "SSS.SSSSS.SSS",
    "SSS.S...S.SSS",
    "SS.........SS",
    "..S..BBB..S..",
    "....STTTS....",
    "..B.......B..",
    "..B.......B..",
    "...B.BBB.B...",
    "....STTTS....",
    "S..B.....B..S",
    ".............",
    "............."
  ], enemies: "PFAPFAPBAPFAPBPAPFAF" }
];
if (typeof module !== "undefined" && module.exports) module.exports = LEVELS;
```

---

## Task 2: grid.js map/collision logic (TDD)

**Files:** Create `tests/grid.test.js`, `grid.js`

**Step 2.1 — Write failing test `tests/grid.test.js`:** covers `buildMap` (fortune placed),
`tileAt`, `tankBlocks` (B/S/R/brick/eagle block, `.`/`T` pass), `canMoveTank` (28x28 box vs
solid tiles + border), `bulletHits` (returns `{kind:'brick'|'steel'|'eagle'}` or null; shovel
mode makes fort bricks act as steel), and a sweep across all 12 real levels (fort bricks intact,
spawn cells unblocked).

**Step 2.2 — Run, confirm FAIL** (Cannot find '../grid.js').

**Step 2.3 — Implement `grid.js`** with this exact API:

```js
var Grid = (function () {
  "use strict";
  var TILE = 30, COLS = 13, ROWS = 13, FIELD = COLS * TILE;
  var FORT_BRICKS = [[5,11],[6,11],[7,11],[5,12],[7,12]];
  var SPAWNS = [[1,0],[6,0],[11,0]];
  var PLAYER_SPAWN = [4,12];

  function buildMap(lv) {
    var tiles = lv.map.map(function (r) { return r.split(""); });
    var bricks = FORT_BRICKS.map(function (p) { return { x: p[0], y: p[1], broken: false }; });
    for (var i = 0; i < FORT_BRICKS.length; i++)
      tiles[FORT_BRICKS[i][1]][FORT_BRICKS[i][0]] = "B";
    return {
      tiles: tiles, bricks: bricks,
      eagle: { x: 6, y: 12, alive: true },
      steel: false, steelTimer: 0
    };
  }

  function tileAt(m, x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return "S"; // border = steel
    return m.tiles[y][x];
  }
  function isEagle(m, x, y) { return m.eagle.alive && x === 6 && y === 12; }
  function brickAt(m, x, y) {
    for (var i = 0; i < m.bricks.length; i++)
      if (m.bricks[i].x === x && m.bricks[i].y === y && !m.bricks[i].broken) return m.bricks[i];
    return null;
  }
  function tankBlocks(m, x, y) {
    if (isEagle(m, x, y)) return true;
    if (brickAt(m, x, y)) return true;
    var c = tileAt(m, x, y);
    return c === "B" || c === "S" || c === "R";
  }
  // 28x28 box: solid if any of 4 corner samples (2px inset) is off-bounds or a blocking tile
  function canMoveTank(m, px, py, w, h) {
    var pts = [[px+2,py+2],[px+w-2,py+2],[px+2,py+h-2],[px+w-2,py+h-2]];
    for (var i = 0; i < 4; i++) {
      var cx = Math.floor(pts[i][0]), cy = Math.floor(pts[i][1]);
      if (cx < 0 || cy < 0 || cx >= FIELD || cy >= FIELD) return false;
      if (tankBlocks(m, Math.floor(cx / TILE), Math.floor(cy / TILE))) return false;
    }
    return true;
  }
  // returns null | {kind:'brick', cell:[x,y], brick:fortBrickOrNull} | {kind:'steel'} | {kind:'eagle'}
  function bulletHits(m, x, y) {
    if (isEagle(m, x, y)) return { kind: "eagle" };
    var b = brickAt(m, x, y);
    if (b) return m.steel ? { kind: "steel" } : { kind: "brick", cell: [x, y], brick: b };
    var c = tileAt(m, x, y);
    if (c === "B") return { kind: "brick", cell: [x, y], brick: null };
    if (c === "S") return { kind: "steel" };
    return null;
  }
  function setFortSteel(m, on) {
    m.steel = on; m.steelTimer = on ? 30 : 0;
    if (!on) for (var i = 0; i < m.bricks.length; i++) m.bricks[i].broken = false;
  }
  return { TILE: TILE, COLS: COLS, ROWS: ROWS, FIELD: FIELD,
    FORT_BRICKS: FORT_BRICKS, SPAWNS: SPAWNS, PLAYER_SPAWN: PLAYER_SPAWN,
    buildMap: buildMap, tileAt: tileAt, isEagle: isEagle, brickAt: brickAt,
    tankBlocks: tankBlocks, canMoveTank: canMoveTank, bulletHits: bulletHits,
    setFortSteel: setFortSteel };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Grid;
```

Bullets that pierce brick with the bullet power-up: `game.js` handles "do not stop, keep going"
by NOT consuming the bullet — `grid.js` only reports what is at a cell.

**Step 2.4 — Run, confirm PASS:** `node --test tests/` -> all grid + levels tests green.

**Step 2.5 — Commit:** `git add grid.js tests/grid.test.js && git commit -m "feat(grid): map build, fort, tank/bullet collision (node-tested)"`

---

## Task 3: index.html + styles.css skeleton

**Files:** Create `index.html`, `styles.css`

**Step 3.1 — `index.html`** (full content):

```html
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Battle City</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div id="wrap">
  <div id="stage">
    <canvas id="game" width="390" height="390"></canvas>
    <div id="overlay" class="hidden">
      <div id="ov-title"></div>
      <div id="ov-sub"></div>
      <div id="ov-hint"></div>
    </div>
  </div>
  <div id="hud">
    <div class="hud-block"><label>ENEMIES</label><div id="hud-enemies"></div></div>
    <div class="hud-block"><label>STAGE</label><div id="hud-stage">1/12</div></div>
    <div class="hud-block"><label>LIVES</label><div id="hud-lives"></div></div>
    <div class="hud-block"><label>SCORE</label><div id="hud-score">0</div></div>
    <div class="hud-block"><label>HIGH</label><div id="hud-high">0</div></div>
  </div>
</div>
<script src="levels.js"></script>
<script src="grid.js"></script>
<script src="audio.js"></script>
<script src="game.js"></script>
</body>
</html>
```

**Step 3.2 — `styles.css`** (full content):

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #111; color: #eee;
  font-family: "Courier New", monospace;
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh;
}
#wrap { display: flex; gap: 16px; }
#stage { position: relative; border: 2px solid #444; }
#game { display: block; background: #000; }
#overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; text-align: center;
}
#overlay.hidden { display: none; }
#ov-title { font-size: 28px; font-weight: bold; letter-spacing: 2px; }
#ov-sub { font-size: 16px; color: #ccc; }
#ov-hint { font-size: 13px; color: #888; }
#hud { width: 130px; display: flex; flex-direction: column; gap: 14px; }
.hud-block label { display: block; font-size: 11px; color: #888; margin-bottom: 4px; }
.hud-block div { font-size: 16px; font-weight: bold; }
#hud-enemies { display: flex; gap: 3px; flex-wrap: wrap; }
.icon { display: inline-block; width: 12px; height: 12px; margin-right: 2px; }
.icon.enemy { background: #999; }
.icon.life { background: #fc0; }
```

**Step 3.3 — Verify:** `node --test tests/` still green. (Browser smoke in Task 5.)

**Step 3.4 — Commit:** `git add index.html styles.css && git commit -m "feat(ui): layout skeleton (canvas + HUD + overlay)"`

---

## Task 4: audio.js WebAudio beeps

**Files:** Create `audio.js`

**Step 4.1 — Implement `audio.js`.** Lazy AudioContext (created on first `play`, which only
happens from keydown-driven game events, satisfying autoplay policy). One short blip per name:
`shoot` (square 880->220Hz 60ms), `brick_break` (noise 40ms), `steel_hit` (square 1200Hz 30ms),
`explode_small` (noise 120ms decay), `explode_big` (noise 300ms decay, lower),
`powerup` (square arpeggio 440/660/880), `star` (triangle 660->1320 100ms),
`fort_destroy` (noise 500ms + 110Hz saw), `stage_clear` (square 523/659/784/1047 arpeggio),
`game_over` (saw 220->55 600ms). Implementation sketch (complete in execution):

```js
var BCAudio = (function () {
  "use strict";
  var ctx = null;
  function ensure() {
    if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }
  function tone(type, f0, f1, dur, vol) { /* osc + gain envelope */ }
  function noise(dur, vol, low) { /* buffer source + lowpass */ }
  return { play: function (name) { ensure(); /* switch(name) ... */ } };
})();
```

**Step 4.2 — Verify:** no automated test (browser-only). Browser check in Task 5 (no console errors; sounds audible on shoot/explosion).

**Step 4.3 — Commit:** `git add audio.js && git commit -m "feat(audio): WebAudio beeps, lazy context"`

---

## Task 5: game.js part 1 — boot, state machine, input, map render, HUD

**Files:** Create `game.js`

**Step 5.1 — Implement `game.js` part 1.** Structure (this file grows across Tasks 5-8; keep the
IIFE `var Game = (function(){ ... })()` and add functions in later tasks):

- `state` object: `mode` in `menu|intro|playing|paused|clear|over|win`, `level` (0-11),
  `score`, `high` (from localStorage), `lives` (3), `time` (ms, only advances in `playing`),
  `map` (from `Grid.buildMap`), `introT`, `clearT`, `overReason`.
- `startLevel(idx)`: build map, reset player/enemies/bullets/powerups,
  flag power carriers (50% of the 20, using `Math.random`), mode=`intro`, `introT=2000`.
- Input: `keydown/keyup` sets `keys` set; ArrowUp/Down/Left/Right + Space/Enter shoot + P/Esc
  pause + Enter for menu/over/win transitions. `preventDefault` on those codes. First keydown
  also calls `BCAudio.play` guard (context resume) — safe no-op in `menu` (no sound name).
- `update(dt)`: dispatch on mode. `intro`: countdown -> `playing`. `playing`: (entity updates
  added in Tasks 6-8). `clear`: after 2500ms -> next level or `win`. `over`/`win`: wait Enter.
- `render()`: black bg -> tiles (brick pattern 2x2 per tile, steel with highlight, river with
  2-frame animated stripes, tree leaves after tanks) -> fort bricks/eagle (eagle = small
  3-rect bird) -> (tanks/bullets/powerups/explosions: Tasks 6-8) -> trees last.
- HUD sync after each update: enemies-left icons, stage n/12, lives icons, score, high (live).
- Overlay: `showOverlay(title, sub, hint)` / `hideOverlay()` helpers for menu (`title="BATTLE
  CITY", sub="HIGH 000000", hint="PRESS ENTER"`), pause, stage clear, game over, victory.
- Main loop: `requestAnimationFrame`, clamp `dt` to 50ms, `time += dt*1000` only when playing.

**Step 5.2 — Browser verification** (browser-tools): open
`file:///D:/my-tools/game/index.html` (or serve with `python -m http.server -d "D:\my-tools\game" 8931`).
Check: console errors = 0; menu overlay shows with high score; Enter starts level 1 intro then map
renders (bricks/river/steel/fort visible); HUD shows 20 enemies, STAGE 1/12, 3 lives; P pauses,
P resumes; arrows/Space preventDefault (page does not scroll). Take screenshot of menu + playing.

**Step 5.3 — Commit:** `git add game.js && git commit -m "feat(game): boot, state machine, input, map render, HUD"`

---

## Task 6: game.js part 2 — player tank + bullets

**Step 6.1 — Add to `game.js`:**

- `player` entity: `{x: px, y: px, dir: 0|1|2|3 (up/down/left/right), speed, alive, respawnT,
  shieldT, tankFrame, cooldown, bullets: []}`. Spawn at `Grid.PLAYER_SPAWN` tile center
  (x = 4*30+1 = 121, y = 12*30+1 = 361... use `tx*TILE + 1`).
- Movement: axis from keys (last-pressed axis wins; up/down take priority if both H+V held —
  last keydown wins, track via key order). Target speed = power.tank ? 112 : 90.
  Move X: `nx = x + dx*speed*dt`; if `!Grid.canMoveTank(map, nx, y, 28, 28)` or overlaps another
  tank (AABB vs tanks list, player excluded, 2px shrink each side) or out of field (0..362) →
  stop at 0 on that axis (axis separation: try X then Y independently).
- Turret dir = movement dir when moving (keep last dir when idle). Tread frame anim 8ms/frame.
- Shoot (Space/Enter): allowed if `cooldown<=0` and `bullets.length < (power.tank ? 2 : 1)`;
  spawn bullet at muzzle: up `(x+14-2, y-2)` etc. (4x4). `cooldown=300ms`. `BCAudio.play("shoot")`.
- `updateBullets(bullets, owner)`: for each bullet, substep 2px at a time; each substep:
  - leading point (center of 4x4 lead edge) tile via `Grid.bulletHits(map, tx, ty)`:
    - eagle → `Grid` eagle handled: big explosion at (6,12), `BCAudio.play("fort_destroy")`,
      game over (reason "FORT DESTROYED") — even if owner is player.
    - brick → if powerbullet: destroy (`map.tiles[ty][tx]="."` or `brick.broken=true`), continue;
      else destroy + remove bullet, `BCAudio.play("brick_break")`.
    - steel → if powerbullet: destroy + continue; else small flash, remove bullet,
      `BCAudio.play("steel_hit")`.
    - null → pass (river/tree).
  - out of field → remove.
  - tank overlap (owner's enemies for player bullet / player for enemy bullet): if target
    has `shieldT>0` (spawn protection) → bullet vanishes with small flash; else damage:
    armor hp--  (recolor white flash 100ms); if hp<=0 or normal tank → explode (big for player,
    small+big enemy), score for enemy.
- Player death: big explosion, `lives--`, if lives>0 → respawn at spawn point `respawnT=1000ms`
  then `shieldT=2000ms` (blink while shieldT). If lives==0 → game over "OUT OF LIVES" after 1s.
- Power state: `{ tank:false, bulletPower:false, helmetT:0, star:false, shovelT:0 }` — reset at
  startLevel.

**Step 6.2 — Browser verification:** drive player around (moves smoothly, stops at walls/fort),
shoot bricks (brick breaks + sound), shoot steel (bullet disappears), shoot river (passes),
walk under trees, shoot self-bullet limit (1 at a time). Screenshot mid-play. Console clean.

**Step 6.3 — Commit:** `git add game.js && git commit -m "feat(game): player movement + bullets + collision"`

---

## Task 7: game.js part 3 — enemies: spawn queue, AI, fire

**Step 7.1 — Add to `game.js`:**

- `enemies: []`, `queue: [...]` (20 types from level string), `spawnT` (2500ms interval),
  spawn slot rotates W→C→E.
- Spawn: if `enemies.length < 6` and `queue.length` and timer ready: check spawn tile box
  (tile*30+1 ±16px) free of tanks → spawn `{type, hp (4 for A else 1), x, y, dir:1 (down),
  speed from table, moveT: rand(800,2000), shootCd: 1200, shieldT... no: spawn protection only
  for first 1s? Spec: spawn protection 2s applies to tanks (blink, untargetable) — apply 1000ms
  to enemies too (classic). If blocked, retry every 500ms with flicker render.
- AI update: countdown `moveT`; on expire: pick new dir — normal: 50% same, 25% down, 25% random;
  star: 60% down, 25% toward player (axis with larger delta), 15% toward fort; new
  `moveT = star ? rand(400,900) : rand(800,2000)`; set `shootCd = 1200`.
  If blocked (collision in current dir) → immediately pick new dir (weighted above).
- Fire: when `shootCd<=0` and aligned: 60% chance fire (1 bullet, speed table, P=480; star
  multiplies speed x1.5), reset `shootCd=1200`.
- Enemy death: small+big explosion staggered, add score (B100 F200 P300 A400), if carrier →
  spawn power-up box (see Task 8). Remove from `enemies`.
- Enemy bullet damage to player handled in Task 6 bullet logic (owner flag).

**Step 7.2 — Browser verification:** enemies spawn in W/C/E order at top, move/turn/fire, can
kill player (respawn works, life counter drops), armor takes 4 hits, enemies max 6 on field,
20 remaining count ticks to 19... on kill. Console clean.

**Step 7.3 — Commit:** `git add game.js && git commit -m "feat(game): enemy spawn queue + AI + firing"`

---

## Task 8: game.js part 4 — power-ups, fort lifecycle, stage flow, scores/high score

**Step 8.1 — Add to `game.js`:**

- `powerups: []` box: `{x,y,type,t:12s}`; spawn at dead carrier tile center; 24x24 blinking
  (100ms toggle); on player overlap: `score += 500`, `BCAudio.play("powerup")` (star → "star"),
  apply:
  - tank → `power.tank=true`
  - bullet → `power.bulletPower=true`
  - helmet → `power.helmetT=15000`
  - shovel → `Grid.setFortSteel(map,true)`, `power.shovelT=30000`
  - star → `power.star=true`
  - bomb → all active enemies die (each with score + explosion; no power-up drops),
    `BCAudio.play("explode_big")`
- Tick timers: `helmetT`, `shovelT` (on expire `Grid.setFortSteel(map,false)`), box `t`,
  enemy `shieldT`, player `respawnT/shieldT/cooldown`, `introT`, `clearT`.
- Stage clear: when `queue.length===0 && enemies.length===0` → mode=`clear`,
  `BCAudio.play("stage_clear")`, overlay "STAGE CLEAR"; after 2500ms → `startLevel(i+1)` or
  mode=`win` (overlay "YOU WIN" + score/high).
- Game over: persist high score to localStorage, overlay with reason + score + "NEW HIGH SCORE?"
  when applicable; Enter → `menu` (rebuild HUD, overlay back to menu).
- HUD high: `high = max(high, score)` live; render.

**Step 8.2 — Browser verification (force-test, then real play):**
- Temporarily console-set `state.level=1` / short timers to reach stage 2 (remove temp code).
- Trigger a power-up drop (kill carriers or console-plant a box of each type) and verify all 6 effects.
- Destroy fort with a bullet → game over with "FORT DESTROYED".
- Run out of lives → game over "OUT OF LIVES".
- Enter at over → back to menu; Enter → runs again fresh.
- Screenshot: stage-clear overlay, game-over overlay.

**Step 8.3 — Commit:** `git add game.js && git commit -m "feat(game): power-ups, fort lifecycle, stage flow, high score"`

---

## Task 9: final polish + full verification

**Step 9.1 — Polish pass (checklist, fix any found):**
- No console errors/warnings in browser (check network logs: only local files).
- Arrow/Space never scroll the page (test at bottom of page).
- Pause during any mode other than playing is ignored; P/Esc during playing toggles.
- Trees render over tanks (verify under-tree drive: tank hidden, still moves/collides).
- River animation runs; explosions 2-phase; shield circle rotates.
- High score survives page refresh (localStorage).
- Victory path: force `state.level=11` + clear to see victory overlay (remove temp).
- Enemy flicker when spawn blocked (hard to trigger; code review is enough).
- All 12 levels reachable with no stuck states (play levels 1-3, force-advance through 4-12,
  confirm each renders and enemies spawn; check fort intact on each).

**Step 9.2 — Run full test suite:** `node --test tests/` -> green.

**Step 9.3 — Final commit:** `git add -A && git commit -m "chore: polish + verified playthrough all flows"`.

## Verification Plan (mirrors spec)

1. Browser: console errors = 0 on every screen (menu, playing, pause, clear, over, win).
2. Screenshots: menu, mid-gameplay, stage clear, game over, victory.
3. Playtest: levels 1-3 by hand; 4-12 force-advanced; all 6 power-ups triggered.
4. `node --test tests/` green; high score persists across reload.

## Plan Self-Review (2026-08-15)

- **Spec coverage:** maps (T1), tiles/collision (T2), UI shell (T3), audio (T4), states/input/
  render/HUD (T5), player+bullets (T6), enemies/AI (T7), power-ups/fort/stage flow/scores (T8),
  polish+full verification incl. all overlays, 12-level sweep, localStorage persistence (T9).
- **Placeholders:** full verbatim code for `levels.js` (validated), `grid.js`, `index.html`,
  `styles.css`; `game.js` tasks define exact data shapes, formulas, and browser checks per step.
- **Consistency:** all constants identical to spec; `buildMap` uses mutable char arrays; bullet
  tile mutation is caller-side (`map.tiles[ty][tx]`); dual-env footer in T2/T1 files.
- **Test command:** `node --test tests/` from `D:\my-tools\game`.
