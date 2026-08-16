const test = require("node:test");
const assert = require("node:assert");

global.window = {};
global.Sfx = require("../audio.js");
global.Grid = require("../grid.js");
global.LEVELS = require("../levels.js");
const game = require("../game.js");
const Grid = require("../grid.js");
const LEVELS = require("../levels.js");

function emptyMap() {
  return Grid.buildMap({ map: Array.from({ length: 13 }, () => ".".repeat(13)), enemies: "" });
}
function clearKeys() { for (var k in game.keys) delete game.keys[k]; }
function stubStore() {
  var store = {};
  global.localStorage = {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); }
  };
  return store;
}

// ---- helpers -------------------------------------------------------------
test("aabb: overlap, edge-touch, apart", () => {
  const a = { x: 0, y: 0, w: 28, h: 28 };
  assert.equal(game.aabb(a, { x: 10, y: 10, w: 28, h: 28 }), true);
  assert.equal(game.aabb(a, { x: 28, y: 0, w: 28, h: 28 }), false);
  assert.equal(game.aabb(a, { x: 40, y: 40, w: 10, h: 10 }), false);
});

test("makeTank: sizes, hp, player/enemy speeds", () => {
  const p = game.makeTank("P", 5, 5, "up", true);
  assert.equal(p.w, 28); assert.equal(p.h, 28);
  assert.equal(p.hp, 1); assert.equal(p.isPlayer, true);
  assert.equal(p.speed, 90);
  assert.equal(game.makeTank("B", 0, 0, "down", false).speed, 60);
  assert.equal(game.makeTank("F", 0, 0, "down", false).speed, 110);
  assert.equal(game.makeTank("P", 0, 0, "down", false).speed, 85);
  assert.equal(game.makeTank("A", 0, 0, "down", false).speed, 60);
});

// ---- level / state -------------------------------------------------------
test("loadLevel: map built, queue+carrier flags, fresh arrays, player at spawn with protect", () => {
  game.loadLevel(3);
  const G = game.G;
  assert.equal(G.level, 3);
  assert.equal(G.enemyQueue, LEVELS[3].enemies);
  assert.equal(G.enemyQueueCarrier.length, LEVELS[3].enemies.length);
  assert.equal(G.map.eagle.alive, true);
  assert.deepEqual(G.enemies, []);
  assert.deepEqual(G.bullets, []);
  assert.deepEqual(G.powerups, []);
  assert.equal(G.spawnCooldown, 0.5);
  assert.equal(G.starMode, false);
  assert.deepEqual(G.power, { tank: false, bullet: false });
  const p = G.player;
  assert.equal(p.x, 4 * 30 + 1);
  assert.equal(p.y, 12 * 30 + 1);
  assert.equal(p.dir, "up");
  assert.equal(p.protect, 2);
});

test("startGame: score 0, lives 3, level 0, state playing", () => {
  game.G.score = 999; game.G.lives = 1; game.G.state = "menu";
  game.startGame();
  assert.equal(game.G.score, 0);
  assert.equal(game.G.lives, 3);
  assert.equal(game.G.state, "playing");
  assert.equal(game.G.level, 0);
});

test("onKeyDown: Space starts game from menu", () => {
  clearKeys();
  game.setState("menu");
  game.onKeyDown({ key: " ", preventDefault: function () {} });
  assert.equal(game.G.state, "playing");
});

test("onKeyDown: Space returns to menu from gameover and victory", () => {
  clearKeys();
  game.startGame();
  game.setState("gameover");
  game.onKeyDown({ key: " ", preventDefault: function () {} });
  assert.equal(game.G.state, "menu");
  game.setState("victory");
  game.onKeyDown({ key: "Enter", preventDefault: function () {} });
  assert.equal(game.G.state, "menu");
});

test("onKeyDown: P toggles pause, then resumes", () => {
  clearKeys();
  game.startGame();
  game.onKeyDown({ key: "p", preventDefault: function () {} });
  assert.equal(game.G.state, "paused");
  game.onKeyDown({ key: "P", preventDefault: function () {} });
  assert.equal(game.G.state, "playing");
});

