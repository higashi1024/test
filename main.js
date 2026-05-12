'use strict';

const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// ── Physics ──────────────────────────────────────────────────────────────────
const GRAVITY    = 0.45;
const WALK_SPD   = 3;
const JUMP_V     = -9;
const BARREL_SPD = 2.2;
const BARREL_R   = 10;
const LADDER_W   = 14;

// ── Layout ───────────────────────────────────────────────────────────────────
// Platforms: y = surface top.
// Alternating left/right gaps force barrels into a zigzag path.
const PLATS = [
  { x: 30,  y: 490, w: 420, h: 10 },  // 0  bottom full
  { x: 30,  y: 400, w: 330, h: 10 },  // 1  left  (30–360)
  { x: 120, y: 310, w: 330, h: 10 },  // 2  right (120–450)
  { x: 30,  y: 220, w: 330, h: 10 },  // 3  left  (30–360)
  { x: 30,  y: 130, w: 420, h: 10 },  // 4  top   DK here
];

// Ladders connect adjacent platforms on alternating sides
const LADDERS = [
  { x: 335, top: 400, bot: 490 },   // right  plat 0→1
  { x: 145, top: 310, bot: 400 },   // left   plat 1→2
  { x: 335, top: 220, bot: 310 },   // right  plat 2→3
  { x: 145, top: 130, bot: 220 },   // left   plat 3→4
];

const DK_X = 78, DK_Y = 108;
const PAULINE_X = 428, PAULINE_Y = 116;

// ── HUD refs ──────────────────────────────────────────────────────────────────
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const stageEl = document.getElementById('stage');
const msgEl   = document.getElementById('message');

function updateHUD() {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  stageEl.textContent = stage;
}

// ── Game state ────────────────────────────────────────────────────────────────
let gameState; // 'title'|'playing'|'dying'|'cleared'|'gameover'
let score, lives, stage, fc;
let player, barrels, dk;
let barrelTimer, dieTimer, clearTimer;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Enter') handleAction();
  // Don't preventDefault for F-keys or tab so browser shortcuts still work
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))
    e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

function handleAction() {
  if (gameState === 'title')                      startStage();
  else if (gameState === 'gameover')              initGame();
  else if (gameState === 'cleared' && clearTimer <= 0) initGame();
}

// ── Init / start ──────────────────────────────────────────────────────────────
function initGame() {
  score = 0; lives = 3; stage = 1;
  gameState = 'title';
  msgEl.textContent = 'Space / Enter でスタート';
  updateHUD();
}

function startStage() {
  gameState = 'playing';
  fc = 0;
  barrels = [];
  barrelTimer = 160;
  dk = { frame: 0, timer: 0 };
  spawnPlayer();
  msgEl.textContent = '';
}

function spawnPlayer() {
  player = {
    x: 55, y: PLATS[0].y,   // feet at platform 0 surface
    vx: 0, vy: 0,
    w: 16, h: 26,
    onGround: false,
    onLadder: false,
    facing: 1,
    wFrame: 0, wTimer: 0,
  };
}

// ── Platform helpers ──────────────────────────────────────────────────────────
function landOnPlat(cx, footY, prevFootY, halfW) {
  for (const p of PLATS) {
    if (cx - halfW < p.x + p.w && cx + halfW > p.x) {
      if (prevFootY <= p.y + 1 && footY >= p.y) return p;
    }
  }
  return null;
}

function climbThroughPlat(cx, footY, prevFootY) {
  // Climbing UP: feet cross platform surface from below → above
  for (const p of PLATS) {
    if (cx > p.x + 2 && cx < p.x + p.w - 2) {
      if (prevFootY >= p.y && footY < p.y) return p;
    }
  }
  return null;
}

function barrelLanding(bx, by, prevBy) {
  for (const p of PLATS) {
    if (bx > p.x + 2 && bx < p.x + p.w - 2) {
      if (prevBy + BARREL_R <= p.y + 2 && by + BARREL_R >= p.y) return p;
    }
  }
  return null;
}

// ── Ladder helpers ────────────────────────────────────────────────────────────
function ladderAt(cx, footY, headY) {
  for (const l of LADDERS) {
    if (cx > l.x - LADDER_W / 2 - 3 && cx < l.x + LADDER_W / 2 + 3) {
      if (footY >= l.top - 4 && headY <= l.bot + 4) return l;
    }
  }
  return null;
}

