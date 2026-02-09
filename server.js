const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ================= DATA =================
const players = new Map();       // socket.id -> player
const bullets = new Map();
const pidToSocket = new Map();
const persistentScores = new Map();
const persistentNames = new Map();

// ================= CONSTANTS =================
const WORLD = { width:2400, height:1400 };
const SPEED = 500;
const BULLET_SPEED = 850;
const PLAYER_RADIUS = 18;
const BULLET_RADIUS = 6;
const START_HP = 100;

// ================= HELPERS =================
function spawn() {
  return {
    x:100+Math.random()*(WORLD.width-200),
    y:100+Math.random()*(WORLD.height-200)
  };
}

// ================= SOCKET =================
io.on('connection', socket => {
  const pid = socket.handshake.auth?.pid;
  if (!pid) return socket.disconnect();

  const old = pidToSocket.get(pid);
  if (old && old !== socket.id) {
    io.sockets.sockets.get(old)?.disconnect(true);
    players.delete(old);
  }
  pidToSocket.set(pid, socket.id);

  const pos = spawn();
  const player = {
    pid,
    id: socket.id,
    ...pos,
    angle:0,
    name: persistentNames.get(pid) || `Pilot-${pid.slice(0,4)}`,
    health: START_HP,
    score: persistentScores.get(pid) || 0,
    input:{},
    lastShot:0
  };

  players.set(socket.id, player);

  socket.emit('welcome',{
    id:socket.id,
    world:WORLD,
    playerRadius:PLAYER_RADIUS
  });

  socket.on('set_name', name => {
    if (!name) return;
    player.name = name.slice(0,18);
    persistentNames.set(pid, player.name);
  });

  socket.on('input', i => {
    player.input = i;
    if (typeof i.angle === "number") player.angle = i.angle;
  });

  socket.on('shoot', () => {
    const now=Date.now();
    if (now-player.lastShot<140) return;
    player.lastShot=now;

    const id=`b${now}${Math.random()}`;
    bullets.set(id,{
      x:player.x,
      y:player.y,
      vx:Math.cos(player.angle)*BULLET_SPEED,
      vy:Math.sin(player.angle)*BULLET_SPEED,
      owner:pid,
      born:now
    });
  });

  socket.on('disconnect',()=>{
    persistentScores.set(pid, player.score);
    players.delete(socket.id);
  });
});

// ================= GAME LOOP =================
setInterval(()=>{
  for (const p of players.values()) {
    let dx=(p.input.right?1:0)-(p.input.left?1:0);
    let dy=(p.input.down?1:0)-(p.input.up?1:0);
    const len=Math.hypot(dx,dy)||1;
    p.x+=dx/len*SPEED/60;
    p.y+=dy/len*SPEED/60;
  }

  for (const [id,b] of bullets) {
    b.x+=b.vx/60;
    b.y+=b.vy/60;

    for (const p of players.values()) {
      if (p.pid===b.owner) continue;
      if (Math.hypot(p.x-b.x,p.y-b.y)<PLAYER_RADIUS+BULLET_RADIUS) {
        bullets.delete(id);
        p.health-=25;
        if (p.health<=0) {
          const killer=[...players.values()].find(x=>x.pid===b.owner);
          if (killer) killer.score++;
          p.health=START_HP;
          Object.assign(p,spawn());
        }
      }
    }
  }

  io.emit('state',{
    players:[...players.values()],
    bullets:[...bullets.values()],
    world:WORLD
  });
},1000/60);

// ================= START =================
server.listen(PORT,()=>{
  console.log("Server running on port",PORT);
});
