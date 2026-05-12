'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const messageEl = document.getElementById('message');

const W = canvas.width;
const H = canvas.height;

// --- Layout constants ---
const PADDLE_W = 80;
const PADDLE_H = 12;
const PADDLE_Y = H - 40;
const BALL_R = 8;

const BRICK_COLS = 10;
const BRICK_ROWS = 5;
const BRICK_W = Math.floor((W - 20) / BRICK_COLS);
const BRICK_H = 20;
const BRICK_PADDING = 3;
const BRICK_TOP = 50;
const BRICK_LEFT = 10;

// Brick hit points per row (bottom row = 1, top rows = higher)
const ROW_HP = [1, 1, 2, 2, 3];
// Colors per HP value
const HP_COLORS = {
  1: '#e94560',
  2: '#f5a623',
  3: '#7ed321',
};

// --- Game state ---
let score, lives, level, state;
// state: 'idle' | 'playing' | 'dead' | 'win' | 'over'

let paddle, ball, bricks, ballAttached;

function init(keepLevel = false) {
  if (!keepLevel) level = 1;
  score = score || 0;
  lives = 3;
  state = 'idle';
  ballAttached = true;
  spawnEntities();
  updateHUD();
  messageEl.textContent = 'Space キーを押してスタート';
}

function spawnEntities() {
  paddle = { x: W / 2 - PADDLE_W / 2, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H };

  const speed = 3 + (level - 1) * 0.5;
  ball = {
    x: paddle.x + PADDLE_W / 2,
    y: PADDLE_Y - BALL_R,
    dx: speed * (Math.random() < 0.5 ? 1 : -1),
    dy: -speed,
    r: BALL_R,
  };

  bricks = [];
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      const hp = ROW_HP[row];
      bricks.push({
        x: BRICK_LEFT + col * BRICK_W + BRICK_PADDING,
        y: BRICK_TOP + row * BRICK_H + BRICK_PADDING,
        w: BRICK_W - BRICK_PADDING * 2,
        h: BRICK_H - BRICK_PADDING * 2,
        hp,
        maxHp: hp,
      });
    }
  }
}

function updateHUD() {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
}

// --- Input ---
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') onSpace();
  e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  paddle.x = Math.max(0, Math.min(W - paddle.w, mx - paddle.w / 2));
  if (ballAttached) ball.x = paddle.x + paddle.w / 2;
});

canvas.addEventListener('click', () => onSpace());

function onSpace() {
  if (state === 'idle') {
    state = 'playing';
    ballAttached = false;
    messageEl.textContent = '';
  } else if (state === 'dead') {
    state = 'idle';
    ballAttached = true;
    spawnEntities();
    updateHUD();
    messageEl.textContent = 'Space キーを押してスタート';
  } else if (state === 'over' || state === 'win') {
    score = 0;
    level = state === 'win' ? level + 1 : 1;
    init(true);
  }
}

// --- Physics helpers ---
function rectCircleCollision(rect, cx, cy, r) {
  const nearX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy <= r * r;
}

function resolveCircleRect(rect, b) {
  const nearX = Math.max(rect.x, Math.min(b.x, rect.x + rect.w));
  const nearY = Math.max(rect.y, Math.min(b.y, rect.y + rect.h));
  const dx = b.x - nearX;
  const dy = b.y - nearY;

  // Determine dominant collision axis
  const overlapX = (rect.w / 2 + b.r) - Math.abs(b.x - (rect.x + rect.w / 2));
  const overlapY = (rect.h / 2 + b.r) - Math.abs(b.y - (rect.y + rect.h / 2));

  if (overlapX < overlapY) {
    b.dx = -b.dx;
    b.x += b.dx > 0 ? overlapX : -overlapX;
  } else {
    b.dy = -b.dy;
    b.y += b.dy > 0 ? overlapY : -overlapY;
  }
}

// --- Update ---
function update() {
  if (state !== 'playing') return;

  // Paddle movement via keyboard
  const speed = 6;
  if (keys['ArrowLeft']) paddle.x = Math.max(0, paddle.x - speed);
  if (keys['ArrowRight']) paddle.x = Math.min(W - paddle.w, paddle.x + speed);

  if (ballAttached) {
    ball.x = paddle.x + paddle.w / 2;
    return;
  }

  ball.x += ball.dx;
  ball.y += ball.dy;

  // Wall collisions
  if (ball.x - ball.r < 0) { ball.x = ball.r; ball.dx = Math.abs(ball.dx); }
  if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.dx = -Math.abs(ball.dx); }
  if (ball.y - ball.r < 0) { ball.y = ball.r; ball.dy = Math.abs(ball.dy); }

  // Ball lost
  if (ball.y - ball.r > H) {
    lives--;
    updateHUD();
    if (lives <= 0) {
      state = 'over';
      messageEl.textContent = 'ゲームオーバー！ Space で再挑戦';
    } else {
      state = 'dead';
      messageEl.textContent = `ミス！ 残りライフ: ${lives}  Space で続ける`;
    }
    return;
  }

  // Paddle collision
  if (rectCircleCollision(paddle, ball.x, ball.y, ball.r)) {
    resolveCircleRect(paddle, ball);
    // Add slight spin based on hit position
    const hitPos = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    ball.dx += hitPos * 1.5;
    const speed = Math.hypot(ball.dx, ball.dy);
    const maxSpeed = 12;
    if (speed > maxSpeed) {
      ball.dx = (ball.dx / speed) * maxSpeed;
      ball.dy = (ball.dy / speed) * maxSpeed;
    }
  }

  // Brick collisions
  let remaining = 0;
  for (const brick of bricks) {
    if (brick.hp <= 0) continue;
    remaining++;
    if (rectCircleCollision(brick, ball.x, ball.y, ball.r)) {
      resolveCircleRect(brick, ball);
      brick.hp--;
      score += brick.maxHp * 10;
      updateHUD();
    }
  }

  remaining = bricks.filter(b => b.hp > 0).length;
  if (remaining === 0) {
    state = 'win';
    messageEl.textContent = `レベル ${level} クリア！ Space で次のレベルへ`;
  }
}

// --- Draw ---
function drawBrick(b) {
  const alpha = b.hp / b.maxHp;
  const color = HP_COLORS[b.maxHp] || '#e94560';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.4 + alpha * 0.6;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, 3);
  ctx.fill();
  ctx.globalAlpha = 1;

  // HP pips
  if (b.maxHp > 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const pipR = 3;
    const totalPips = b.maxHp;
    const spacing = 10;
    const startX = b.x + b.w / 2 - (totalPips - 1) * spacing / 2;
    for (let i = 0; i < totalPips; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * spacing, b.y + b.h / 2, pipR, 0, Math.PI * 2);
      ctx.fillStyle = i < b.hp ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)';
      ctx.fill();
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Bricks
  for (const b of bricks) {
    if (b.hp > 0) drawBrick(b);
  }

  // Paddle
  const grad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  grad.addColorStop(0, '#5b8dee');
  grad.addColorStop(1, '#3a67c8');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 6);
  ctx.fill();

  // Ball
  const ballGrad = ctx.createRadialGradient(
    ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, ball.r * 0.1,
    ball.x, ball.y, ball.r
  );
  ballGrad.addColorStop(0, '#ffffff');
  ballGrad.addColorStop(1, '#a0c4ff');
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
}

// --- Loop ---
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// --- Start ---
init();
loop();