test("respawnPlayer: back to spawn, dir up, full protect, alive", () => {
  game.startGame();
  const p = game.G.player;
  p.dead = true; p.x = 5; p.y = 5; p.dir = "down"; p.protect = 0;
  game.respawnPlayer();
  assert.equal(p.dead, false);
  assert.equal(p.x, 4 * 30 + 1);
  assert.equal(p.y, 12 * 30 + 1);
  assert.equal(p.dir, "up");
  assert.equal(p.protect, 2);
});

// ---- movement ------------------------------------------------------------
test("moveAxis: border blocks, open ground moves, other tank blocks", () => {
  game.startGame();
  const p = game.G.player;
  game.G.map = emptyMap();
  p.x = 0; p.y = 0; p.dir = "up"; p.dead = false;
  assert.equal(game.moveAxis(p, -5, 0), false);
  assert.equal(p.x, 0);
  assert.equal(game.moveAxis(p, 5, 0), true);
  assert.equal(p.x, 5);
  game.G.enemies.push(game.makeTank("B", 35, 0, "down", false));
  assert.equal(game.moveAxis(p, 30, 0), false);
  assert.equal(p.x, 5);
  game.G.enemies.length = 0;
});

// ---- firing ---------------------------------------------------------------
test("firePlayer: bullet geometry, cooldown, 1-bullet cap", () => {
  game.startGame();
  const p = game.G.player;
  game.firePlayer();
  assert.equal(game.G.bullets.length, 1);
  const b = game.G.bullets[0];
  assert.equal(b.dir, "up");
  assert.equal(b.x, p.x + p.w / 2 - 2);
  assert.equal(b.y, p.y - 4);
  assert.equal(b.speed, 360);
  assert.equal(b.power, false);
  assert.equal(b.fromPlayer, true);
  assert.equal(p.fireCd, 0.3);
  game.firePlayer();
  assert.equal(game.G.bullets.length, 1);
  p.fireCd = 0;
  game.firePlayer();
  assert.equal(game.G.bullets.length, 1);
});

test("firePlayer: tank power allows 2 bullets, bullet power speeds them", () => {
  game.startGame();
  const p = game.G.player;
  game.G.power.tank = true;
  game.firePlayer();
  p.fireCd = 0;
  game.firePlayer();
  assert.equal(game.G.bullets.length, 2);

  game.G.bullets.length = 0;
  game.G.power.tank = false;
  game.G.power.bullet = true;
  p.fireCd = 0;
  game.firePlayer();
  assert.equal(game.G.bullets.length, 1);
  assert.equal(game.G.bullets[0].speed, 480);
  assert.equal(game.G.bullets[0].power, true);
});

test("updateBullets: moves bullet by dir*speed*dt, culls out-of-field", () => {
  game.startGame();
  game.G.map = emptyMap();
  const b = { x: 150, y: 200, w: 4, h: 4, dir: "right", fromPlayer: true, power: false, speed: 360 };
  game.G.bullets = [b];
  game.updateBullets(1 / 60);
  assert.equal(b.x, 156);
  b.x = 387;
  game.updateBullets(1 / 60);
  assert.equal(game.G.bullets.length, 0);
});

// ---- bullet vs tile ------------------------------------------------------
test("bulletTileHit: reports brick cell and border steel", () => {
  game.startGame();
  game.G.map = emptyMap();
  game.G.map.tiles[0][1] = "B";
  const b = { x: 31, y: 0, w: 4, h: 4, dir: "right", fromPlayer: true, power: false, speed: 360 };
  const hit = game.bulletTileHit(b);
  assert.equal(hit.kind, "brick");
  assert.deepEqual(hit.cell, [1, 0]);
  assert.equal(hit.brick, null);

  const b2 = { x: 388, y: 0, w: 4, h: 4, dir: "right", fromPlayer: true, power: false, speed: 360 };
  assert.equal(game.bulletTileHit(b2).kind, "steel");
});

