var Grid = (function () {
  "use strict";
  var TILE = 30, COLS = 13, ROWS = 13, FIELD = COLS * TILE;
  var FORT_BRICKS = [[5, 11], [6, 11], [7, 11], [5, 12], [7, 12]];
  var SPAWNS = [[1, 0], [6, 0], [11, 0]];
  var PLAYER_SPAWN = [4, 12];

  function buildMap(lv) {
    var tiles = lv.map.map(function (r) { return r.split(""); });
    var bricks = FORT_BRICKS.map(function (p) { return { x: p[0], y: p[1], broken: false }; });
    return {
      tiles: tiles, bricks: bricks,
      eagle: { x: 6, y: 12, alive: true },
      steel: false, steelTimer: 0
    };
  }

  function tileAt(m, x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return "S";
    return m.tiles[y][x];
  }

  function isEagle(m, x, y) {
    return m.eagle.alive && x === m.eagle.x && y === m.eagle.y;
  }

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

  // Tank box (px, py, w, h). Blocked if any of the 4 corner samples (2px inset)
  // is off the field or sits on a blocking tile.
  function canMoveTank(m, px, py, w, h) {
    if (px < 0 || py < 0 || px + w > FIELD || py + h > FIELD) return false;
    var pts = [[px + 2, py + 2], [px + w - 2, py + 2], [px + 2, py + h - 2], [px + w - 2, py + h - 2]];
    for (var i = 0; i < 4; i++) {
      var tx = Math.floor(pts[i][0] / TILE), ty = Math.floor(pts[i][1] / TILE);
      if (tankBlocks(m, tx, ty)) return false;
    }
    return true;
  }

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
    m.steel = on;
    m.steelTimer = on ? 30 : 0;
    if (!on) for (var i = 0; i < m.bricks.length; i++) m.bricks[i].broken = false;
  }

  return {
    TILE: TILE, COLS: COLS, ROWS: ROWS, FIELD: FIELD,
    FORT_BRICKS: FORT_BRICKS, SPAWNS: SPAWNS, PLAYER_SPAWN: PLAYER_SPAWN,
    buildMap: buildMap, tileAt: tileAt, isEagle: isEagle, brickAt: brickAt,
    tankBlocks: tankBlocks, canMoveTank: canMoveTank, bulletHits: bulletHits,
    setFortSteel: setFortSteel
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Grid;
