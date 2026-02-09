const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
app.use(express.static("public"));

const players = new Map();
const bullets = new Map();

const WORLD = { width: 2400, height: 1400 };
const SPEED = 500;
const BULLET_SPEED = 900;
const PLAYER_RADIUS = 20;
const START_HEALTH = 100;

let bulletId = 0;

function spawn() {
  return {
    x: Math.random() * (WORLD.width - 200) + 100,
    y: Math.random() * (WORLD.height - 200) + 100
  };
}

io.on("connection", socket => {
  const pos = spawn();

  const player = {
    id: socket.id,
    x: pos.x,
    y: pos.y,
    angle: 0,
    name: "Player",
    health: START_HEALTH,
    input: { up: false, down: false, left: false, right: false }
  };

  players.set(socket.id, player);

  socket.on("input", data => {
    if (!players.has(socket.id)) return;
    player.input = data;
  });

  socket.on("set_name", name => {
    if (typeof name === "string") {
      player.name = name.slice(0, 18);
    }
  });

  socket.on("shoot", () => {
    const id = "b" + bulletId++;
    bullets.set(id, {
      id,
      x: player.x,
      y: player.y,
      vx: Math.cos(player.angle) * BULLET_SPEED,
      vy: Math.sin(player.angle) * BULLET_SPEED,
      owner: socket.id,
      born: Date.now()
    });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
  });
});

setInterval(() => {
  const dt = 1 / 60;

  // movement
  for (const p of players.values()) {
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);

    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      p.x += dx * SPEED * dt;
      p.y += dy * SPEED * dt;
    }
  }

  // bullets
  for (const [id, b] of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (Date.now() - b.born > 1500) {
      bullets.delete(id);
      continue;
    }

    for (const p of players.values()) {
      if (p.id === b.owner) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < PLAYER_RADIUS) {
        p.health -= 25;
        bullets.delete(id);
        if (p.health <= 0) {
          const s = spawn();
          p.x = s.x;
          p.y = s.y;
          p.health = START_HEALTH;
        }
        break;
      }
    }
  }

  io.emit("state", {
    players: [...players.values()],
    bullets: [...bullets.values()],
    world: WORLD
  });
}, 1000 / 60);

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
