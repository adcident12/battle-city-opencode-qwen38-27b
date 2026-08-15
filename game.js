(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
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
    enemyQueue: "", spawnCooldown: 0,
    stageTimer: 0, starMode: false,
    helmetTimer: 0, shovelTimer: 0,
    power: { tank: false, bullet: false }
  };
  try { G.high = parseInt(localStorage.getItem("battlecity_highscore") || "0", 10) || 0; } catch (e) {}

  var keys = {};
  var overlay = { el: null, title: null, sub: null, hint: null };
  var hud = { enemies: null, stage: null, lives: null, score: null, high: null };

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
      hp: 1, isPlayer: !!isPlayer,
      protect: 0, fireCd: 0, aiTimer: 0, moving: false
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
    G.player = makeTank("P", cx(Grid.PLAYER_SPAWN[0]), cx(Grid.PLAYER_SPAWN[1]), "up", true);
    G.player.protect = SPAWN_PROTECT;
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
    var t = "", sub = "", hint = "";
    if (G.state === "menu") {
      t = "BATTLE CITY";
      sub = "Stage " + (G.level + 1) + " of " + LEVELS.length;
      hint = "arrows: move   space: fire   P: pause\npress SPACE to start";
    } else if (G.state === "paused") {
      t = "PAUSED"; hint = "press P to resume";
    } else if (G.state === "stageclear") {
      t = "STAGE CLEAR"; sub = "score " + G.score;
      hint = "next stage...";
    } else if (G.state === "gameover") {
      t = "GAME OVER"; sub = "score " + G.score + "   high " + G.high;
      hint = "press SPACE for menu";
    } else if (G.state === "victory") {
      t = "VICTORY!"; sub = "all " + LEVELS.length + " stages clear";
      hint = "final score " + G.score + "   high " + G.high + "\npress SPACE for menu";
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
      if (G.state === "menu" || G.state === "gameover" || G.state === "victory") startGame();
      else if (G.state === "playing") firePlayer();
    }
    if ((e.key === "p" || e.key === "P" || e.key === "Escape") &&
        (G.state === "playing" || G.state === "paused"))
      setState(G.state === "playing" ? "paused" : "playing");
    if (e.key === "m" || e.key === "M") Sfx.toggleMute();
  }
  function onKeyUp(e) { keys[e.key] = false; }

  // ---- player (fill in task 6) ----------------------------------------
  function updatePlayer(dt) {};
  function firePlayer() {}

  // ---- enemies (fill in task 7) ---------------------------------------
  function updateEnemies(dt) {}

  // ---- bullets (fill in task 6) ---------------------------------------
  function updateBullets(dt) {}

  // ---- powerups / fort / staging (fill in task 8) ---------------------
  function updatePowerups(dt) {}

  // ---- effects ---------------------------------------------------------
  function addFx(x, y, type) { G.fx.push({ x: x, y: y, t: 0, type: type }); }
  function updateFx(dt) {
    for (var i = G.fx.length - 1; i >= 0; i--) { G.fx[i].t += dt; if (G.fx[i].t > 0.4) G.fx.splice(i, 1); }
  }

  // ---- update ----------------------------------------------------------
  function update(dt) {
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
    if (G.player) { G.player.protect = Math.max(0, G.player.protect - dt); G.player.fireCd = Math.max(0, G.player.fireCd - dt); }
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

  // spawn enemies up to MAX_ON_FIELD (task 7 fills detail)
  function spawnLogic(dt) {
    G.spawnCooldown -= dt;
    if (G.spawnCooldown <= 0 && G.enemyQueue.length > 0 && G.enemies.length < MAX_ON_FIELD) {
      spawnEnemy();
      G.spawnCooldown = 1.2;
    }
  }
  function spawnEnemy() {}

  function checkStageEnd() {
    if (G.enemyQueue.length === 0 && G.enemies.length === 0 && G.state === "playing") {
      G.stageTimer = 2.5;
      setState("stageclear");
      Sfx.play("stage_clear");
    }
  }

  function killPlayer() {}       // task 6
  function killEnemy(t) {}       // task 7

  function saveHigh() {
    if (G.score > G.high) {
      G.high = G.score;
      try { localStorage.setItem("battlecity_highscore", String(G.high)); } catch (e) {}
    }
    G.score = Math.max(G.score, 0);
  }

  function gameOver() { saveHigh(); setState("gameover"); Sfx.play("game_over"); }
  function clearStage() { setState("stageclear"); }

  // ---- render ----------------------------------------------------------
  function render() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, FIELD, FIELD);
    drawTiles(false);
    drawFort();
    drawPowerups();
    drawTanks();
    drawBullets();
    drawTrees();
    drawFx();
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
    ctx.fillStyle = COLORS.brickA; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.brickB;
    for (var r = 0; r < 3; r++) {
      ctx.fillRect(px, py + r * 10, TILE, 1);
      ctx.fillRect(px + ((r % 2) ? 15 : 7), py + r * 10, 1, 10);
    }
  }
  function drawSteel(px, py) {
    ctx.fillStyle = COLORS.steelA; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.steelC; ctx.fillRect(px, py, TILE, 3); ctx.fillRect(px, py, 3, TILE);
    ctx.fillStyle = COLORS.steelB; ctx.fillRect(px + TILE - 3, py, 3, TILE); ctx.fillRect(px, py + TILE - 3, TILE, 3);
    ctx.fillStyle = COLORS.steelA; ctx.fillRect(px + 6, py + 6, TILE - 12, TILE - 12);
  }
  function drawRiver(px, py) {
    ctx.fillStyle = COLORS.riverA; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.riverB;
    for (var r = 0; r < 3; r++) {
      var off = (r % 2) ? 4 : 10;
      ctx.fillRect(px + off, py + r * 10 + 4, 8, 2);
    }
  }
  function drawTree(px, py) {
    ctx.fillStyle = COLORS.treeA; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.treeB;
    for (var i = 0; i < 6; i++) {
      var sx = px + ((i * 13) % 24) + 1, sy = py + ((i * 17) % 24) + 1;
      ctx.fillRect(sx, sy, 5, 3);
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
    ctx.fillStyle = COLORS.eagleB;
    ctx.fillRect(x + 2, y + 16, TILE - 4, TILE - 18);
    ctx.fillStyle = COLORS.eagleA;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 18); ctx.lineTo(x + TILE - 4, y + 18);
    ctx.lineTo(x + TILE / 2, y + 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(x + TILE / 2 - 2, y + 8, 4, 4);
  }

  function drawTank(t) {
    var C = t.isPlayer ? COLORS.player : COLORS.enemy[t.kind] || COLORS.enemy.B;
    ctx.save();
    ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
    var rot = t.dir === "up" ? 0 : t.dir === "right" ? Math.PI / 2 : t.dir === "down" ? Math.PI : -Math.PI / 2;
    ctx.rotate(rot);
    // treads
    ctx.fillStyle = "#3a3f45";
    ctx.fillRect(-t.w / 2, -t.h / 2, 6, t.h);
    ctx.fillRect(t.w / 2 - 6, -t.h / 2, 6, t.h);
    // body
    ctx.fillStyle = C;
    ctx.fillRect(-t.w / 2 + 6, -t.h / 2 + 3, t.w - 12, t.h - 6);
    // turret
    ctx.fillStyle = shade(C);
    ctx.fillRect(-4, -6, 8, 12);
    ctx.fillRect(-2, -t.h / 2, 4, t.h / 2); // barrel
    ctx.restore();
    if (t.protect > 0 || (t.isPlayer && G.helmetTimer > 0)) {
      ctx.save();
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 60);
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
    if (G.player) drawTank(G.player);
    for (var i = 0; i < G.enemies.length; i++) drawTank(G.enemies[i]);
  }
  function drawBullets() {
    for (var i = 0; i < G.bullets.length; i++) {
      var b = G.bullets[i];
      ctx.fillStyle = b.power ? COLORS.powerBullet : COLORS.bullet;
      ctx.fillRect(b.x, b.y, BULLET, BULLET);
    }
  }
  function drawPowerups() {
    var blink = Math.floor(performance.now() / 250) % 2 === 0;
    for (var i = 0; i < G.powerups.length; i++) {
      var p = G.powerups[i];
      if (blink) continue;
      ctx.fillStyle = COLORS.box;
      ctx.fillRect(p.x, p.y, 24, 24);
      ctx.fillStyle = COLORS.boxText;
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(p.icon, p.x + 12, p.y + 13);
    }
  }
  function drawFx() {
    for (var i = 0; i < G.fx.length; i++) {
      var f = G.fx[i], k = f.t / 0.4;
      var r = (f.type === "big" ? 18 : 10) * (0.5 + k);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.type === "big" ? "#ff9d2e" : "#ffd94f";
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
      if (k > 0.3) {
        ctx.fillStyle = "#fff3c4";
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawTrees() { drawTiles(true); }

  // ---- HUD -------------------------------------------------------------
  function renderHUD() {
    var left = G.enemyQueue.length + G.enemies.length;
    hud.enemies.innerHTML = left > 0 ? "■".repeat(Math.min(left, 15)) : "0";
    hud.stage.textContent = (G.level + 1) + "/" + LEVELS.length;
    hud.lives.textContent = G.lives > 0 ? "▲".repeat(Math.min(G.lives, 9)) : "0";
    hud.score.textContent = G.score;
    hud.high.textContent = G.high;
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
