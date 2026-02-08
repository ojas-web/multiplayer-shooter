// ================= MOBILE DETECTION =================
const isMobile =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  ('ontouchstart' in window);

if (isMobile) document.body.classList.add('mobile');

// ================= PERSISTENT ID =================
function generateId() {
  return 'pid-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let pid = localStorage.getItem('pid');
if (!pid) {
  pid = generateId();
  localStorage.setItem('pid', pid);
}

// ================= PLAYER NAME =================
let playerName = localStorage.getItem("playerName") || "";

// ================= CANVAS =================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ================= UI =================
const leaderboardEl = document.getElementById('leaderboard');
const playerInfoEl = document.getElementById('playerInfo');
const setNameBtn = document.getElementById('setNameBtn');
const nameInput = document.getElementById('nameInput');

if (playerName) nameInput.value = playerName;

// ================= SOCKET =================
const socket = io({
  auth: { pid }
});

let myId = null;
let world = { width: 2400, height: 1400 };
let playerRadius = 18;

let state = { players: [], bullets: [] };

socket.on('welcome', data => {
  myId = data.id;
  world = data.world;
  playerRadius = data.playerRadius;

  if (playerName) {
    socket.emit("set_name", playerName);
  }
});

socket.on('state', next => {
  state = next;
  updateLeaderboard();
});

// ================= SET NAME =================
setNameBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) return;

  playerName = name;
  localStorage.setItem("playerName", name);
  socket.emit("set_name", name);
};

// ================= INPUT =================
const keys = { up:false, down:false, left:false, right:false };
let mouse = { x:0, y:0, down:false };

window.onkeydown = e => {
  if (e.key === 'w' || e.key === 'ArrowUp') keys.up = true;
  if (e.key === 's' || e.key === 'ArrowDown') keys.down = true;
  if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = true;
  if (e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
};

window.onkeyup = e => {
  if (e.key === 'w' || e.key === 'ArrowUp') keys.up = false;
  if (e.key === 's' || e.key === 'ArrowDown') keys.down = false;
  if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = false;
  if (e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
};

canvas.onmousemove = e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
};

canvas.onmousedown = () => mouse.down = true;
window.onmouseup = () => mouse.down = false;

// ================= GAME LOOP =================
setInterval(() => {
  const me = state.players.find(p => p.id === myId);
  let angle = 0;

  if (me) {
    const camX = me.x - world.width / 2 + canvas.width / 2;
    const camY = me.y - world.height / 2 + canvas.height / 2;
    angle = Math.atan2(mouse.y - camY, mouse.x - camX);
  }

  socket.emit('input', { ...keys, angle });
  if (mouse.down) socket.emit('shoot');
}, 1000/60);

// ================= RENDER =================
function render() {
  requestAnimationFrame(render);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const me = state.players.find(p => p.id === myId);
  let ox = canvas.width/2 - (me?.x || world.width/2);
  let oy = canvas.height/2 - (me?.y || world.height/2);

  ctx.fillStyle = "#020617";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x + ox, b.y + oy, 5, 0, Math.PI*2);
    ctx.fillStyle = "#f43f5e";
    ctx.fill();
  }

  for (const p of state.players) {
    ctx.beginPath();
    ctx.arc(p.x+ox, p.y+oy, playerRadius, 0, Math.PI*2);
    ctx.fillStyle = p.id===myId ? "#22d3ee" : "#a78bfa";
    ctx.fill();

    ctx.fillStyle="#fff";
    ctx.textAlign="center";
    ctx.fillText(p.name, p.x+ox, p.y+oy-playerRadius-10);
  }

  if (me) {
    playerInfoEl.textContent = `${me.name} · HP ${me.health} · Score ${me.score}`;
  }
}
render();

// ================= LEADERBOARD =================
function updateLeaderboard() {
  leaderboardEl.innerHTML="";
  [...state.players]
    .sort((a,b)=>b.score-a.score)
    .slice(0,8)
    .forEach(p=>{
      const li=document.createElement("li");
      li.textContent=`${p.name} — ${p.score}`;
      leaderboardEl.appendChild(li);
    });
}
