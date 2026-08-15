# Battle City — Design Spec

Date: 2026-08-15
Status: Approved (user approved design in chat, Core version, 1 player)

## Overview

เกม Battle คลาสสิกบน browser: ขับรถถัง, ยิงศัตรู, ปกป้องป้อมฐาน (นกอินทรีย์), ผ่าน map 12 ระดับ. Vanilla JS + HTML5 Canvas, ไม่มี build, ไม่มี dependency, ไม่มีไฟล์ภาพ/เสียง (วาด vector + WebAudio).

## Scope

**In:**
- 12 map มือวาด, tile 5 ประเภท, 4 enemy types, power-up 6 ประเภท
- 1 ผู้เล่น, lives 3, score, high score (localStorage), pause, โหมด menu/stage clear/game over/victory
- เสียง beep (WebAudio)

**Out (YAGNI):** mobile/touch, 2 players, music loop, level select, save mid-game

## Files

| File | หน้าที่ |
|---|---|
| `index.html` | canvas `#game` (390x390) + HUD DOM ด้านขวา (`#hud`) + `#overlay` (menu/pause/stage clear/game over) |
| `styles.css` | layout flex, dark theme, font monospace |
| `levels.js` | `window.LEVELS` — 12 map + enemy mix (ดู format ด้านล่าง) |
| `audio.js` | `window.BCAudio.play(name)` — WebAudio oscillator beeps |
| `game.js` | ทุกอย่าง: loop, input, entities, collision, AI, power-up, state machine, rendering |

รันด้วย: open `index.html` ตรงๆ ได้ (ไม่มี fetch) หรือ `python -m http.server`

## Playfield & Grid

- Grid 13x13 tiles, `TILE = 30px` → playfield 390x390, canvas 390x390
- Tile types:
  - `B` brick — ยิงหาย (1 นัด 1 tile), รถถังขับผ่านไม่ได้
  - `S` steel — กันทุกอย่าง, กระสุนทำลายไม่ได้ (ยกเว้น power-up bullet)
  - `R` river — รถถังข้ามไม่ได้, กระสุนผ่านได้
  - `T` tree — วาดทับถัง (บังถัง), กันกระสุน/รถถังไม่ได้
  - `.` empty
- Fort (eagle): tile (6,12) — วาด programmatically หลัง load map (level string ปล่อยช่อง 5..7 x 11..12 ให้ว่าง), brick ring 3x2 รอบ (7 brick tile + eagle). กระสุนโดน eagle = **game over**
- Player spawn: tile (4,12), protected 2 วิ
- Enemy spawn points: (1,0), (6,0), (11,0)

## Level Format (levels.js)

```js
window.LEVELS = [
  {
    map: [
      ".............",
      ".BBB.BBB.S...",
      // 13 rows x 13 chars
    ],
    enemies: "BBAFBFPFAABAFBPFAAFB"  // 20 ตัว: B=basic F=fast P=power A=armor
  },
  // ... 12 levels
];
```

Rules 12 map: ความยากค่อยๆ เพิ่ม (A/P เพิ่มใน map หลัง), map 12 มี A หนัก. Map ทุกตัว: แถวบน x=1,6,11 และแถวล่าง x=4, 5..7 ต้องว่าง (spawn + fort).

## Entities

### Tank ( player + enemy )
- ขนาด 28x28, continuous movement (ไม่ได้ grid-snap), velocity: player 90 px/s, basic 60, fast 110, power 85
- 4 direction (up/down/left/right), ทurret หันตาม direction, treads animate 2 frames
- Collision: AABB กับ solid tiles และ tank ตัวอื่น (หยุด, ไม่ push), กับ playfield border
- Player bullets max 1 (2 ถ้ามี tank power-up). Enemy: 1 พร้อม cooldown 1.2s (หลังเลี้ยว/random)
- Bullet: 4x4, speed 360 px/s, destroy เมื่อ: ออกขอบ, โดน brick (หาย brick 1 tile), โดน steel (bullet power-up ทำลาย steel ได้; ปกติกระสุนหาย), โดน tank (explode)

### Colors & types
| Type | Score | HP | ความเร็ว | หมายเหตุ |
|---|---|---|---|---|
| Player | — | 1 | 90 | yellow/gold |
| Basic (B) | 100 | 1 | 60 | gray |
| Fast (F) | 200 | 1 | 110 | light gray |
| Power (P) | 300 | 1 | 85, bullet 480 | orange-brown |
| Armor (A) | 400 | 4 | 60 | blue-gray, hit 1-3 จิกระพริบ color, hit ที่ 4 หาย |