// ── Update player ─────────────────────────────────────────────────────────────
function updatePlayer() {
  const p = player;
  const prevX = p.x, prevY = p.y;
  const ladder = ladderAt(p.x, p.y, p.y - p.h);

  if (ladder && (keys['ArrowUp'] || keys['ArrowDown'] || p.onLadder)) {
    if (keys['ArrowUp'])   { p.onLadder = true; p.vy = -2.5; p.vx = 0; }
    else if (keys['ArrowDown']) { p.onLadder = true; p.vy = 2.5; p.vx = 0; }
    else if (p.onLadder)  { p.vy = 0; p.vx = 0; }
  } else {
    p.onLadder = false;
  }

  if (!p.onLadder) {
    p.vx = keys['ArrowLeft'] ? -WALK_SPD : keys['ArrowRight'] ? WALK_SPD : 0;
    if (p.vx < 0) p.facing = -1;
    if (p.vx > 0) p.facing = 1;

    if ((keys['ArrowUp'] || keys['KeyZ'] || keys['KeyX']) && p.onGround) {
      p.vy = JUMP_V;
      p.onGround = false;
    }
    p.vy += GRAVITY;
  }

  p.x += p.vx;
  p.y += p.vy;
  p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, p.x));

  // Landing on a platform (falling down)
  if (p.vy >= 0) {
    const pl = landOnPlat(p.x, p.y, prevY, p.w / 2);
    if (pl) {
      p.y = pl.y;
      p.vy = 0;
      p.onGround = true;
      p.onLadder = false;
    } else if (!p.onLadder) {
      p.onGround = false;
    }
  }

  // Exiting ladder at the top (climbing up through a platform)
  if (p.onLadder && p.vy < 0) {
    const pl = climbThroughPlat(p.x, p.y, prevY);
    if (pl) {
      p.y = pl.y;
      p.vy = 0;
      p.onGround = true;
      p.onLadder = false;
    }
  }

  if (p.y > H + 40) { die(); return; }

  // Walk animation
  if (p.vx !== 0 && p.onGround) {
    if (++p.wTimer > 7) { p.wTimer = 0; p.wFrame = (p.wFrame + 1) % 4; }
  } else {
    p.wFrame = 0; p.wTimer = 0;
  }
}

// ── Update barrels ────────────────────────────────────────────────────────────
function updateBarrels() {
  barrelTimer--;
  if (barrelTimer <= 0) {
    const spd = BARREL_SPD + (stage - 1) * 0.25;
    barrels.push({
      x: DK_X + 22, y: PLATS[4].y - BARREL_R,
      vx: spd, vy: 0,
      plat: PLATS[4],
      frame: 0, fTimer: 0,
    });
    barrelTimer = Math.max(75, 160 - stage * 12);
  }

  for (let i = barrels.length - 1; i >= 0; i--) {
    const b = barrels[i];
    const prevY = b.y;

    // Fall off platform edge
    if (b.plat) {
      const p = b.plat;
      if (b.x - BARREL_R < p.x || b.x + BARREL_R > p.x + p.w) b.plat = null;
    }

    if (!b.plat) b.vy += GRAVITY;

    b.x += b.vx;
    b.y += b.vy;

    // Canvas wall bounce
    if (b.x - BARREL_R < 0)  { b.x = BARREL_R;     b.vx =  Math.abs(b.vx); }
    if (b.x + BARREL_R > W)  { b.x = W - BARREL_R; b.vx = -Math.abs(b.vx); }

    // Land on platform
    if (!b.plat && b.vy > 0) {
      const pl = barrelLanding(b.x, b.y, prevY);
      if (pl) { b.y = pl.y - BARREL_R; b.vy = 0; b.plat = pl; }
    }

    if (b.y > H + 40) { barrels.splice(i, 1); continue; }

    if (++b.fTimer > 5) { b.fTimer = 0; b.frame = (b.frame + 1) % 4; }
  }
}

// ── DK, collisions, win ────────────────────────────────────────────────────────
function updateDK() {
  if (++dk.timer > 30) { dk.timer = 0; dk.frame = 1 - dk.frame; }
}

function checkCollisions() {
  const px = player.x, py = player.y - player.h / 2;
  for (const b of barrels) {
    const dx = px - b.x, dy = py - b.y;
    if (dx * dx + dy * dy < (BARREL_R + 7) * (BARREL_R + 7)) { die(); return; }
  }
}

function checkWin() {
  const dx = player.x - PAULINE_X, dy = player.y - PAULINE_Y;
  if (Math.sqrt(dx * dx + dy * dy) < 28) {
    score += 1000 * stage;
    stage++;
    updateHUD();
    gameState = 'cleared';
    clearTimer = 120;
    msgEl.textContent = `ステージクリア！ +${1000 * (stage - 1)} 点`;
  }
}

function die() {
  if (gameState !== 'playing') return;
  gameState = 'dying';
  dieTimer = 70;
}

