/** Original procedural artwork; browser-only generation, not the app's motion renderer. */
export async function createOrbitalArtwork() {
  const W = 1920;
  const H = 1080;
  const images = [];
  const makeCanvas = (width = W, height = H) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const random = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const noise = (x, y, salt) => {
    const hash = (a, b) => {
      let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ salt;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
    const bottom = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  const fbm = (x, y, seed) =>
    noise(x, y, seed) * 0.57 + noise(x * 2.1, y * 2.1, seed + 7) * 0.28 +
    noise(x * 4.3, y * 4.3, seed + 17) * 0.15;
  const clamp = (n, low = 0, high = 255) => Math.min(high, Math.max(low, n));
  const save = async (name, canvas, kind, description, mime = "image/png", quality) => {
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error(`Encoding failed: ${name}`)), mime, quality,
    ));
    const info = { name, width: canvas.width, height: canvas.height, mime, kind, description };
    const response = await fetch(`/save?name=${encodeURIComponent(name)}`, { method: "POST", body: blob });
    if (!response.ok) throw new Error(`Could not save ${name}: ${response.status}`);
    images.push(info);
  };

  function background(variant) {
    const canvas = makeCanvas();
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(W, H);
    const rng = random(421337 + variant);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = x / W;
        const ny = y / H;
        const cloud = fbm(nx * 4.2, ny * 3.4, 98341);
        const ribbon = Math.exp(-(((nx - 0.18 - ny * 0.62 - (cloud - 0.5) * 0.6) / 0.26) ** 2));
        const edge = Math.max(0, 1 - ((nx - 0.5) ** 2 * 1.4 + (ny - 0.5) ** 2));
        const field = ribbon * (0.48 + cloud * 0.52) * edge;
        const noiseValue = (rng() - 0.5) * (variant === 1 ? 5 : 9);
        const shade = variant === 1 ? 9 + field * 24 : 12 + field * 104;
        // Quiet text bands; the central atmosphere stays independent of future graphic layers.
        const band = Math.min(1, Math.min(ny / 0.22, (1 - ny) / 0.22));
        const value = (shade + noiseValue) * (0.48 + 0.52 * band);
        const i = (y * W + x) * 4;
        const tint = variant === 2 ? [1.12, 0.91, 0.69] : [1, 1.015, 0.98];
        image.data[i] = clamp(value * tint[0]);
        image.data[i + 1] = clamp(value * tint[1]);
        image.data[i + 2] = clamp(value * tint[2]);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function texture(stipple) {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(256, 256);
    const rng = random(stipple ? 88031 : 78131);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = rng();
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = stipple ? (n > 0.965 ? 80 + Math.floor(rng() * 110) : 0)
        : (n > 0.2 ? Math.floor((n - 0.2) * 70) : 0);
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  await fetch('/progress?stage=backgrounds-start');
  const fog = background(0);
  const dark = background(1);
  const warm = background(2);
  const grain = texture(false);
  const stipple = texture(true);
  await fetch('/progress?stage=backgrounds-drawn');
  await save("background-monochrome.jpg", fog, "background", "Text-free silver-charcoal fog; closest to the supplied atmosphere.", "image/jpeg", 0.91);
  await save("background-obsidian.jpg", dark, "background", "Text-free near-black atmosphere for a quieter, higher-contrast graphic.", "image/jpeg", 0.91);
  await save("background-umber.jpg", warm, "background", "Text-free muted warm-dust alternative; identical safe text bands.", "image/jpeg", 0.91);
  await save("grain-alpha.png", grain, "texture", "White alpha film grain, 256 px repeating tile; tint at draw time.");
  await save("stipple-alpha.png", stipple, "texture", "Sparse white alpha stipple, 256 px repeating tile; tint at draw time.");

  await fetch('/progress?stage=textures-saved');
  const font = new FontFace("Orbital Mono", "url(/font.woff2)", { weight: "100 800" });
  await font.load();
  await fetch('/progress?stage=font-loaded');
  document.fonts.add(font);
  const mono = (ctx, size, color = "#dddcd0", weight = 400) => {
    ctx.font = `${weight} ${size}px 'Orbital Mono'`;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
  };
  function concept(base, warmInk = false) {
    const canvas = makeCanvas();
    const ctx = canvas.getContext("2d");
    ctx.drawImage(base, 0, 0);
    const ink = warmInk ? "#ead7b9" : "#d9dbd0";
    const rng = random(421337);
    const cx = 960;
    const cy = 540;
    const ellipse = (radius, start = 0, end = Math.PI * 2) => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, radius * 0.32, -0.21, start, end);
    };
    // Small field marks, clipped inside the graphic's reserved box.
    ctx.save();
    ctx.beginPath(); ctx.rect(220, 220, 1480, 640); ctx.clip();
    for (let y = 240; y < 850; y += 24) {
      for (let x = 240; x < 1690; x += 24) {
        ctx.fillStyle = `rgba(219,220,205,${0.025 + rng() * 0.055})`;
        ctx.fillRect(x + rng() * 4, y + rng() * 4, 2, 2);
      }
    }
    const haze = ctx.createRadialGradient(cx, cy, 120, cx, cy, 630);
    haze.addColorStop(0, "rgba(224,227,209,0)");
    haze.addColorStop(0.58, "rgba(224,227,209,0.08)");
    haze.addColorStop(1, "rgba(224,227,209,0)");
    ctx.fillStyle = haze; ctx.fillRect(220, 220, 1480, 640);
    for (let ring = 0; ring < 10; ring++) {
      const radius = 340 + ring * 29;
      ctx.globalAlpha = 0.10 + (10 - ring) * 0.014;
      ctx.strokeStyle = ink; ctx.lineWidth = 1;
      ellipse(radius); ctx.stroke();
      for (let segment = 0; segment < 54; segment++) {
        const n = rng();
        if (n < 0.72) continue;
        const angle = segment / 54 * Math.PI * 2;
        ctx.globalAlpha = 0.10 + rng() * 0.50;
        ctx.lineWidth = n > 0.95 ? 6 : 2;
        ellipse(radius, angle, angle + 0.018 + rng() * 0.035); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(223,225,212,0.21)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(290, 540); ctx.lineTo(1630, 540); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(960, 254); ctx.lineTo(960, 817); ctx.stroke();
    // Disc remains distinct from background. All geometry is static concept art only.
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, 180, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#080909"; ctx.fillRect(cx - 180, cy - 180, 360, 360);
    for (let i = 0; i < 1600; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * 178;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const diagonal = y + x * 0.28;
      if (diagonal > -24 && diagonal < 9) continue;
      ctx.fillStyle = ink;
      ctx.globalAlpha = diagonal > 9 ? 0.48 + rng() * 0.45 : 0.10 + rng() * 0.5;
      const side = 1 + rng() * 2;
      ctx.fillRect(cx + x, cy + y, side, side);
    }
    ctx.restore();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ellipse(320, 0.18, 2.85); ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(1040, 659); ctx.lineTo(1080, 812); ctx.stroke();
    ctx.globalAlpha = 0.95; ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(1052, 705, 4, 0, Math.PI * 2); ctx.fill();
    mono(ctx, 13, ink);
    for (const [label, x, y] of [["01", 1326, 306], ["02", 1562, 470], ["03", 452, 726], ["04", 299, 540]]) {
      ctx.globalAlpha = 0.6; ctx.fillText(label, x, y);
    }
    ctx.restore();
    // Demonstration lettering ONLY in the preview, never the reusable backgrounds.
    ctx.globalAlpha = 1;
    mono(ctx, 34, ink, 600);
    ctx.letterSpacing = "9px"; ctx.fillText("ORBITAL", 96, 78); ctx.letterSpacing = "0px";
    mono(ctx, 22, ink, 500); ctx.fillText("134 BPM", 1320, 82); ctx.fillText("A MIN", 1600, 82);
    mono(ctx, 20, ink); ctx.fillText("PURCHASE THIS TRACK FOR COMMERCIAL USE", 96, 938);
    mono(ctx, 15, warmInk ? "#b59f80" : "#969b91");
    ctx.fillText("YOUR PRODUCER NAME", 96, 1001);
    return canvas;
  }
  const preview = concept(fog);
  await save("orbital-preview.png", preview, "concept", "Flattened static concept with SAMPLE lettering/metadata; not a reusable background or motion output.");
  const thumbnail = makeCanvas(320, 180);
  thumbnail.getContext("2d").drawImage(preview, 0, 0, 320, 180);
  await save("orbital-thumbnail.jpg", thumbnail, "thumbnail", "Static 320x180 concept thumbnail; not a finished picker integration.", "image/jpeg", 0.90);

  const sheet = makeCanvas(1600, 1370);
  const s = sheet.getContext("2d");
  s.fillStyle = "#101211"; s.fillRect(0, 0, 1600, 1370);
  mono(s, 16, "#aeb5a7"); s.fillText("BEATFLOW  /  ORIGINAL ASSET STUDY 01", 48, 30);
  mono(s, 34, "#eceee4", 600); s.fillText("ORBITAL — IMAGE PACK", 48, 66);
  s.drawImage(preview, 48, 132, 1504, 846);
  const backgrounds = [[fog, "01 / MONOCHROME"], [dark, "02 / OBSIDIAN"], [warm, "03 / UMBER"]];
  backgrounds.forEach(([canvas, label], i) => {
    const x = 48 + i * 510;
    s.drawImage(canvas, x, 1010, 484, 272.25);
    mono(s, 13, "#b9c1b0"); s.fillText(label, x, 1304);
  });
  await save("asset-sheet.jpg", sheet, "contact-sheet", "Overview of the static concept and three clean backgrounds.", "image/jpeg", 0.92);
  await fetch('/progress?stage=images-complete');
  return images;
}
