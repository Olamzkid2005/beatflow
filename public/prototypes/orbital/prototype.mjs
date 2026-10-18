const $ = (id) => document.getElementById(id);
const canvas = $("scene");
const ctx = canvas.getContext("2d");
const controls = ["title", "message", "background", "rings", "sensitivity", "time"];
const images = {};
let seed = 421337;
let running = false;
let raf = 0;
let last = null;
let playbackTime = 0;
let points = [];
let segments = [];
const random = (value) => () => {
  value |= 0; value = (value + 0x6d2b79f5) | 0;
  let n = Math.imul(value ^ (value >>> 15), 1 | value);
  n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
};
function prepare() {
  const rng = random(seed);
  points = Array.from({ length: 1500 }, () => {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 178;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, size: 1 + rng() * 2, alpha: 0.2 + rng() * 0.8 };
  });
  segments = Array.from({ length: 12 }, () => Array.from({ length: 54 }, () => rng()));
  $("seed").textContent = String(seed);
}
function text(value, x, y, width, size, color, spacing = 0) {
  ctx.save(); ctx.fillStyle = color; ctx.textBaseline = "top";
  ctx.letterSpacing = `${spacing}px`;
  for (; size > 12; size -= 1) {
    ctx.font = `500 ${size}px 'Orbital',monospace`;
    if (ctx.measureText(value).width <= width) break;
  }
  ctx.beginPath(); ctx.rect(x, y, width, size * 1.5); ctx.clip();
  ctx.fillText(value, x, y); ctx.restore();
}
function draw() {
  const time = Number($("time").value);
  const rings = Number($("rings").value);
  const sensitivity = Number($("sensitivity").value);
  $("rings-value").textContent = String(rings);
  $("sensitivity-value").textContent = sensitivity.toFixed(2);
  $("time-value").textContent = `${time.toFixed(2)} s`;
  const warm = $("background").value === "umber";
  const ink = warm ? "#ead7b9" : "#d9dbd0";
  ctx.globalAlpha = 1; ctx.drawImage(images[$("background").value], 0, 0, 1920, 1080);
  // A deterministic synthetic curve, deliberately not called audio-reactive.
  const energy = Math.min(1, Math.max(0, (Math.sin(time * 5.8) * 0.5 + 0.5) ** 5 * sensitivity));
  const pulse = 1 + energy * 0.045;
  const rotation = time * 0.75 / 60 * Math.PI * 2;
  ctx.save(); ctx.beginPath(); ctx.rect(220, 220, 1480, 640); ctx.clip();
  ctx.translate(960, 540); ctx.scale(pulse, pulse);
  ctx.strokeStyle = ink;
  const ellipse = (radius, start = 0, end = Math.PI * 2) => {
    ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * 0.32, -0.21, start, end);
  };
  for (let r = 0; r < rings; r++) {
    const radius = 330 + r * 24;
    ctx.globalAlpha = 0.16; ctx.lineWidth = 1; ellipse(radius); ctx.stroke();
    for (let s = 0; s < 54; s++) {
      const n = segments[r][s]; if (n < 0.72) continue;
      const angle = s / 54 * Math.PI * 2 + rotation * (r % 2 ? -1 : 1);
      ctx.globalAlpha = (0.18 + n * 0.35) * (0.7 + energy * 0.3);
      ctx.lineWidth = n > 0.95 ? 5 : 2;
      ellipse(radius, angle, angle + 0.025 + n * 0.025); ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.20; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-660, 0); ctx.lineTo(660, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -280); ctx.lineTo(0, 280); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 180, 0, Math.PI * 2); ctx.clip();
  ctx.globalAlpha = 1; ctx.fillStyle = "#080909"; ctx.fillRect(-180, -180, 360, 360);
  ctx.rotate(rotation * 0.2);
  for (const p of points) {
    const diagonal = p.y + p.x * 0.28;
    if (diagonal > -24 && diagonal < 9) continue;
    ctx.globalAlpha = p.alpha * (diagonal > 9 ? 0.9 : 0.45);
    ctx.fillStyle = ink; ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.restore(); ctx.globalAlpha = 0.85; ctx.lineWidth = 2;
  ellipse(310, 0.18 + rotation, 2.85 + rotation); ctx.stroke();
  ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, 119); ctx.lineTo(120, 272); ctx.stroke();
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(92, 165, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  text($("title").value, 96, 78, 1060, 42, ink, 6);
  text("134 BPM", 1320, 82, 230, 22, ink); text("A MIN", 1600, 82, 224, 22, ink);
  text($("message").value, 96, 938, 1728, 24, ink);
  text("YOUR PRODUCER NAME", 96, 1001, 1728, 16, warm ? "#b59f80" : "#969b91");
}
function pause() {
  running = false; cancelAnimationFrame(raf); raf = 0;
  $("play").textContent = "Play simulated motion";
}
function tick(now) {
  if (!running) return;
  const elapsed = last === null ? 0 : Math.max(0, Math.min((now - last) / 1000, 0.1)); last = now;
  playbackTime += elapsed;
  const next = playbackTime;
  $("time").value = String(Math.min(30, next)); draw();
  if (next >= 30) pause(); else raf = requestAnimationFrame(tick);
}
async function start() {
  await Promise.all(["monochrome", "obsidian", "umber"].map(async (name) => {
    const image = new Image(); image.src = `../../images/orbital/background-${name}.jpg`;
    await image.decode(); images[name] = image;
  }));
  await document.fonts.load("500 42px Orbital");
  prepare(); draw();
  for (const id of controls) $(id).addEventListener("input", () => { if (id === "time") pause(); draw(); });
  $("play").addEventListener("click", () => {
    if (running) { pause(); return; }
    if (Number($("time").value) >= 30) $("time").value = "0";
    playbackTime = Number($("time").value);
    running = true; last = null; $("play").textContent = "Pause simulated motion";
    raf = requestAnimationFrame(tick);
  });
  $("reset").addEventListener("click", () => { pause(); $("time").value = "0"; draw(); });
  $("shuffle").addEventListener("click", () => { seed = (seed + 104729) >>> 0; prepare(); draw(); });
  $("download").addEventListener("click", () => {
    canvas.toBlob((blob) => {
      if (!blob) { $("status").textContent = "PNG creation failed. Try again."; return; }
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = "orbital-prototype.png"; link.click();
      // The download starts before its temporary URL is released.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $("status").textContent = "Downloaded a flattened prototype PNG, not an editable preset.";
    }, "image/png");
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("pagehide", pause);
  for (const id of ["play", "reset", "shuffle", "download"]) $(id).disabled = false;
  $("status").textContent = "Ready. Motion stays paused until you press Play. All controls work locally.";
  window.orbitalPrototype = { ready: true, draw, getState: () => ({seed, running, time:Number($("time").value)}) };
}
start().catch((error) => { $("status").textContent = `Could not prepare the prototype: ${error.message}`; throw error; });
