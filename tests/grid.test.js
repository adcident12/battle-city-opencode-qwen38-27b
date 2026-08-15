const test = require("node:test");
const assert = require("node:assert");
const LEVELS = require("../levels.js");
const Grid = require("../grid.js");

function emptyLevel() {
  return { map: Array.from({ length: 13 }, () => ".".repeat(13)), enemies: "B".repeat(20) };
}

test("buildMap: 13x13 char-grid, 5 fort bricks, eagle alive", () => {
  const m = Grid.buildMap(emptyLevel());
  assert.equal(m.tiles.length, 13);
  assert.equal(m.tiles[0].length, 13);
  assert.equal(typeof m.tiles[0][0], "string");
  for (const [x, y] of Grid.FORT_BRICKS) {
    assert.ok(Grid.brickAt(m, x, y), `brick present (${x},${y})`);
    assert.equal(Grid.tileAt(m, x, y), ".", `map stays clear under fort (${x},${y})`);
  }
  assert.equal(Grid.isEagle(m, 6, 12), true);
  assert.equal(m.eagle.alive, true);
});

test("tileAt: returns map char, border reads as steel", () => {
  const m = Grid.buildMap(emptyLevel());
  assert.equal(Grid.tileAt(m, 0, 0), ".");
  assert.equal(Grid.tileAt(m, -1, 0), "S");
  assert.equal(Grid.tileAt(m, 6, 12), ".");
});

test("tileAt reflects map content", () => {
  const lv = emptyLevel();
  lv.map[3] = "......S......";
  const m = Grid.buildMap(lv);
  assert.equal(Grid.tileAt(m, 6, 3), "S");
});

test("tankBlocks: B S R fort-brick eagle block, . T pass", () => {
  const lv = emptyLevel();
  lv.map[0] = ".BSRT........"; // x1 B, x2 S, x3 R, x4 T
  const m = Grid.buildMap(lv);
  assert.equal(Grid.tankBlocks(m, 1, 0), true); // brick
  assert.equal(Grid.tankBlocks(m, 2, 0), true); // steel
  assert.equal(Grid.tankBlocks(m, 3, 0), true); // river
  assert.equal(Grid.tankBlocks(m, 4, 0), false); // tree
  assert.equal(Grid.tankBlocks(m, 5, 0), false); // empty
  assert.equal(Grid.tankBlocks(m, 6, 12), true); // eagle
  assert.equal(Grid.tankBlocks(m, 5, 11), true); // fort brick
});

test("canMoveTank: 28x28 box respects solid tiles and border", () => {
  const m = Grid.buildMap(emptyLevel());
  assert.equal(Grid.canMoveTank(m, 0, 0, 28, 28), true);
  assert.equal(Grid.canMoveTank(m, -1, 0, 28, 28), false);
  assert.equal(Grid.canMoveTank(m, 362, 0, 28, 28), true); // right edge (362+28=390)
  assert.equal(Grid.canMoveTank(m, 363, 0, 28, 28), false);

  const lv = emptyLevel();
  lv.map[0] = ".B..........."; // brick at tile (1,0) = px 30..59
  const m2 = Grid.buildMap(lv);
  assert.equal(Grid.canMoveTank(m2, 5, 0, 28, 28), false); // overlaps tile 1
  assert.equal(Grid.canMoveTank(m2, 0, 0, 28, 28), true); // stays in tile 0
});

test("bulletHits: brick / steel / eagle / null", () => {
  const lv = emptyLevel();
  lv.map[0] = ".BS..T....."; // x1 B, x2 S, x5 T
  const m = Grid.buildMap(lv);
  const hb = Grid.bulletHits(m, 1, 0);
  assert.equal(hb.kind, "brick");
  assert.deepEqual(hb.cell, [1, 0]);
  assert.equal(hb.brick, null); // map brick, not a fort brick
  assert.equal(Grid.bulletHits(m, 2, 0).kind, "steel");
  assert.equal(Grid.bulletHits(m, 5, 0), null); // tree passes
  assert.equal(Grid.bulletHits(m, 6, 12).kind, "eagle");
});

test("bulletHits: fort brick is 'brick' with brick ref; broken -> null", () => {
  const m = Grid.buildMap(emptyLevel());
  const hit = Grid.bulletHits(m, 5, 11);
  assert.equal(hit.kind, "brick");
  assert.ok(hit.brick); // fort brick ref
  hit.brick.broken = true;
  assert.equal(Grid.bulletHits(m, 5, 11), null); // broken -> now open
});

test("setFortSteel: on -> steel, off -> bricks restored", () => {
  const m = Grid.buildMap(emptyLevel());
  const fb = Grid.brickAt(m, 5, 11);
  Grid.setFortSteel(m, true);
  assert.equal(m.steel, true);
  assert.equal(Grid.bulletHits(m, 5, 11).kind, "steel");
  fb.broken = true;
  Grid.setFortSteel(m, false);
  assert.equal(m.steel, false);
  assert.equal(fb.broken, false); // restored
  assert.equal(Grid.bulletHits(m, 5, 11).kind, "brick");
});

test("all 12 levels: fort bricks intact, spawn cells unblocked", () => {
  for (let i = 0; i < 12; i++) {
    const m = Grid.buildMap(LEVELS[i]);
    for (const [x, y] of Grid.FORT_BRICKS) assert.ok(Grid.brickAt(m, x, y), `L${i + 1} brick (${x},${y})`);
    for (const [x, y] of [[1, 0], [6, 0], [11, 0], [4, 12]])
      assert.equal(Grid.tankBlocks(m, x, y), false, `L${i + 1} spawn (${x},${y}) blocked`);
    assert.equal(Grid.isEagle(m, 6, 12), true, `L${i + 1} eagle`);
  }
});