- Spawn protection 2s (กระพริบ, ยิงไม่โดน)
- **Power carrier:** 50% ของ enemy ใน map แต่ละตัวถูก flag (สุ่ม) — เมื่อตาย power-up box spawn ที่ตำแหน่งนั้น

### AI (enemy)
- ทุก 0.8-2s: เลี้ยว direction สุ่ม (weighted 50% คงทางเดิม, 25% ลง, 25% สุ่ม), ยิงเมื่อ cooldown พร้อม (chance 60%)
- **Star power-up active:** เปลี่ยน interval เป็น 0.4-0.9s, weighted 60% ลง + bias ไปทาง player/fort, bullet speed +50%

## Power-ups

Box 24x24 กระพริบ, อยู่ 12s แล้วหายไป. Player ขับทับ = activates:

| # | Icon | Effect |
|---|---|---|
| tank | 坦克 | player speed x1.25 (112 px/s) + bullets max 2 |
| bullet | ★ | bullet ทำลาย steel ได้ + ทะลุ brick (ทำลาย brick ทุก tile ตามแนวจนหยุด) |
| helmet | ⛨ | shield 15s (กระสุนยิงไม่โดน player) |
| shovel | ⛏ | fort bricks → steel 30s (หมด timer กลับ brick, ฟื้น brick ที่ถูกทำลาย) |
| star | ✪ | enemy AI ดุขึ้น (ดูข้างบน) ตลอด level นั้น |
| bomb | 💥 | ระเบิดทุก enemy บน field พร้อมกัน (ได้ score เต็มทุกตัว) |

- Power-up state reset ทุก stage (ยกเว้น score/lives)

## Game States & Flow

`menu` → (Enter) → `playing` ↔ (P/Esc) `paused`
- `playing`: update loop. Stage clear เมื่อ enemy 20 ตัวตายหมด → `stage-clear` overlay 2.5s → load level ถัดไป (reset player/spawn/power-up, clear bullets)
- `game-over`: lives หมด หรือ fort ถูกทำลาย. Overlay แสดง reason + score + (NEW HIGH SCORE?) → Enter กลับ `menu`
- ผ่าน level 12 → `victory` overlay
- `menu`: title + "PRESS ENTER" + high score

**Lives:** เริ่ม 3, player ตาย (ไม่ถูก shield) = ลด 1, respawn ที่ spawn point + protection 2s. Lives 0 = game over (หลัง death anim ~1s)

## Scoring & HUD

- Score: ตามตารางข้างบน, power-up pickup = 500
- High score: `localStorage["battlecity_highscore"]`, update live ถ้า score > high, persist ที่ game over/victory
- HUD (DOM ขวา canvas): enemies left (icon จำนวนที่เหลือใน level), stage n/12, score, high score, lives (icon)

## Controls

- Arrow keys: move (4 direction, smooth)
- Space / Enter: shoot
- P / Esc: pause
- `preventDefault()` arrow keys + Space (กัน scroll)

## Rendering

- Canvas 2D, วาดทุก frame: background black → tiles (river animate, brick, steel) → fort eagle → tanks + shield/spawn → bullets → explosions (2-phase, ~0.4s) → **trees ทับสุด**
- Sprites วาดจาก rectangles (body, treads 2 frames, turret), ไม่มี image
- Explosion: frame 1 burst ใหญ่ (~200ms) → frame 2 เล็กลง (~200ms)
- Shield: circle outline หมุนรอบถัง
- Overlay: DOM div absolute บน canvas, monospace, centered

## Audio (audio.js)

WebAudio, square/triangle waves + noise buffer. `play(name)`:
`shoot`, `brick_break`, `steel_hit`, `explode_small`, `explode_big`, `powerup`, `star`, `fort_destroy`, `stage_clear`, `game_over`
- Music: ไม่มี
- `AudioContext` create/lazy-resume ที่ first keydown (autoplay policy)

## Verification Plan

1. เปิด game ใน browser (browser-tools): console errors = 0
2. Screenshot: menu, playing (กลาง game), stage clear, game over (fort destroyed + no lives), victory (test forced ถ้าจำเป็น)
3. Playtest: ผ่าน level 1-2, ยิง brick/steel, รับ power-up ทุกชนิด (ใช้ debug หรือเล่นจริง), pause/resume, respawn
4. High score persist หลัง refresh

## Risks / Notes

- Continuous movement + tank-tank collision อาจ jitter → resolve แบบ try X then Y, player priority
- Fort bullets ต้องตรวจ eagle tile เฉพาะเมื่อ brick ring เปิดช่อง (ตรวจ AABB bullet vs eagle tile ตรงๆ)
- 12 map ต้องตรวจ collision กับ spawn/fort rules ทุก map (script หรือมือตรวจตอน verify)
