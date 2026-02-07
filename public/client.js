// 1️⃣ Canvas first
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 2️⃣ Resize function AFTER canvas exists
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resize);
resize(); // safe now

// 3️⃣ Persistent ID + socket AFTER canvas
function generateId() {
  return 'pid-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}



let persistentId = localStorage.getItem('pid');
if (!persistentId) {
  persistentId = generateId();
  localStorage.setItem('pid', persistentId);
}








const leaderboardEl = document.getElementById('leaderboard');
const playerInfoEl = document.getElementById('playerInfo');
const setNameBtn = document.getElementById('setNameBtn');
const nameInput = document.getElementById('nameInput');

const keys = { up: false, down: false, left: false, right: false };
let mouse = { x: 0, y: 0, down: false };
let myId = null;
let world = { width: 2400, height: 1400 };
let playerRadius = 18;

let state = {
  players: [],
  bullets: []
};

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();


if (!persistentId) {
  persistentId = generateId();
  localStorage.setItem('pid', persistentId);
}

const socket = io({
  auth: { pid: persistentId }
});


socket.on('welcome', (payload) => {
  myId = payload.id;
  world = payload.world;
  playerRadius = payload.playerRadius;
});

socket.on('state', (next) => {
  state = next;
  world = next.world || world;
  updateLeaderboard();
});

setNameBtn.addEventListener('click', () => {
  socket.emit('set_name', nameInput.value);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') keys.up = true;
  if (e.key === 's' || e.key === 'ArrowDown') keys.down = true;
  if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = true;
  if (e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') keys.up = false;
  if (e.key === 's' || e.key === 'ArrowDown') keys.down = false;
  if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = false;
  if (e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});


canvas.addEventListener('mousedown', () => {
  mouse.down = true;
  shoot();
});

window.addEventListener('mouseup', () => {
  mouse.down = false;
});

function shoot() {
  socket.emit('shoot');
}


setInterval(() => {
  const me = state.players.find((p) => p.id === myId);
  let angle = 0;
  if (me) {
    const cam = camera(me);
    angle = Math.atan2(mouse.y - cam.screenY, mouse.x - cam.screenX);
  }

  socket.emit('input', {
    ...keys,
    angle
  });

  if (mouse.down) {
    shoot();
  }
}, 1000 / 60);

function camera(me) {
  const x = Math.min(Math.max(me.x, canvas.width / 2), world.width - canvas.width / 2);
  const y = Math.min(Math.max(me.y, canvas.height / 2), world.height - canvas.height / 2);
  return {
    x,
    y,
    screenX: me.x - x + canvas.width / 2,
    screenY: me.y - y + canvas.height / 2
  };
}

function drawGrid(offsetX, offsetY) {
  const spacing = 70;
  ctx.strokeStyle = 'rgba(148,163,184,0.13)';
  ctx.lineWidth = 1;

  for (let x = -((offsetX % spacing) + spacing); x < canvas.width + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = -((offsetY % spacing) + spacing); y < canvas.height + spacing; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function render() {
  requestAnimationFrame(render);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const me = state.players.find((p) => p.id === myId);

  let camX = world.width / 2;
  let camY = world.height / 2;

  if (me) {
    const cam = camera(me);
    camX = cam.x;
    camY = cam.y;
  }

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid(camX, camY);

  const offsetX = canvas.width / 2 - camX;
  const offsetY = canvas.height / 2 - camY;

  ctx.strokeStyle = 'rgba(2,132,199,0.8)';
  ctx.lineWidth = 3;
  ctx.strokeRect(offsetX, offsetY, world.width, world.height);

  for (const bullet of state.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x + offsetX, bullet.y + offsetY, 5.0, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();
  }

  for (const player of state.players) {
    const x = player.x + offsetX;
    const y = player.y + offsetY;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.angle);

    ctx.beginPath();
    ctx.arc(0, 0, playerRadius, 0, Math.PI * 2);
    ctx.fillStyle = player.id === myId ? '#22d3ee' : '#a78bfa';
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, -4, playerRadius + 12, 8);
    ctx.restore();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, x, y - playerRadius - 12);

    const hpWidth = 40;
    const healthRatio = Math.max(0, Math.min(1, player.health / 100));
    ctx.fillStyle = 'rgba(15,23,42,0.8)';
    ctx.fillRect(x - hpWidth / 2, y + playerRadius + 8, hpWidth, 6);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(x - hpWidth / 2, y + playerRadius + 8, hpWidth * healthRatio, 6);
  }

  if (me) {
    playerInfoEl.textContent = `${me.name} · HP ${me.health} · Score ${me.score}`;
  }
}

function updateLeaderboard() {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  leaderboardEl.innerHTML = '';
  for (const p of sorted.slice(0, 8)) {
    const li = document.createElement('li');
    li.textContent = `${p.name} — ${p.score}`;
    leaderboardEl.appendChild(li);
  }
}

render();