test("resolveBulletHit: normal bullet dies on brick; power bullet pierces", () => {
  game.startGame();
  game.G.map = emptyMap();
  game.G.map.tiles[0][1] = "B";
  const b = { x: 31, y: 0, w: 4, h: 4, dir: "right", fromPlayer: true, power: false, speed: 360 };
  game.G.bullets = [b];
  game.resolveBulletHit(b, game.bulletTileHit(b), 0);
  assert.equal(game.G.bullets.length, 0);
  assert.equal(game.G.map.tiles[0][1], ".");
  assert.ok(game.G.fx.length >= 1);

  game.G.map.tiles[0][1] = "B";
  const b2 = { x: 31, y: 0, w: 4, h: 4, dir: "right", fromPlayer: true, power: true, speed: 480 };
  game.G.bullets = [b2];
  game.resolveBulletHit(b2, game.bulletTileHit(b2), 0);
  assert.equal(game.G.map.tiles[0][1], ".");
  assert.equal(game.G.bullets.length, 1);
});

test("resolveBulletHit: steel stops bullets; power bullet destroys S unless fort steel", () => {
  game.startGame();
  game.G.map = emptyMap();
  game.G.map.tiles[0][2] = "S";

  const b = { x: 61, y: 0, w: 4, h: 4, dir: "right", fromPlayer: true, power: false, speed: 360 };
  game.G.bullets = [b];
  game.resolveBulletHit(b, game.bulletTileHit(b), 0);
  assert.equal(game.G.bullets.length, 0);
  assert.equal(game.G.map.tiles[0][2], "S");

  const b2 = { x: 61, y: 0, w: 4, h: 4, dir: "right", fromPlayer: true, power: true, speed: 480 };
  game.G.map.steel = false;
  game.G.bullets = [b2];
  game.resolveBulletHit(b2, game.bulletTileHit(b2), 0);
  assert.equal(game.G.map.tiles[0][2], ".");
  assert.equal(game.G.bullets.length, 0);

  game.G.map.tiles[0][2] = "S";
  game.G.map.steel = true;
  const b3 = { x: 61, y: 0, w: 4, h: 4, dir: "right", fromPlayer: true, power: true, speed: 480 };
  game.G.bullets = [b3];
  game.resolveBulletHit(b3, game.bulletTileHit(b3), 0);
  assert.equal(game.G.map.tiles[0][2], "S");
  assert.equal(game.G.bullets.length, 0);
});

test("resolveBulletHit: eagle hit destroys eagle and ends game", () => {
  game.startGame();
  const b = { x: 180, y: 358, w: 4, h: 4, dir: "down", fromPlayer: true, power: false, speed: 360 };
  game.G.bullets = [b];
  const hit = game.bulletTileHit(b);
  assert.equal(hit.kind, "eagle");
  game.resolveBulletHit(b, hit, 0);
  assert.equal(game.G.map.eagle.alive, false);
  assert.equal(game.G.state, "gameover");
  assert.equal(game.G.bullets.length, 0);
});

// ---- bullet vs tank -------------------------------------------------------
test("bulletTankHit: player bullet kills enemy and scores it", () => {
  game.startGame();
  const e = game.makeTank("F", 100, 100, "down", false);
  game.G.enemies.push(e);
  const b = { x: 100, y: 100, w: 4, h: 4, dir: "up", fromPlayer: true, power: false, speed: 360 };
  const before = game.G.score;
  assert.equal(game.bulletTankHit(b), true);
  assert.equal(game.G.enemies.length, 0);
  assert.equal(game.G.score, before + 200);
});

test("bulletTankHit: enemy bullet is consumed with flash on shielded player, no damage", () => {
  game.startGame();
  const p = game.G.player;
  const e = game.makeTank("B", 10, 10, "down", false);
  const b = { x: p.x, y: p.y, w: 4, h: 4, dir: "up", fromPlayer: false, power: false, speed: 360, owner: e };
  game.G.fx.length = 0;
  assert.equal(game.bulletTankHit(b), true, "spawn-protected player consumes the bullet");
  assert.ok(!p.dead);
  assert.equal(game.G.lives, 3);
  assert.ok(game.G.fx.length >= 1, "small flash on shielded hit");
  p.protect = 0;
  assert.equal(game.bulletTankHit(b), true);
  assert.equal(p.dead, true);
  assert.equal(game.G.lives, 2);
  assert.equal(game.G.playerRespawnT, 1);
});

