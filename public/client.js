const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const socket = io();

let state = { players: [], bullets: [] };

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  angle: 0
};

document.addEventListener("keydown", e => {
  if (e.key === "w") input.up = true;
  if (e.key === "s") input.down = true;
  if (e.key === "a") input.left = true;
  if (e.key === "d") input.right = true;
});

document.addEventListener("keyup", e => {
  if (e.key === "w") input.up = false;
  if (e.key === "s") input.down = false;
  if (e.key === "a") input.left = false;
  if (e.key === "d") input.right = false;
});

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  input.angle = Math.atan2(my - canvas.height / 2, mx - canvas.width / 2);
});

canvas.addEventListener("click", () => socket.emit("shoot"));

function sendInput() {
  socket.emit("input", input);
  requestAnimationFrame(sendInput);
}
sendInput();

socket.on("state", s => state = s);

document.getElementById("setName").onclick = () => {
  socket.emit("set_name", document.getElementById("nameInput").value);
};

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  // body
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(-15, -20, 30, 40);

  // head
  ctx.beginPath();
  ctx.arc(0, -30, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#fde68a";
  ctx.fill();

  // legs
  ctx.fillRect(-12, 20, 8, 18);
  ctx.fillRect(4, 20, 8, 18);

  ctx.restore();

  // name
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText(p.name, p.x, p.y - 50);

  // health bar
  ctx.fillStyle = "red";
  ctx.fillRect(p.x - 18, p.y + 45, 36, 5);
  ctx.fillStyle = "lime";
  ctx.fillRect(p.x - 18, p.y + 45, 36 * (p.health / 100), 5);
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  state.players.forEach(drawPlayer);

  ctx.fillStyle = "yellow";
  state.bullets.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  requestAnimationFrame(loop);
}
loop();
