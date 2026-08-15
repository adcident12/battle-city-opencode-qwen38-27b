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
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy, nx = x + dx, key = ny + "," + nx;
        if (ny < 0 || ny > 12 || nx < 0 || nx > 12 || seen.has(key)) continue;
        if (!walk(m[ny][nx])) continue;
        seen.add(key); stack.push([ny, nx]);
      }
    }
    for (const [y, x, name] of [[0, 1, "W"], [0, 6, "C"], [0, 11, "E"]])
      assert.ok(seen.has(y + "," + x), `L${i + 1} spawn ${name} unreachable`);
  }
});