test("bulletTankHit: active helmet makes the player untargetable (spec: shield 15s)", () => {
  game.startGame();
  const p = game.G.player;
  p.protect = 0;
  game.G.helmetTimer = 15;
  const e = game.makeTank("B", 10, 10, "down", false);
  game.G.enemies.push(e);
  const b = { x: p.x, y: p.y, w: 4, h: 4, dir: "up", fromPlayer: false, power: false, speed: 360, owner: e };
  game.G.fx.length = 0;
  assert.equal(game.bulletTankHit(b), true, "bullet consumed by the shield");
  assert.ok(!p.dead, "player survives");
  assert.equal(game.G.lives, 3);
  assert.ok(game.G.fx.length >= 1, "flash on shielded hit");
  game.G.helmetTimer = 0;
  assert.equal(game.bulletTankHit(b), true, "once the helmet expires the bullet kills");
  assert.equal(p.dead, true);
});

test("bulletTankHit: enemy bullet with no helmet and no protect kills (regression)", () => {
  game.startGame();
  const p = game.G.player;
  p.protect = 0;
  game.G.helmetTimer = 0;
  const e = game.makeTank("B", 10, 10, "down", false);
  const b = { x: p.x, y: p.y, w: 4, h: 4, dir: "up", fromPlayer: false, power: false, speed: 360, owner: e };
  assert.equal(game.bulletTankHit(b), true);
  assert.equal(p.dead, true);
  assert.equal(game.G.lives, 2);
});

test("killEnemy: carrier drops exactly one powerup", () => {
  game.startGame();
  const carrier = game.makeTank("B", 100, 100, "down", false);
  carrier.carrier = true;
  game.G.enemies.push(carrier, game.makeTank("B", 110, 110, "down", false));
  game.killEnemy(carrier);
  assert.equal(game.G.enemies.length, 1);
  assert.equal(game.G.powerups.length, 1);
  const pu = game.G.powerups[0];
  assert.ok(["tank", "bullet", "helmet", "shovel", "star", "bomb"].includes(pu.type));
  assert.ok(pu.icon);
});

test("dropPowerup: r<0.15 star, <0.30 bomb, else common pick", () => {
  game.startGame();
  const fake = { x: 10, y: 10, kind: "B" };
  const orig = Math.random;
  try {
    Math.random = () => 0.05;
    game.dropPowerup(fake);
    assert.equal(game.G.powerups[0].type, "star");

    game.G.powerups.length = 0;
    Math.random = () => 0.2;
    game.dropPowerup(fake);
    assert.equal(game.G.powerups[0].type, "bomb");

    game.G.powerups.length = 0;
    Math.random = () => 0.5;
    game.dropPowerup(fake);
    assert.equal(game.G.powerups[0].type, "helmet");
    assert.equal(game.G.powerups[0].x, 12);
    assert.equal(game.G.powerups[0].y, 12);
    assert.equal(game.G.powerups[0].t, 0);
  } finally {
    Math.random = orig;
  }
});

// ---- powerups --------------------------------------------------------------
test("applyPowerup: +500 score, tank flag, helmet 15s, shovel 30s + fort steel, star mode", () => {
  game.startGame();
  game.applyPowerup("tank");
  assert.equal(game.G.score, 500);
  assert.equal(game.G.power.tank, true);
  game.G.helmetTimer = 0;
  game.applyPowerup("helmet");
  assert.equal(game.G.helmetTimer, 15);
  game.applyPowerup("shovel");
  assert.equal(game.G.shovelTimer, 30);
  assert.equal(game.G.map.steel, true);
  game.applyPowerup("star");
  assert.equal(game.G.starMode, true);
  assert.ok(game.G.score >= 2000);
  assert.ok(game.G.high >= game.G.score);
});