// ── Main update ────────────────────────────────────────────────────────────────
function update() {
  fc++;
  if (gameState === 'dying') {
    if (--dieTimer <= 0) {
      lives--;
      updateHUD();
      if (lives <= 0) { gameState = 'gameover'; msgEl.textContent = 'GAME OVER  Space でリトライ'; }
      else startStage();
    }
    return;
  }
  if (gameState === 'cleared') {
    if (--clearTimer <= 0) {
      gameState = 'title';
      msgEl.textContent = 'Space / Enter で次のステージへ';
    }
    return;
  }
  if (gameState !== 'playing') return;

  updatePlayer();
  updateBarrels();
  updateDK();
  checkCollisions();
  checkWin();
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function drawPlatforms() {
  for (const p of PLATS) {
    ctx.fillStyle = '#c8441a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#f5a623';
    for (let rx = p.x + 18; rx < p.x + p.w - 8; rx += 26) {
      ctx.beginPath();
      ctx.arc(rx, p.y + 5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLadders() {
  for (const l of LADDERS) {
    const lx = l.x - LADDER_W / 2;
    ctx.fillStyle = '#4a8520';
    ctx.fillRect(lx, l.top, 3, l.bot - l.top);
    ctx.fillRect(lx + LADDER_W - 3, l.top, 3, l.bot - l.top);
    ctx.fillStyle = '#6ab830';
    for (let ry = l.top + 8; ry < l.bot; ry += 10)
      ctx.fillRect(lx, ry, LADDER_W, 2);
  }
}

function drawPauline() {
  const x = PAULINE_X, y = PAULINE_Y;
  ctx.fillStyle = '#f5d44a';           // hair
  ctx.beginPath(); ctx.arc(x, y - 17, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FDBCB4';           // face
  ctx.beginPath(); ctx.arc(x, y - 14, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0509a';           // dress
  ctx.fillRect(x - 6, y - 9, 12, 13);
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - 11, y + 18);
  ctx.lineTo(x + 11, y + 18); ctx.lineTo(x + 8, y + 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
  ctx.fillText('HELP!', x, y - 28);
  ctx.textAlign = 'left';
}

function drawDK() {
  const x = DK_X, y = DK_Y;
  const arm = dk.frame ? 4 : -4;
  ctx.fillStyle = '#5c3317';
  ctx.beginPath(); ctx.arc(x, y + 8, 20, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - 14, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9b6b3a';
  ctx.beginPath(); ctx.ellipse(x, y - 11, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - 4, y - 16, 2.5, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 16, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(x - 4, y - 16, 1.2, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 16, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5c3317'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x - 18, y + 2); ctx.lineTo(x - 30, y - 4 + arm); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 18, y + 2); ctx.lineTo(x + 30, y - 4 - arm); ctx.stroke();
  ctx.lineWidth = 1;
  // DK label
  ctx.fillStyle = '#f5a623'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText('DK', x, y - 32); ctx.textAlign = 'left';
}

function drawBarrels() {
  for (const b of barrels) {
    const ang = b.frame * Math.PI / 2;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(ang * (b.vx > 0 ? 1 : -1));
    ctx.fillStyle = '#8B4513';
    ctx.beginPath(); ctx.arc(0, 0, BARREL_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a2000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-BARREL_R + 2, 0); ctx.lineTo(BARREL_R - 2, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -BARREL_R + 2); ctx.lineTo(0, BARREL_R - 2); ctx.stroke();
    ctx.restore();
  }
}

function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.facing === -1) ctx.scale(-1, 1);

  // Hat
  ctx.fillStyle = '#cc1111';
  ctx.fillRect(-8, -p.h, 16, 4);
  ctx.fillRect(-5, -p.h - 4, 10, 5);
  // Head
  ctx.fillStyle = '#FDBCB4';
  ctx.beginPath(); ctx.arc(1, -p.h + 7, 7, 0, Math.PI * 2); ctx.fill();
  // Overalls
  ctx.fillStyle = '#1e56cc';
  ctx.fillRect(-5, -p.h + 13, 10, 10);
  // Shirt
  ctx.fillStyle = '#cc1111';
  ctx.fillRect(-4, -p.h + 13, 8, 5);
  // Legs
  const ls = p.onGround ? Math.sin(p.wFrame * Math.PI / 2) * 3 : 0;
  ctx.fillStyle = '#1e56cc';
  ctx.fillRect(-5, -p.h + 23, 4, 7 + ls);
  ctx.fillRect(1,  -p.h + 23, 4, 7 - ls);
  // Shoes
  ctx.fillStyle = '#222';
  ctx.fillRect(-6, -3, 5, 3);
  ctx.fillRect(1,  -3, 6, 3);

  ctx.restore();
}

// ── Draw ─────────────────────────────────────────────────────────────────────
function draw() {
  ctx.fillStyle = '#000010'; ctx.fillRect(0, 0, W, H);
  drawPlatforms();
  drawLadders();
  drawPauline();
  drawDK();
  drawBarrels();
  if (gameState !== 'dying' || Math.floor(fc / 5) % 2 === 0) drawPlayer();
}

// ── Loop ─────────────────────────────────────────────────────────────────────
function loop() { update(); draw(); requestAnimationFrame(loop); }

initGame();
loop();
