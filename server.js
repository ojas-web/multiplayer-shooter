const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

// ===================== GAME STATE =====================
const players = new Map();            // socket.id -> player
const bullets = new Map();            // bulletId -> bullet
const persistentScores = new Map();   // pid -> score
const pidToSocket = new Map();         // pid -> socket.id

// ===================== CONSTANTS =====================
const WORLD_SIZE = { width: 2400, height: 1400 };
const PLAYER_SPEED = 500;
const BULLET_SPEED = 850;
const BULLET_LIFETIME = 1500;
const TICK_RATE = 1000 / 60;
const PLAYER_RADIUS = 18;
const BULLET_RADIUS = 6;
const START_HEALTH = 100;

let bulletIdCounter = 0;

// ===================== HELPERS =====================
function randomSpawn() {
  return {
    x: 100 + Math.random() * (WORLD_SIZE.width - 200),
    y: 100 + Math.random() * (WORLD_SIZE.height - 200)
  };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function respawn(player) {
  const spawn = randomSpawn();
  player.x = spawn.x;
  player.y = spawn.y;
  player.health = START_HEALTH;
}

// ===================== SOCKET.IO =====================
io.on('connection', (socket) => {
  const pid = socket.handshake.auth?.pid;
  if (!pid) {
    socket.disconnect();
    return;
  }

  // 🔒 only one active socket per pid
  const oldSocketId = pidToSocket.get(pid);
  if (oldSocketId && oldSocketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(oldSocketId);
    if (oldSocket) oldSocket.disconnect(true);
    players.delete(oldSocketId);
  }
  pidToSocket.set(pid, socket.id);

  // create or restore player
  let player = [...players.values()].find(p => p.pid === pid);
  if (!player) {
    const spawn = randomSpawn();
    player = {
      pid,
      id: socket.id,
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      name: `Pilot-${pid.slice(0, 4)}`,
      health: START_HEALTH,
      score: persistentScores.get(pid) || 0,
      input: { up: false, down: false, left: false, right: false },
      lastShotAt: 0
    };
  } else {
    player.id = socket.id;
  }

  socket.on("connect", () => {
  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    socket.emit("setName", savedName);
  }
});

  players.set(socket.id, player);

  socket.emit('welcome', {
    id: socket.id,
    world: WORLD_SIZE,
    playerRadius: PLAYER_RADIUS
  });

  // ================= INPUT =================
  socket.on('set_name', (name) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (typeof name === 'string') {
      p.name = name.trim().slice(0, 18) || p.name;
    }
  });

  socket.on('input', (input) => {
    const p = players.get(socket.id);
    if (!p) return;

    p.input = {
      up: !!input.up,
      down: !!input.down,
      left: !!input.left,
      right: !!input.right
    };

    if (typeof input.angle === 'number') {
      p.angle = input.angle;
    }
  });

  // ================= SHOOT =================
  socket.on('shoot', () => {
    const p = players.get(socket.id);
    if (!p) return;

    const now = Date.now();
    if (now - p.lastShotAt < 140) return;
    p.lastShotAt = now;

    const id = `b${++bulletIdCounter}`;
    bullets.set(id, {
      id,
      ownerPid: p.pid,
      x: p.x + Math.cos(p.angle) * (PLAYER_RADIUS + 4),
      y: p.y + Math.sin(p.angle) * (PLAYER_RADIUS + 4),
      vx: Math.cos(p.angle) * BULLET_SPEED,
      vy: Math.sin(p.angle) * BULLET_SPEED,
      bornAt: now
    });
  });

  // ================= DISCONNECT =================
  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (p) {
      persistentScores.set(p.pid, p.score);
      if (pidToSocket.get(p.pid) === socket.id) {
        pidToSocket.delete(p.pid);
      }
    }
    players.delete(socket.id);
  });
});

// ===================== GAME LOOP =====================
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;

  // movement
  for (const p of players.values()) {
    let dx = 0, dy = 0;
    if (p.input.up) dy--;
    if (p.input.down) dy++;
    if (p.input.left) dx--;
    if (p.input.right) dx++;

    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      p.x = clamp(p.x + dx * PLAYER_SPEED * dt, PLAYER_RADIUS, WORLD_SIZE.width - PLAYER_RADIUS);
      p.y = clamp(p.y + dy * PLAYER_SPEED * dt, PLAYER_RADIUS, WORLD_SIZE.height - PLAYER_RADIUS);
    }
  }

  // bullets
  for (const [id, b] of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (
      now - b.bornAt > BULLET_LIFETIME ||
      b.x < -20 || b.y < -20 ||
      b.x > WORLD_SIZE.width + 20 ||
      b.y > WORLD_SIZE.height + 20
    ) {
      bullets.delete(id);
      continue;
    }

    for (const target of players.values()) {
      if (target.pid === b.ownerPid) continue;

      const d = Math.hypot(target.x - b.x, target.y - b.y);
      if (d <= PLAYER_RADIUS + BULLET_RADIUS) {
        bullets.delete(id);
        target.health -= 25;

        if (target.health <= 0) {
          const killer = [...players.values()].find(p => p.pid === b.ownerPid);
          if (killer) {
            killer.score++;
            persistentScores.set(killer.pid, killer.score);
          }
          respawn(target);
        }
        break;
      }
    }
  }

  // send state
  io.emit('state', {
    players: [...players.values()].map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      angle: p.angle,
      name: p.name,
      health: p.health,
      score: p.score
    })),
    bullets: [...bullets.values()].map(b => ({ x: b.x, y: b.y })),
    world: WORLD_SIZE
  });
}, TICK_RATE);

// ===================== START =====================
server.listen(PORT, () => {
  console.log(`Multiplayer shooter running at http://localhost:${PORT}`);
});