test("applyPowerup: bomb wipes all enemies and scores each", () => {
  game.startGame();
  game.G.enemies.push(game.makeTank("B", 50, 50, "down", false));
  game.G.enemies.push(game.makeTank("A", 60, 60, "down", false));
  const before = game.G.score;
  game.applyPowerup("bomb");
  assert.equal(game.G.enemies.length, 0);
  assert.equal(game.G.score, before + 500 + 100 + 400);
});

test("updatePowerups: picked up on overlap, expire after 12s", () => {
  game.startGame();
  const p = game.G.player;
  game.G.powerups.push({ type: "tank", icon: "T", x: p.x, y: p.y, t: 0 });
  game.updatePowerups(0.016);
  assert.equal(game.G.powerups.length, 0);
  assert.equal(game.G.power.tank, true);

  game.G.powerups.push({ type: "shovel", icon: "S", x: 5, y: 5, t: 11.95 });
  game.updatePowerups(0.1);
  assert.equal(game.G.powerups.length, 0);
});

// ---- staging ---------------------------------------------------------------
test("checkStageEnd: empty queue + field -> stageclear with 2.5s timer", () => {
  game.startGame();
  game.G.enemyQueue = "";
  game.G.enemies.length = 0;
  game.checkStageEnd();
  assert.equal(game.G.state, "stageclear");
  assert.equal(game.G.stageTimer, 2.5);
});

test("stageclear timeout loads next level", () => {
  game.startGame();
  game.G.enemyQueue = "";
  game.G.enemies.length = 0;
  game.checkStageEnd();
  game.G.stageTimer = 0.1;
  game.update(0.2);
  assert.equal(game.G.state, "playing");
  assert.equal(game.G.level, 1);
  assert.equal(game.G.enemyQueue, LEVELS[1].enemies);
});

test("stageclear timeout on final level -> victory and high score saved", () => {
  game.startGame();
  game.loadLevel(LEVELS.length - 1);
  game.setState("stageclear");
  game.G.stageTimer = 0.1;
  const store = stubStore();
  game.update(0.2);
  assert.equal(game.G.state, "victory");
  assert.equal(store["battlecity_highscore"], String(game.G.high));
  delete global.localStorage;
});

// ---- lives / high score ------------------------------------------------------
test("saveHigh: persists current high to localStorage", () => {
  const store = stubStore();
  game.G.high = 1234;
  game.saveHigh();
  assert.equal(store["battlecity_highscore"], "1234");
  delete global.localStorage;
});

test("killPlayer on last life: gameover state + high score persisted", () => {
  game.startGame();
  game.G.lives = 1;
  const store = stubStore();
  game.killPlayer();
  assert.equal(game.G.player.dead, true);
  assert.equal(game.G.lives, 0);
  assert.ok(game.G.state !== "gameover", "1s death anim runs before game over");
  game.update(1.0);
  assert.equal(game.G.state, "gameover");
  assert.equal(store["battlecity_highscore"], String(game.G.high));
  delete global.localStorage;
});

// ---- spawning ---------------------------------------------------------------
test("spawnLogic: spawns when cooldown passes, one per call, respects cap", () => {
  game.startGame();
  game.G.enemyQueue = "BB";
  game.G.enemyQueueCarrier = [false, false];
  game.G.spawnCooldown = 0;
  game.spawnLogic(0.016);
  assert.equal(game.G.enemies.length, 1);
  assert.equal(game.G.enemyQueue, "B");
  assert.equal(game.G.enemies[0].kind, "B");
  assert.equal(game.G.enemies[0].y, 1);
  assert.ok([1 * 30 + 1, 6 * 30 + 1, 11 * 30 + 1].includes(game.G.enemies[0].x));
  assert.ok(game.G.spawnCooldown > 0);
  game.spawnLogic(0.016);
  assert.equal(game.G.enemies.length, 1);

  game.G.enemies.length = 0;
  for (let i = 0; i < 6; i++) game.G.enemies.push(game.makeTank("B", 0, i * 30 + 1, "down", false));
  game.G.enemyQueue = "B";
  game.G.spawnCooldown = 0;
  game.spawnLogic(0.016);
  assert.equal(game.G.enemies.length, 6); // MAX_ON_FIELD cap
});

