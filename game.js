(function () {
  "use strict";

  var canvas = null, ctx = null; // set in boot()
  var TILE = Grid.TILE, FIELD = Grid.FIELD;

  // ---- constants -------------------------------------------------------
  var TANK = 28, BULLET = 4;
  var PLAYER_SPEED = 90, PLAYER_SPEED_POWER = 112;
  var BULLET_SPEED = 360, POWER_BULLET_SPEED = 480;
  var ENEMY_SPEED = { B: 60, F: 110, P: 85, A: 60 };
  var ENEMY_SCORE = { B: 100, F: 200, P: 300, A: 400 };
  var POWERUP_LIFE = 12, HELMET_LIFE = 15, SHOVEL_LIFE = 30, SPAWN_PROTECT = 2;
  var MAX_ON_FIELD = 6;
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  var COLORS = {
    bg: "#000000",
    brickA: "#b5651d", brickB: "#8a4a12",
    steelA: "#aeb6bd", steelB: "#6a7278", steelC: "#d3d9df",
    riverA: "#173f7a", riverB: "#2f6fd0",
    treeA: "#2e7d32", treeB: "#43a047",
    player: "#ffd94f",
    enemy: { B: "#9aa0a6", F: "#c9ced3", P: "#eef0f2", A: "#ff8c1a" },
    bullet: "#ffffff", powerBullet: "#ffe94f",
    shield: "#6fc3ff",
    box: "#ffd94f", boxText: "#2b2b2b",
    eagleA: "#c9ced3", eagleB: "#7d838a"
  };

  // ---- state -----------------------------------------------------------
  var G = {
    state: "menu",              // menu | playing | paused | stageclear | gameover | victory
    level: 0, map: null,
    player: null,
    enemies: [], bullets: [], powerups: [], fx: [],
    score: 0, high: 0, lives: 3,
    enemyQueue: "", spawnCooldown: 0, spawnSlot: 0,
    stageTimer: 0,     starMode: false, pendingOver: 0, overReason: null,
    helmetTimer: 0, shovelTimer: 0,
    power: { tank: false, bullet: false },
    shake: 0, fade: 0
  };
  try { G.high = parseInt(localStorage.getItem("battlecity_highscore") || "0", 10) || 0; } catch (e) {}

  var keys = {};
  var overlay = { el: null, title: null, sub: null, hint: null };
  var hud = { enemies: null, stage: null, lives: null, score: null, high: null };
  var hudCache = { enemies: -1, lives: -1, score: null, high: null, stage: null };

  // ---- helpers ---------------------------------------------------------
  function cx(i) { return i * TILE + 1; }          // tile-index -> tank px (1px inset)
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---- level setup -----------------------------------------------------
  function makeTank(kind, x, y, dir, isPlayer) {
    return {
      kind: kind, x: x, y: y, w: TANK, h: TANK,
      dir: dir, speed: isPlayer ? PLAYER_SPEED : ENEMY_SPEED[kind],
      hp: kind === "A" ? 4 : 1, isPlayer: !!isPlayer,
      protect: 0, fireCd: 0, aiTimer: 0, moving: false,
      flash: 0, muzzle: 0, tread: 0, pop: 0.18
    };
  }

  function loadLevel(i) {
    G.level = i;
    G.map = Grid.buildMap(LEVELS[i]);
    G.enemyQueue = LEVELS[i].enemies;
    G.enemyQueueCarrier = G.enemyQueue.split("").map(function () { return Math.random() < 0.5; });
    G.enemies = []; G.bullets = []; G.powerups = []; G.fx = [];
    G.starMode = false; G.helmetTimer = 0; G.shovelTimer = 0;
    G.power = { tank: false, bullet: false };
    G.spawnCooldown = 0.5;
    G.spawnSlot = 0; G.pendingOver = 0; G.overReason = null;
    G.player = makeTank("P", cx(Grid.PLAYER_SPAWN[0]), cx(Grid.PLAYER_SPAWN[1]), "up", true);
    G.player.protect = SPAWN_PROTECT;
    G.fade = 1;
  }

  function startGame() {
    G.score = 0; G.lives = 3;
    loadLevel(0);
    setState("playing");
  }

  // ---- state machine ---------------------------------------------------
  function setState(s) {
    G.state = s;
    updateOverlay();
  }
  function updateOverlay() {
    if (!overlay.title) return; // not booted (headless/Node)
    var t = "", sub = "", hint = "";
    if (G.state === "menu") {
      t = "BATTLE CITY";
      sub = "Stage " + (G.level + 1) + " of " + LEVELS.length;
      hint = "arrows: move   space: fire   P: pause\npress ENTER to start";
    } else if (G.state === "paused") {
      t = "PAUSED"; hint = "press P to resume";
    } else if (G.state === "stageclear") {
      t = "STAGE CLEAR"; sub = "score " + G.score;
      hint = "next stage...";
    } else if (G.state === "gameover") {
      t = "GAME OVER";
      sub = (G.overReason === "fort" ? "BASE DESTROYED" : "OUT OF LIVES") +
        "\nscore " + G.score + "   high " + G.high +
        (G.score > 0 && G.score >= G.high ? "\nNEW HIGH SCORE?" : "");
      hint = "press ENTER for menu";
    } else if (G.state === "victory") {
      t = "VICTORY!"; sub = "all " + LEVELS.length + " stages clear";
      hint = "final score " + G.score + "   high " + G.high + "\npress ENTER for menu";
    }
    overlay.title.textContent = t;
    overlay.sub.textContent = sub;
    overlay.hint.textContent = hint;
    overlay.el.classList.toggle("hidden", G.state === "playing");
  }

  // ---- input -----------------------------------------------------------
  var KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right"
  };
  function onKeyDown(e) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) !== -1) e.preventDefault();
    keys[e.key] = true;
    var dir = KEYMAP[e.key];
    if (dir) { if (G.player && G.state === "playing") G.player.dir = dir; }
    if (e.key === " " || e.key === "Enter") {
      if (G.state === "menu") startGame();
      else if (G.state === "gameover" || G.state === "victory") setState("menu");
      else if (G.state === "playing") firePlayer();
    }
    if ((e.key === "p" || e.key === "P" || e.key === "Escape") &&
        (G.state === "playing" || G.state === "paused"))
      setState(G.state === "playing" ? "paused" : "playing");
    if (e.key === "m" || e.key === "M") Sfx.toggleMute();
  }
  function onKeyUp(e) { keys[e.key] = false; }

  // ---- player ----------------------------------------------------------
  var DIRKEYS = { up: ["ArrowUp", "w", "W"], down: ["ArrowDown", "s", "S"], left: ["ArrowLeft", "a", "A"], right: ["ArrowRight", "d", "D"] };

  function keyHeld(dir) {
    var ks = DIRKEYS[dir];
    for (var i = 0; i < ks.length; i++) if (keys[ks[i]]) return true;
    return false;
  }

  function allTanks() {
    var arr = G.enemies.slice();
    if (G.player && !G.player.dead) arr.push(G.player);
    return arr;
  }

  function moveAxis(t, dx, dy) {
    var nx = t.x + dx, ny = t.y + dy;
    if (!Grid.canMoveTank(G.map, nx, ny, t.w, t.h)) return false;
    var box = { x: nx, y: ny, w: t.w, h: t.h };
    var tanks = allTanks();
    for (var i = 0; i < tanks.length; i++) {
      var o = tanks[i];
      if (o === t) continue;
      if (aabb(box, o)) return false;
    }
    t.x = nx; t.y = ny;
    return true;
  }

  function respawnPlayer() {
    var p = G.player;
    p.x = cx(Grid.PLAYER_SPAWN[0]); p.y = cx(Grid.PLAYER_SPAWN[1]);
    p.dir = "up"; p.dead = false; p.protect = SPAWN_PROTECT;
    p.pop = 0.18; p.muzzle = 0;
  }

  function updatePlayer(dt) {
    var p = G.player;
    if (!p) return;
    if (p.dead) {
      if (G.lives > 0) {
        G.playerRespawnT = (G.playerRespawnT || 0) - dt;
        if (G.playerRespawnT <= 0) respawnPlayer();
      }
      return;
    }
    if (!keyHeld(p.dir)) return;
    var sp = G.power.tank ? PLAYER_SPEED_POWER : PLAYER_SPEED;
    var dx = DIRS[p.dir][0] * sp * dt, dy = DIRS[p.dir][1] * sp * dt;
    var moved = false;
    if (dx && moveAxis(p, dx, 0)) moved = true;
    if (dy && moveAxis(p, 0, dy)) moved = true;
    if (moved) p.tread += sp * dt;
  }

  function firePlayer() {
    var p = G.player;
    if (!p || p.dead || G.state !== "playing") return;
    if (p.fireCd > 0) return;
    var maxB = G.power.tank ? 2 : 1, count = 0;
    for (var i = 0; i < G.bullets.length; i++) if (G.bullets[i].fromPlayer) count++;
    if (count >= maxB) return;
    var bx = p.x, by = p.y;
    if (p.dir === "up") { bx = p.x + p.w / 2 - 2; by = p.y - 4; }
    else if (p.dir === "down") { bx = p.x + p.w / 2 - 2; by = p.y + p.h; }
    else if (p.dir === "left") { bx = p.x - 4; by = p.y + p.h / 2 - 2; }
    else { bx = p.x + p.w; by = p.y + p.h / 2 - 2; }
    G.bullets.push({ x: bx, y: by, w: BULLET, h: BULLET, dir: p.dir, fromPlayer: true,
                      power: G.power.bullet, speed: G.power.bullet ? POWER_BULLET_SPEED : BULLET_SPEED });
    p.fireCd = 0.3; p.muzzle = 0.08;
    Sfx.play("shoot");
  }

  // ---- bullets ----------------------------------------------------------
  function leadingPts(b) {
    if (b.dir === "up") return [[b.x + 1, b.y], [b.x + 3, b.y]];
    if (b.dir === "down") return [[b.x + 1, b.y + b.h - 1], [b.x + 3, b.y + b.h - 1]];
    if (b.dir === "left") return [[b.x, b.y + 1], [b.x, b.y + 3]];
    return [[b.x + b.w - 1, b.y + 1], [b.x + b.w - 1, b.y + 3]];
  }

  function bulletTileHit(b) {
    var pts = leadingPts(b);
    for (var i = 0; i < pts.length; i++) {
      var tx = Math.floor(pts[i][0] / TILE), ty = Math.floor(pts[i][1] / TILE);
      if (tx < 0 || ty < 0 || tx > 12 || ty > 12) return { kind: "steel" }; // border
      var h = Grid.bulletHits(G.map, tx, ty);
      if (h) { h.cell = [tx, ty]; return h; }
    }
    return null;
  }

  function destroyTile(tx, ty, hit, b) {
    if (hit.brick) hit.brick.broken = true;
    else G.map.tiles[ty][tx] = ".";
  }

  function resolveBulletHit(b, hit, idx) {
    if (hit.kind === "eagle") {
      G.bullets.splice(idx, 1);
      destroyEagle();
      return;
    }
    if (hit.kind === "brick") {
      destroyTile(hit.cell[0], hit.cell[1], hit, b);
      addFx(hit.cell[0] * TILE + TILE / 2, hit.cell[1] * TILE + TILE / 2, "small");
      Sfx.play("brick_break");
      if (!b.power) G.bullets.splice(idx, 1);
      return; // power bullet pierces brick
    }
    // steel
    Sfx.play("steel_hit");
    if (b.power && !G.map.steel && Grid.tileAt(G.map, hit.cell[0], hit.cell[1]) === "S") {
      G.map.tiles[hit.cell[1]][hit.cell[0]] = ".";
      addFx(hit.cell[0] * TILE + TILE / 2, hit.cell[1] * TILE + TILE / 2, "small");
      Sfx.play("brick_break");
    }
    G.bullets.splice(idx, 1);
  }

  function bulletTankHit(b) {
    if (b.fromPlayer) {
      for (var i = 0; i < G.enemies.length; i++) {
        var e = G.enemies[i];
        if (!aabb(b, e)) continue;
        if (e.protect > 0) { addFx(b.x + b.w / 2, b.y + b.h / 2, "small"); return true; }
        e.hp--; hitFlash(e);
        if (e.hp <= 0) killEnemy(e);
        return true;
      }
    } else {
      var p = G.player;
      if (p && !p.dead && aabb(b, p)) {
        if (p.protect > 0 || G.helmetTimer > 0) { addFx(b.x + b.w / 2, b.y + b.h / 2, "small"); return true; }
        killPlayer();
        return true;
      }
    }
    return false;
  }

  function hitFlash(e) { e.flash = 0.1; }

  function updateBullets(dt) {
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      b.x += DIRS[b.dir][0] * b.speed * dt;
      b.y += DIRS[b.dir][1] * b.speed * dt;
      if (b.x < 0 || b.y < 0 || b.x + b.w > FIELD || b.y + b.h > FIELD) { G.bullets.splice(i, 1); continue; }
      var hit = bulletTileHit(b);
      if (hit) { resolveBulletHit(b, hit, i); continue; }
      if (bulletTankHit(b)) { G.bullets.splice(i, 1); continue; }
    }
  }

  function killPlayer() {
    var p = G.player;
    p.dead = true;
    addFx(p.x + p.w / 2, p.y + p.h / 2, "big");
    Sfx.play("explode_small");
    G.lives--;
    if (G.lives <= 0) { G.overReason = "lives"; G.pendingOver = 1; return; }
    G.playerRespawnT = 1;
  }

  function destroyEagle() {
    G.map.eagle.alive = false;
    addFx(6 * TILE + TILE / 2, 12 * TILE + TILE / 2, "big");
    Sfx.play("fort_destroy");
    G.overReason = "fort";
    gameOver();
  }

  // ---- enemies (part 3) ------------------------------------------------
  function spawnEnemy() {
    var kind = G.enemyQueue.charAt(0);
    var sx = null, box, clash;
    var tanks = allTanks();
    for (var k = 0; k < 3; k++) {
      var pt = Grid.SPAWNS[(G.spawnSlot + k) % 3];
      box = { x: cx(pt[0]), y: cx(pt[1]), w: TANK, h: TANK };
      clash = false;
      for (var i = 0; i < tanks.length; i++) if (aabb(box, tanks[i])) { clash = true; break; }
      if (!clash) { G.spawnSlot = (G.spawnSlot + k + 1) % 3; sx = box.x; break; }
    }
    if (sx === null) return; // all spawn points blocked; retry next tick
    G.enemyQueue = G.enemyQueue.slice(1);
    var carrier = G.enemyQueueCarrier.shift() || false;
    var e = makeTank(kind, sx, box.y, "down", false);
    e.carrier = carrier;
    e.aiTimer = rand(0.3, 1.0);
    e.protect = 1.0;   // 1000ms spawn shield
    e.fireCd = 1.2;
    G.enemies.push(e);
    return true;
  }

  function canGo(e, dir) {
    var dx = DIRS[dir][0] * 6, dy = DIRS[dir][1] * 6;
    return Grid.canMoveTank(G.map, e.x + dx, e.y + dy, TANK, TANK);
  }

  function fortTarget() { return { x: 6 * TILE + 15, y: 12 * TILE + 15 }; }
  function playerTarget() {
    var pl = G.player;
    return (pl && !pl.dead) ? { x: pl.x + 14, y: pl.y + 14 } : fortTarget();
  }
  function towardDir(e, t) {
    var dx = t.x - (e.x + 14), dy = t.y - (e.y + 14);
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  }

  function retarget(e) {
    var r = Math.random(), want;
    if (G.starMode) {
      if (r < 0.60) want = "down";
      else if (r < 0.85) want = towardDir(e, playerTarget());
      else want = towardDir(e, fortTarget());
    } else {
      if (r < 0.5) want = e.dir;
      else if (r < 0.75) want = "down";
      else want = pick(["up", "down", "left", "right"]);
    }
    if (!canGo(e, want)) {
      var opts = [];
      var all = ["up", "down", "left", "right"];
      for (var i = 0; i < 4; i++) if (all[i] !== want && canGo(e, all[i])) opts.push(all[i]);
      if (opts.length) want = pick(opts);
    }
    e.dir = want;
  }

  function fireEnemy(e) {
    for (var i = 0; i < G.bullets.length; i++)
      if (!G.bullets[i].fromPlayer && G.bullets[i].owner === e) return; // 1 bullet per enemy
    var bx, by;
    if (e.dir === "up") { bx = e.x + e.w / 2 - 2; by = e.y - 4; }
    else if (e.dir === "down") { bx = e.x + e.w / 2 - 2; by = e.y + e.h; }
    else if (e.dir === "left") { bx = e.x - 4; by = e.y + e.h / 2 - 2; }
    else { bx = e.x + e.w; by = e.y + e.h / 2 - 2; }
    var sp = (e.kind === "P" ? POWER_BULLET_SPEED : BULLET_SPEED);
    if (G.starMode) sp *= 1.5;
    G.bullets.push({ x: bx, y: by, w: BULLET, h: BULLET, dir: e.dir, fromPlayer: false,
                     power: false, speed: sp, owner: e });
    e.fireCd = 1.2; e.muzzle = 0.08;
    Sfx.play("shoot");
  }

  function updateEnemies(dt) {
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      e.fireCd = Math.max(0, (e.fireCd || 0) - dt);
      e.flash = Math.max(0, (e.flash || 0) - dt);
      e.protect = Math.max(0, (e.protect || 0) - dt);
      e.muzzle = Math.max(0, (e.muzzle || 0) - dt);
      e.pop = Math.max(0, (e.pop || 0) - dt);
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        retarget(e);
        if (e.fireCd <= 0 && Math.random() < 0.6) fireEnemy(e);
        e.fireCd = 1.2;
        e.aiTimer = G.starMode ? rand(0.4, 0.9) : rand(0.8, 2.0);
      }
      var dx = DIRS[e.dir][0] * e.speed * dt, dy = DIRS[e.dir][1] * e.speed * dt;
      var moved = false;
      if (dx && moveAxis(e, dx, 0)) moved = true;
      if (dy && moveAxis(e, 0, dy)) moved = true;
      if (moved) e.tread += e.speed * dt;
      if (!moved) e.aiTimer = Math.min(e.aiTimer, 0.15);
    }
  }

  // ---- powerups (part 4) ----------------------------------------------
  var PUP_ICON = { tank: "T", bullet: "B", helmet: "H", shovel: "S", star: "\u2605", bomb: "\u2622" };

  function dropPowerup(e) {
    var r = Math.random();
    var type;
    if (r < 0.15) type = "star";
    else if (r < 0.30) type = "bomb";
    else type = pick(["tank", "bullet", "helmet", "shovel"]);
    G.powerups.push({ type: type, icon: PUP_ICON[type], x: e.x + 2, y: e.y + 2, t: 0 });
  }

  function applyPowerup(type) {
    G.score += 500;
    if (G.score > G.high) G.high = G.score;
    if (type === "tank") G.power.tank = true;
    else if (type === "bullet") G.power.bullet = true;
    else if (type === "helmet") G.helmetTimer = Math.max(G.helmetTimer, HELMET_LIFE);
    else if (type === "shovel") { Grid.setFortSteel(G.map, true); G.shovelTimer = Math.max(G.shovelTimer, SHOVEL_LIFE); }
    else if (type === "star") { G.starMode = true; Sfx.play("star"); return; }
    else if (type === "bomb") {
      for (var i = G.enemies.length - 1; i >= 0; i--) {
        var e = G.enemies[i];
        G.enemies.splice(i, 1);
        addFx(e.x + 14, e.y + 14, "small");
        G.score += ENEMY_SCORE[e.kind];
      }
      if (G.score > G.high) G.high = G.score;
      Sfx.play("explode_big");
      return;
    }
    Sfx.play("powerup");
  }

  function updatePowerups(dt) {
    for (var i = G.powerups.length - 1; i >= 0; i--) {
      var p = G.powerups[i];
      p.t += dt;
      if (p.t > POWERUP_LIFE) { G.powerups.splice(i, 1); continue; }
      var pl = G.player;
      if (pl && !pl.dead && aabb({ x: p.x, y: p.y, w: 24, h: 24 }, pl)) {
        G.powerups.splice(i, 1);
        applyPowerup(p.type);
      }
    }
  }

  // ---- effects ---------------------------------------------------------
  function addFx(x, y, type) {
    G.fx.push({ x: x, y: y, t: 0, type: type, seed: (Math.random() * 100000) | 0 });
    if (type === "big") G.shake = 0.09;
  }
  function updateFx(dt) {
    for (var i = G.fx.length - 1; i >= 0; i--) { G.fx[i].t += dt; if (G.fx[i].t > 0.4) G.fx.splice(i, 1); }
  }

  // ---- update ----------------------------------------------------------
  function update(dt) {
    G.shake = Math.max(0, G.shake - dt);
    G.fade = Math.max(0, G.fade - dt * 4);
    if (G.state !== "playing") {
      if (G.state === "stageclear") {
        G.stageTimer -= dt;
        if (G.stageTimer <= 0) {
          if (G.level + 1 < LEVELS.length) { loadLevel(G.level + 1); setState("playing"); }
          else { saveHigh(); setState("victory"); }
        }
      }
      return;
    }
    if (G.pendingOver > 0) {
      G.pendingOver -= dt;
      updateFx(dt);
      if (G.pendingOver <= 0) gameOver();
      return;
    }
    if (G.player) {
      G.player.protect = Math.max(0, G.player.protect - dt);
      G.player.fireCd = Math.max(0, G.player.fireCd - dt);
      G.player.muzzle = Math.max(0, (G.player.muzzle || 0) - dt);
      G.player.pop = Math.max(0, (G.player.pop || 0) - dt);
    }
    if (G.helmetTimer > 0) G.helmetTimer = Math.max(0, G.helmetTimer - dt);
    if (G.shovelTimer > 0) {
      G.shovelTimer = Math.max(0, G.shovelTimer - dt);
      if (G.shovelTimer <= 0) Grid.setFortSteel(G.map, false);
    }
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePowerups(dt);
    updateFx(dt);
    spawnLogic(dt);
    checkStageEnd();
  }

  // spawn enemies up to MAX_ON_FIELD
  function spawnLogic(dt) {
    G.spawnCooldown -= dt;
    if (G.spawnCooldown <= 0 && G.enemyQueue.length > 0 && G.enemies.length < MAX_ON_FIELD) {
      G.spawnCooldown = spawnEnemy() ? 2.5 : 0.3;   // 2.5s interval; quick retry if all points blocked
    }
  }

  function checkStageEnd() {
    if (G.enemyQueue.length === 0 && G.enemies.length === 0 && G.pendingOver <= 0 && G.state === "playing") {
      G.stageTimer = 2.5;
      setState("stageclear");
      Sfx.play("stage_clear");
    }
  }

  function killEnemy(e) {
    var i = G.enemies.indexOf(e);
    if (i === -1) return;
    var carrier = e.carrier;
    G.enemies.splice(i, 1);
    addFx(e.x + e.w / 2, e.y + e.h / 2, (e.kind === "A" || e.kind === "P") ? "big" : "small");
    Sfx.play("explode_small");
    G.score += ENEMY_SCORE[e.kind];
    if (G.score > G.high) G.high = G.score;
    if (carrier) dropPowerup(e);
  }

  function saveHigh() {
    try { localStorage.setItem("battlecity_highscore", String(G.high)); } catch (e) {}
  }

  function gameOver() {
    if (G.state !== "playing") return;
    saveHigh(); setState("gameover"); Sfx.play("game_over");
  }

  // ---- render ----------------------------------------------------------
  function render() {
    ctx.save();
    if (G.shake > 0) {
      ctx.translate(
        Math.round((Math.random() * 2 - 1) * G.shake * 24),
        Math.round((Math.random() * 2 - 1) * G.shake * 24)
      );
    }
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, FIELD, FIELD);
    drawTiles(false);
    drawFort();
    drawPowerups();
    drawTanks();
    drawBullets();
    drawTrees();
    drawFx();
    ctx.restore();
    if (G.fade > 0) {
      ctx.fillStyle = "rgba(0,0,0," + Math.min(1, G.fade) + ")";
      ctx.fillRect(0, 0, FIELD, FIELD);
    }
  }

  function tileCh(x, y) {
    if (!G.map) return ".";
    return Grid.tileAt(G.map, x, y);
  }

  function drawTiles(includeTrees) {
    if (!G.map) return;
    for (var y = 0; y < 13; y++) for (var x = 0; x < 13; x++) {
      var ch = tileCh(x, y), px = x * TILE, py = y * TILE;
      if (ch === "B" && !includeTrees) drawBrick(px, py);
      else if (ch === "S" && !includeTrees) drawSteel(px, py);
      else if (ch === "R" && !includeTrees) drawRiver(px, py);
      else if (ch === "T" && includeTrees) drawTree(px, py);
    }
  }

  function drawBrick(px, py) {
    ctx.fillStyle = COLORS.brickB; ctx.fillRect(px, py, TILE, TILE); // mortar
    ctx.fillStyle = COLORS.brickA;
    for (var r = 0; r < 3; r++) {
      var y = py + r * 10 + 1;
      if (r === 1) {
        ctx.fillRect(px + 1, y, 7, 8); ctx.fillRect(px + 9, y, 13, 8); ctx.fillRect(px + 24, y, 5, 8);
      } else {
        ctx.fillRect(px + 1, y, 13, 8); ctx.fillRect(px + 16, y, 13, 8);
      }
    }
  }
  function drawSteel(px, py) {
    ctx.fillStyle = COLORS.steelB; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.steelA; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = COLORS.steelC; ctx.fillRect(px + 2, py + 2, TILE - 4, 3); ctx.fillRect(px + 2, py + 2, 3, TILE - 4);
    ctx.fillStyle = COLORS.steelB; ctx.fillRect(px + 2, py + TILE - 5, TILE - 4, 3); ctx.fillRect(px + TILE - 5, py + 2, 3, TILE - 4);
    ctx.fillStyle = COLORS.steelC; ctx.fillRect(px + 13, py + 13, 4, 4);
  }
  function drawRiver(px, py) {
    ctx.fillStyle = COLORS.riverA; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.riverB;
    var ph = (performance.now() * 0.02) % 30;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
    for (var r = 0; r < 3; r++) {
      for (var j = 0; j < 2; j++) {
        var lane = j * 15 + (r % 2) * 7 + ph;
        var n0 = Math.floor((px - 9 - lane) / 30);
        for (var m = 0; m < 3; m++) {
          var xg = lane + (n0 + m) * 30;
          if (xg + 9 > px && xg < px + TILE) ctx.fillRect(xg, py + r * 10 + 4, 9, 2);
        }
      }
    }
    ctx.restore();
  }
  var TREE_BLOBS = [
    [1, 1, 10, 6], [14, 2, 9, 7], [24, 1, 5, 8],
    [2, 10, 8, 7], [13, 9, 9, 8], [23, 9, 6, 9],
    [1, 19, 9, 7], [12, 18, 10, 7], [23, 18, 6, 9],
    [4, 27, 10, 2], [16, 27, 9, 2]
  ];
  function drawTree(px, py) {
    ctx.fillStyle = COLORS.treeA; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.treeB;
    for (var i = 0; i < TREE_BLOBS.length; i++) {
      var b = TREE_BLOBS[i];
      ctx.fillRect(px + b[0], py + b[1], b[2], b[3]);
    }
  }

  function drawFort() {
    if (!G.map) return;
    for (var i = 0; i < G.map.bricks.length; i++) {
      var b = G.map.bricks[i];
      if (b.broken) continue;
      if (G.map.steel) drawSteel(b.x * TILE, b.y * TILE);
      else drawBrick(b.x * TILE, b.y * TILE);
    }
    if (G.map.eagle.alive) drawEagle();
  }
  function drawEagle() {
    var x = 6 * TILE, y = 12 * TILE;
    var A = COLORS.eagleA, B = COLORS.eagleB;
    ctx.fillStyle = B; ctx.fillRect(x + 4, y + 22, TILE - 8, 8);   // plinth
    ctx.fillStyle = A; ctx.fillRect(x + 6, y + 22, TILE - 12, 2);
    ctx.fillStyle = B;                                             // wings
    ctx.fillRect(x + 2, y + 14, 8, 8);
    ctx.fillRect(x + TILE - 10, y + 14, 8, 8);
    ctx.fillStyle = A;
    ctx.fillRect(x + 3, y + 15, 3, 6); ctx.fillRect(x + TILE - 6, y + 15, 3, 6);
    ctx.fillStyle = A; ctx.fillRect(x + 9, y + 10, TILE - 18, 13); // body
    ctx.fillStyle = B; ctx.fillRect(x + 9, y + 20, TILE - 18, 3);
    ctx.fillStyle = A; ctx.fillRect(x + 11, y + 2, 8, 9);          // head
    ctx.fillStyle = "#e0a33c"; ctx.fillRect(x + 13, y + 5, 4, 3);  // beak
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(x + 12, y + 3, 2, 2); ctx.fillRect(x + 16, y + 3, 2, 2); // eyes
  }

  function drawTank(t) {
    var C = t.isPlayer ? COLORS.player : COLORS.enemy[t.kind] || COLORS.enemy.B;
    if (t.flash > 0) C = "#ffffff";
    var s = (t.pop && t.pop > 0) ? 0.75 + 0.25 * (1 - t.pop / 0.18) : 1;
    ctx.save();
    ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
    if (s !== 1) ctx.scale(s, s);
    var rot = t.dir === "up" ? 0 : t.dir === "right" ? Math.PI / 2 : t.dir === "down" ? Math.PI : -Math.PI / 2;
    ctx.rotate(rot);
    // treads (scrolling)
    var pitch = 5, ph0 = (t.tread || 0) % pitch;
    ctx.fillStyle = "#3a3f45";
    ctx.fillRect(-t.w / 2, -t.h / 2, 6, t.h);
    ctx.fillRect(t.w / 2 - 6, -t.h / 2, 6, t.h);
    ctx.fillStyle = "#565d66";
    for (var yy = -t.h / 2 - pitch + ph0; yy < t.h / 2; yy += pitch) {
      var y0 = Math.max(yy, -t.h / 2 + 1), y1 = Math.min(yy + 2, t.h / 2 - 1);
      if (y1 > y0) {
        ctx.fillRect(-t.w / 2 + 1, y0, 4, y1 - y0);
        ctx.fillRect(t.w / 2 - 5, y0, 4, y1 - y0);
      }
    }
    // body with shading
    ctx.fillStyle = C;
    ctx.fillRect(-t.w / 2 + 6, -t.h / 2 + 3, t.w - 12, t.h - 6);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(-t.w / 2 + 6, -t.h / 2 + 3, t.w - 12, 2);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-t.w / 2 + 6, t.h / 2 - 5, t.w - 12, 2);
    // turret + barrel (recoil)
    var rec = t.muzzle > 0 ? 3 : 0;
    ctx.fillStyle = shade(C);
    ctx.fillRect(-4, -6, 8, 12);
    ctx.fillRect(-2, -t.h / 2 + rec, 4, t.h / 2 - rec);
    // muzzle flash
    if (t.muzzle > 0) {
      ctx.fillStyle = "#fff6c8";
      ctx.fillRect(-3, -t.h / 2 - 5, 6, 4);
      ctx.fillStyle = COLORS.powerBullet;
      ctx.fillRect(-2, -t.h / 2 - 7, 4, 2);
    }
    ctx.restore();
    if (t.protect > 0 || (t.isPlayer && G.helmetTimer > 0)) {
      ctx.save();
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 60);
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -(performance.now() / 40);
      ctx.beginPath();
      ctx.arc(t.x + t.w / 2, t.y + t.h / 2, t.w / 2 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  function shade(hex) {
    // darker variant for turret
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = (r * 0.7) | 0; g = (g * 0.7) | 0; b = (b * 0.7) | 0;
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawTanks() {
    if (G.player && !G.player.dead) drawTank(G.player);
    for (var i = 0; i < G.enemies.length; i++) drawTank(G.enemies[i]);
  }
  function drawBullets() {
    for (var i = 0; i < G.bullets.length; i++) {
      var b = G.bullets[i];
      var c = b.power ? COLORS.powerBullet : COLORS.bullet;
      var w = b.w + (b.power ? 2 : 0), h = b.h + (b.power ? 2 : 0);
      var L = b.power ? 9 : 5, e = b.power ? 1 : 0;
      ctx.fillStyle = b.power ? "rgba(255,233,79,0.35)" : "rgba(255,255,255,0.25)";
      if (b.dir === "up") ctx.fillRect(b.x - e, b.y - L + 2, w, L - 2);
      else if (b.dir === "down") ctx.fillRect(b.x - e, b.y + 2, w, L - 2);
      else if (b.dir === "left") ctx.fillRect(b.x - L + 2, b.y - e, L - 2, h);
      else ctx.fillRect(b.x + 2, b.y - e, L - 2, h);
      ctx.fillStyle = c;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "#ffffff";
      if (b.dir === "up") ctx.fillRect(b.x, b.y, b.w, 1);
      else if (b.dir === "down") ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
      else if (b.dir === "left") ctx.fillRect(b.x, b.y, 1, b.h);
      else ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    }
  }
  function drawPowerups() {
    var now = performance.now();
    for (var i = 0; i < G.powerups.length; i++) {
      var p = G.powerups[i];
      var remain = POWERUP_LIFE - p.t;
      if (remain < 3 && Math.floor(now / 150) % 2 === 0) continue; // expiring flicker
      var s = p.t < 0.25 ? 0.6 + (p.t / 0.25) * 0.4 : 1 + 0.05 * Math.sin(now / 180 + p.x);
      var size = 24 * s, ox = p.x + 12 - size / 2, oy = p.y + 12 - size / 2;
      ctx.save();
      ctx.fillStyle = COLORS.box;
      ctx.fillRect(ox, oy, size, size);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.strokeRect(ox + 1, oy + 1, size - 2, size - 2);
      ctx.fillStyle = COLORS.boxText;
      ctx.font = "bold " + Math.max(10, Math.round(14 * s)) + "px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(p.icon, p.x + 12, p.y + 13);
      ctx.restore();
    }
  }
  function drawFx() {
    for (var i = 0; i < G.fx.length; i++) {
      var f = G.fx[i], age = f.t / 0.4, big = f.type === "big";
      var R = big ? 18 : 10;
      ctx.save();
      if (age < 0.5) {
        var k = age * 2;
        var r = 4 + (R - 4) * k;
        ctx.fillStyle = "#fff3c4";
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = big ? "#ff9d2e" : "#ffd94f";
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.65, 0, Math.PI * 2); ctx.fill();
      } else {
        var k2 = (age - 0.5) * 2;
        var r2 = R * (1 + 0.8 * k2);
        ctx.globalAlpha = 1 - k2;
        ctx.fillStyle = big ? "#ff9d2e" : "#ffd94f";
        ctx.beginPath(); ctx.arc(f.x, f.y, r2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (1 - k2) * 0.8;
        ctx.fillStyle = "#fff3c4";
        ctx.beginPath(); ctx.arc(f.x, f.y, r2 * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffe94f";
        for (var sp = 0; sp < 6; sp++) {
          var ang = (f.seed % 6) + sp * (Math.PI / 3);
          var d = r2 * (0.9 + 0.15 * ((f.seed >> (sp + 1)) % 3));
          ctx.globalAlpha = 1 - k2;
          ctx.fillRect(f.x + Math.cos(ang) * d - 1, f.y + Math.sin(ang) * d - 1, 2, 2);
        }
      }
      ctx.restore();
    }
  }
  function drawTrees() { drawTiles(true); }

  // ---- HUD -------------------------------------------------------------
  function pip(cls) { return '<span class="pip ' + cls + '" aria-hidden="true"></span>'; }
  function renderHUD() {
    var left = G.enemyQueue.length + G.enemies.length;
    var shown = Math.min(left, 15);
    if (hudCache.enemies !== shown) {
      hudCache.enemies = shown;
      var s = "";
      for (var i = 0; i < shown; i++) s += pip("pip-enemy");
      hud.enemies.innerHTML = s;
      hud.enemies.setAttribute("aria-label", "enemies remaining " + left);
    }
    var stage = (G.level + 1) + "/" + LEVELS.length;
    if (hudCache.stage !== stage) { hudCache.stage = stage; hud.stage.textContent = stage; }
    var lives = Math.min(G.lives, 9);
    if (hudCache.lives !== lives) {
      hudCache.lives = lives;
      var s2 = "";
      for (var j = 0; j < lives; j++) s2 += pip("pip-player");
      hud.lives.innerHTML = s2;
      hud.lives.setAttribute("aria-label", "lives " + G.lives);
    }
    var score = String(G.score);
    if (hudCache.score !== score) {
      hudCache.score = score;
      hud.score.textContent = score;
      hud.score.classList.remove("score-pop");
      void hud.score.offsetWidth; // restart animation
      hud.score.classList.add("score-pop");
    }
    var high = String(G.high);
    if (hudCache.high !== high) { hudCache.high = high; hud.high.textContent = high; }
  }

  // ---- main loop -------------------------------------------------------
  var last = 0;
  function frame(t) {
    var dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    update(dt);
    render();
    renderHUD();
    requestAnimationFrame(frame);
  }

  // ---- boot ------------------------------------------------------------
  function boot() {
    canvas = document.getElementById("game");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = FIELD * dpr;
    canvas.height = FIELD * dpr;
    canvas.style.width = FIELD + "px";
    canvas.style.height = FIELD + "px";
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    if (dpr !== 1) ctx.scale(dpr, dpr);
    overlay.el = document.getElementById("overlay");
    overlay.title = document.getElementById("ov-title");
    overlay.sub = document.getElementById("ov-sub");
    overlay.hint = document.getElementById("ov-hint");
    hud.enemies = document.getElementById("hud-enemies");
    hud.stage = document.getElementById("hud-stage");
    hud.lives = document.getElementById("hud-lives");
    hud.score = document.getElementById("hud-score");
    hud.high = document.getElementById("hud-high");
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    loadLevel(0);
    setState("menu");
    requestAnimationFrame(frame);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      G: G, keys: keys,
      aabb: aabb, makeTank: makeTank,
      loadLevel: loadLevel, startGame: startGame, setState: setState,
      onKeyDown: onKeyDown, onKeyUp: onKeyUp, keyHeld: keyHeld,
      moveAxis: moveAxis, respawnPlayer: respawnPlayer, updatePlayer: updatePlayer,
      firePlayer: firePlayer, bulletTileHit: bulletTileHit, destroyTile: destroyTile,
      resolveBulletHit: resolveBulletHit, bulletTankHit: bulletTankHit, updateBullets: updateBullets,
      killPlayer: killPlayer, destroyEagle: destroyEagle, spawnEnemy: spawnEnemy,
      fireEnemy: fireEnemy, updateEnemies: updateEnemies, retarget: retarget,
      dropPowerup: dropPowerup, applyPowerup: applyPowerup, updatePowerups: updatePowerups,
      addFx: addFx, updateFx: updateFx,
      update: update, spawnLogic: spawnLogic, checkStageEnd: checkStageEnd,
      killEnemy: killEnemy, saveHigh: saveHigh, gameOver: gameOver
    };
  }
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