test("update smoke: 60 frames at 60fps without error, game stays playing", () => {
  clearKeys();
  game.startGame();
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  assert.equal(game.G.state, "playing");
  assert.ok(game.G.enemies.length >= 1);
  assert.ok(game.G.score >= 0);
});

// ---- armor (spec: 4 hp, white flash 100ms) ----------------------------------
test("makeTank: armor tank starts with 4 hp, others with 1", () => {
  assert.equal(game.makeTank("A", 0, 0, "down", false).hp, 4);
  assert.equal(game.makeTank("B", 0, 0, "down", false).hp, 1);
  assert.equal(game.makeTank("F", 0, 0, "down", false).hp, 1);
  assert.equal(game.makeTank("P", 0, 0, "down", false).hp, 1);
  assert.equal(game.makeTank("P", 0, 0, "up", true).hp, 1);
});

function armorTarget() {
  game.G.map = emptyMap();
  game.G.bullets = [];
  game.G.fx = [];
  game.G.score = 0;
  const e = game.makeTank("A", 150, 150, "down", false);
  game.G.enemies = [e];
  const b = { x: 154, y: 154, w: 4, h: 4, dir: "down", speed: 360, fromPlayer: true, power: false };
  game.G.bullets.push(b);
  return { e: e, b: b };
}

test("armor takes 4 hits: alive at 1 hp after 3, dies on the 4th", () => {
  const { e, b } = armorTarget();
  game.bulletTankHit(b);
  assert.equal(e.hp, 3);
  game.bulletTankHit(b);
  assert.equal(e.hp, 2);
  game.bulletTankHit(b);
  assert.equal(e.hp, 1);
  assert.equal(game.G.enemies.length, 1, "still alive at 1 hp");
  game.bulletTankHit(b);
  assert.equal(game.G.enemies.length, 0, "destroyed on 4th hit");
  assert.equal(game.G.score, 400);
});

test("hitFlash: damaged armor carries a 100ms flash that the enemy update decays", () => {
  const { e, b } = armorTarget();
  game.bulletTankHit(b);
  assert.ok(Math.abs(e.flash - 0.1) < 1e-9, "100ms flash timer set on hit");
  game.updateEnemies(0.05);
  assert.ok(Math.abs(e.flash - 0.05) < 1e-9, "decays with dt");
  game.updateEnemies(0.2);
  assert.equal(e.flash, 0, "clamped at 0");
});

// ---- spec drift fixes ------------------------------------------------------
test("spawnEnemy: enemies get 1000ms spawn protect, untargetable until gone", () => {
  game.startGame();
  const e = game.makeTank("B", 100, 100, "down", false);
  e.protect = 1;
  game.G.enemies = [e];
  const b = { x: 104, y: 104, w: 4, h: 4, dir: "down", speed: 360, fromPlayer: true, power: false };
  const hp = e.hp;
  assert.equal(game.bulletTankHit(b), true, "bullet consumed by spawn shield");
  assert.equal(e.hp, hp, "no damage while protected");
  assert.equal(game.G.enemies.length, 1, "still alive");
  game.updateEnemies(1.05);
  assert.equal(e.protect, 0, "protect decays to 0 after ~1s");
  assert.equal(game.bulletTankHit(b), true);
  assert.equal(e.hp, hp - 1, "damageable once protect is gone");
});

test("retarget: star mode 60% down / 25% toward player / 15% toward fort", () => {
  game.startGame();
  game.G.map = emptyMap();
  game.G.starMode = true;
  // Enemy at tile (0,11) -> center (15,345). Player at (0,0) -> (15,15) is "up".
  // Fort (195,375): dx=180, dy=30 -> "right". Three distinct buckets.
  const e = game.makeTank("B", 1, 331, "down", false);
  const p = game.G.player;
  p.x = 1; p.y = 1; p.dead = false;
  const orig = Math.random;
  try {
    Math.random = () => 0.5;   // r < 0.60
    game.retarget(e);
    assert.equal(e.dir, "down", "star: 60% bucket -> down");
    Math.random = () => 0.7;   // 0.60 <= r < 0.85
    game.retarget(e);
    assert.equal(e.dir, "up", "star: 25% bucket -> toward player");
    Math.random = () => 0.95;  // r >= 0.85
    game.retarget(e);
    assert.equal(e.dir, "right", "star: 15% bucket -> toward fort");
  } finally { Math.random = orig; game.G.starMode = false; }
});

test("retarget: normal mode keeps 50% same / 25% down / 25% random", () => {
  game.startGame();
  game.G.map = emptyMap();
  game.G.starMode = false;
  const e = game.makeTank("B", 150, 150, "up", false);
  const orig = Math.random;
  try {
    Math.random = () => 0.4; // < 0.5 same dir
    game.retarget(e);
    assert.equal(e.dir, "up", "normal: 50% bucket -> keep dir");
    Math.random = () => 0.6; // 0.5-0.75 down
    game.retarget(e);
    assert.equal(e.dir, "down", "normal: 25% bucket -> down");
    Math.random = () => 0.99; // >= 0.75 random (pick index 3 -> right)
    game.retarget(e);
    assert.equal(e.dir, "right", "normal: 25% bucket -> random pick");
  } finally { Math.random = orig; }
});

test("spawnEnemy: rotates west->center->east, 2.5s interval, fresh protect+fireCd", () => {
  game.startGame();
  game.G.map = emptyMap();
  const xs = [];
  for (let i = 0; i < 3; i++) {
    game.G.enemies.length = 0;
    game.G.bullets.length = 0;
    game.G.spawnCooldown = 0;
    game.spawnLogic(0.016);
    const e = game.G.enemies[0];
    xs.push(e.x);
    assert.ok(e.protect > 0.99, "spawned enemy has ~1s protect");
    assert.ok(e.fireCd > 1.19, "spawned enemy starts with 1.2s fire cooldown");
    assert.ok(Math.abs(game.G.spawnCooldown - 2.5) < 1e-9, "interval reset to 2.5s");
  }
  assert.equal(xs[0], 1 * 30 + 1, "1st spawn west");
  assert.equal(xs[1], 6 * 30 + 1, "2nd spawn center");
  assert.equal(xs[2], 11 * 30 + 1, "3rd spawn east");
});

test("updateEnemies: fire is decided only at the AI turn, cooldown reset to 1.2s", () => {
  game.startGame();
  game.G.map = emptyMap();
  game.G.starMode = false;
  const e = game.makeTank("B", 150, 100, "down", false);
  e.aiTimer = 1.0;   // no turn this tick
  e.fireCd = 0;      // cooldown ready
  game.G.enemies = [e];
  game.G.bullets.length = 0;
  const orig = Math.random;
  try {
    Math.random = () => 0; // would fire if checked mid-tick
    game.updateEnemies(1 / 60);
    assert.equal(game.G.bullets.length, 0, "no mid-tick fire between AI turns");
    e.aiTimer = 0; // this tick is a turn
    Math.random = () => 0; // roll 0 < 0.6 -> fires
    game.updateEnemies(1 / 60);
    assert.equal(game.G.bullets.length, 1, "fires at the turn");
    assert.ok(Math.abs(e.fireCd - 1.2) < 1e-9, "cooldown reset to 1.2s");
    assert.equal(game.G.bullets[0].owner, e);
  } finally { Math.random = orig; }
});

test("killPlayer at 0 lives: ~1s death anim, then game over with overReason", () => {
  game.startGame();
  game.G.lives = 1;
  game.G.enemyQueue = "";
  game.G.enemies.length = 0;
  const p = game.G.player;
  p.protect = 0;
  game.G.helmetTimer = 0;
  game.killPlayer();
  assert.equal(p.dead, true);
  assert.ok(game.G.state !== "gameover", "not over instantly");
  game.update(0.6);
  assert.ok(game.G.state !== "gameover", "still playing during the 1s death anim");
  game.update(0.5);
  assert.equal(game.G.state, "gameover", "over after ~1s");
  assert.equal(game.G.overReason, "lives");
});

