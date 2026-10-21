/**
 * Orbital audio-reactive acceptance check.
 *
 * Run: npm run build && node tools/motion-check.mjs
 *
 * Drives the real production UI with a synthetic owner session and a synthesized
 * 6-second WAV whose first half is quiet and second half loud. It verifies:
 *  - the analysis worker path (not the main-thread fallback),
 *  - the paused preview changes between quiet and loud sections and seeks back
 *    to the same frame,
 *  - a downloaded 30 fps MP4 with the right packet count/duration/colour tags,
 *  - decoded MP4 frames differ between the quiet and loud sections,
 *  - cancelling a re-render returns to "cancelled" while keeping the previous
 *    MP4 downloadable under the same URL (re-rendering is non-destructive).
 *
 * No Google call is made. Needs Chrome; set CHROME_PATH to override.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

import { readColorTags } from "./m0-probe/mp4.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const AUTH_SECRET = "test-only-motion-browser-secret-000000000000";
const OWNER_EMAIL = "owner@example.com";
const PORT = 3121;
const origin = `http://127.0.0.1:${PORT}`;
const bundle = join(root, "node_modules/mediabunny/dist/bundles/mediabunny.min.mjs");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

assert(existsSync(chrome), "Set CHROME_PATH to an installed Chrome binary.");
assert(existsSync(join(root, ".next/BUILD_ID")), "Run npm run build first.");
assert(existsSync(bundle), "Mediabunny is not installed; run npm install.");

/** 48 kHz stereo WAV: quiet for 3 s, loud 60 Hz + noise for 3 s, click at 4.0 s. */
function makeMotionWav(seconds = 6) {
  const frames = seconds * 48_000;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(48_000, 24);
  buffer.writeUInt32LE(48_000 * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 4, 40);

  let seed = 0x9e37_79b9;
  const noise = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return (seed / 4_294_967_296) * 2 - 1;
  };
  for (let i = 0; i < frames; i++) {
    const time = i / 48_000;
    const loud = time >= 3;
    const click = Math.abs(time - 4) < 0.004 ? 0.8 : 0;
    const sample = loud
      ? Math.sin(2 * Math.PI * 60 * time) * 0.5 + noise() * 0.12 + click
      : Math.sin(2 * Math.PI * 55 * time) * 0.01;
    const value = Math.round(Math.max(-1, Math.min(1, sample)) * 32_767);
    buffer.writeInt16LE(value, 44 + i * 4);
    buffer.writeInt16LE(value, 46 + i * 4);
  }
  return buffer;
}

const wav = makeMotionWav();
let exportPath = null;
const assetServer = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const send = (type, body) => {
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(body);
  };
  if (path === "/motion.wav") return send("audio/wav", wav);
  if (path === "/export.mp4" && exportPath) return send("video/mp4", exportPath.bytes);
  if (path === "/mediabunny.mjs") return send("text/javascript", readFileSync(bundle));
  res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
  res.end();
});
assetServer.keepAliveTimeout = 120_000;

const app = spawn(
  process.execPath,
  [join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      AUTH_SECRET,
      OWNER_EMAIL,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      AUTH_TRUST_HOST: "true",
    },
  },
);
let appLog = "";
app.stdout.on("data", (chunk) => (appLog += chunk));
app.stderr.on("data", (chunk) => (appLog += chunk));

const profile = await mkdtemp(join(tmpdir(), "beatflow-motion-"));
const downloads = await mkdtemp(join(tmpdir(), "beatflow-motion-dl-"));
const child = spawn(chrome, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });
let socket;
const results = [];
const record = (name, detail = "") => {
  results.push(name);
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  // Serve the bundle/export through the small test origin.
  await new Promise((done) => assetServer.listen(0, "127.0.0.1", done));
  const assetOrigin = `http://127.0.0.1:${assetServer.address().port}`;

  for (let i = 0; i < 600; i++) {
    if (app.exitCode !== null) throw new Error(`next start exited: ${appLog}`);
    try {
      if ((await fetch(`${origin}/api/auth/session`)).ok) break;
    } catch {}
    if (i === 599) throw new Error(`next start never became ready: ${appLog}`);
    await sleep(100);
  }

  let port;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`Chrome exited with ${child.exitCode}.`);
    try {
      port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await sleep(100);
    }
  }
  assert(port, "Chrome did not expose its debugging port.");

  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, { method: "PUT" });
  assert(target.ok);
  socket = new WebSocket((await target.json()).webSocketDebuggerUrl);
  const pending = new Map();
  const pageErrors = [];
  let nextId = 0;
  let dialogAction = "accept";
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") {
      pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
    if (message.method === "Page.javascriptDialogOpening") {
      void send("Page.handleJavaScriptDialog", { accept: dialogAction === "accept" });
    }
  });
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((done, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve: done, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const value = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  };
  const waitFor = async (expression, timeout = 30_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };
  const clickText = (selector, text) =>
    evaluate(`(() => {
      const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((element) => element.textContent.trim().includes(${JSON.stringify(text)}));
      if (!node) throw new Error("No element matching ${text}");
      node.click();
      return true;
    })()`);
  const setInputValue = (selector, value) =>
    evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error("No input ${selector}");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return input.value;
    })()`);
  const setSelectValue = (selector, value) =>
    evaluate(`(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      if (!select) throw new Error("No select ${selector}");
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(select, ${JSON.stringify(value)});
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return select.value;
    })()`);
  const pickFile = (selector, url, name, type) =>
    evaluate(`(async () => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error("No input ${selector}");
      const blob = await (await fetch(${JSON.stringify(url)})).blob();
      const file = new File([blob], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} });
      const data = new DataTransfer();
      data.items.add(file);
      input.files = data.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return file.size;
    })()`);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloads,
    eventsEnabled: true,
  });
  const version = await send("Browser.getVersion");

  const token = await encode({
    secret: AUTH_SECRET,
    salt: "authjs.session-token",
    token: {
      email: OWNER_EMAIL,
      accessToken: "test-only",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
  });
  const cookie = await send("Network.setCookie", {
    name: "authjs.session-token",
    value: token,
    url: origin,
    httpOnly: true,
    sameSite: "Lax",
  });
  assert.equal(cookie.success, true);

  await send("Page.navigate", { url: `${origin}/generate` });
  await waitFor("document.readyState === 'complete'");
  await waitFor("document.querySelector('input[value=\"orbital\"]') !== null");
  assert.equal(
    await evaluate("document.querySelector('input[value=\"orbital\"]').checked"),
    false,
    "the picker should still open on the default template",
  );
  await evaluate("document.querySelector('input[value=\"orbital\"]').click()");
  await waitFor("document.querySelector('#orbital-rings') !== null");
  await waitFor("document.body.innerText.includes('Design preview — add audio for reactive motion.')");
  record("Orbital opens with a still design preview and no fake motion");

  await setInputValue("#render-track-name", "Motion Check");
  await setInputValue("#render-bpm", "128.5");
  await setSelectValue("#render-key", "F# minor");
  await setInputValue("#render-message", "Purchase This Track For Commercial Use");
  await pickFile("#render-audio", `${assetOrigin}/motion.wav`, "motion.wav", "audio/wav");

  await waitFor("document.body.innerText.includes('in a background worker')", 90_000);
  await waitFor(
    "[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Render MP4 · 30 fps') && !b.disabled)",
    30_000,
  );
  record("analysis runs in the module worker and unlocks the 30 fps render");

  await evaluate(`window.__previewHash = () => {
    const canvas = document.querySelector('canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 97) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }`);
  const seek = async (time) =>
    evaluate(`(async () => {
      const audio = document.querySelector('audio');
      audio.currentTime = ${time};
      await new Promise((done) => setTimeout(done, 500));
      return { hash: window.__previewHash(), time: audio.currentTime };
    })()`);
  const quiet = await seek(0.8);
  const loud = await seek(4.4);
  const quietAgain = await seek(0.8);
  assert.notEqual(quiet.hash, loud.hash, "the preview did not react to the loud section");
  assert.equal(quietAgain.hash, quiet.hash, "seeking back did not reproduce the frame");
  record("paused preview follows media time and reacts to energy", `${quiet.hash} → ${loud.hash}`);

  await clickText("button", "Render MP4 · 30 fps");
  await waitFor(
    "[...document.querySelectorAll('a')].some((a) => a.textContent.includes('Download MP4'))",
    180_000,
  );
  await clickText("a", "Download MP4");
  let downloaded = null;
  for (let i = 0; i < 200; i++) {
    const files = (await readdir(downloads)).filter((name) => name.endsWith(".mp4"));
    if (files.length > 0) {
      const info = await stat(join(downloads, files[0]));
      if (info.size > 0) {
        downloaded = files[0];
        break;
      }
    }
    await sleep(100);
  }
  assert(downloaded, "the Download MP4 action produced no file");
  const bytes = await readFile(join(downloads, downloaded));
  exportPath = { bytes };
  record("the 30 fps render downloads a real MP4", `${downloaded} · ${bytes.length} bytes`);

  const decoded = await evaluate(`(async () => {
    const mod = await import(${JSON.stringify(`${assetOrigin}/mediabunny.mjs`)});
    const blob = await (await fetch(${JSON.stringify(`${assetOrigin}/export.mp4`)} )).blob();
    const input = new mod.Input({ source: new mod.BlobSource(blob), formats: mod.ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const stats = await video.computePacketStats();
    const color = await video.getColorSpace();
    const sink = new mod.CanvasSink(video, { fit: "fill" });
    const hash = (wrapped) => {
      const canvas = wrapped.canvas;
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let value = 2166136261;
      for (let i = 0; i < data.length; i += 97) {
        value ^= data[i];
        value = Math.imul(value, 16777619);
      }
      return value >>> 0;
    };
    const quiet = await sink.getCanvas(1.2);
    const loud = await sink.getCanvas(4.4);
    const corner = Array.from(
      quiet.canvas.getContext('2d').getImageData(4, 4, 1, 1).data.slice(0, 3),
    );
    return {
      packets: stats.packetCount,
      rate: stats.averagePacketRate,
      bitrate: stats.averageBitrate,
      duration: await video.computeDuration(),
      width: video.displayWidth,
      height: video.displayHeight,
      videoCodec: await video.getCodec(),
      audioCodec: audio ? await audio.getCodec() : null,
      sampleRate: audio?.sampleRate ?? null,
      channels: audio?.numberOfChannels ?? null,
      color: [color.primaries, color.transfer, color.matrix, color.fullRange].join('/'),
      corner,
      quiet: hash(quiet),
      loud: hash(loud),
    };
  })()`);

  assert.equal(decoded.videoCodec, "avc");
  assert.equal(decoded.audioCodec, "aac");
  assert.equal(decoded.width, 1920);
  assert.equal(decoded.height, 1080);
  assert.equal(decoded.sampleRate, 48_000);
  assert.equal(decoded.channels, 2);
  assert.equal(decoded.packets, 180, `expected 180 frames, got ${decoded.packets}`);
  assert.ok(Math.abs(decoded.rate - 30) < 0.5, `rate ${decoded.rate}`);
  assert.ok(Math.abs(decoded.duration - 6) < 0.15, `duration ${decoded.duration}`);
  assert.equal(decoded.color, "bt709/bt709/bt709/false");
  // The Orbital canvas is #08080d. A second transfer function in the encoder
  // used to decode this corner as near-black (about 1,3,2), so exports looked
  // much darker and flatter than the preview.
  const field = [8, 8, 13];
  assert.ok(
    decoded.corner.every((value, index) => Math.abs(value - field[index]) <= 6),
    `decoded #08080d field as ${decoded.corner.join(",")}`,
  );
  assert.notEqual(decoded.quiet, decoded.loud, "the exported frames did not react to energy");
  record(
    "decoded export is 30 fps H.264/AAC and differs across quiet/loud frames",
    `${decoded.packets} packets · ${Math.round(decoded.bitrate / 1000)} kbps · field ${decoded.corner.join(",")}`,
  );

  const tags = readColorTags(bytes);
  assert.deepEqual(tags.colr, [{ primaries: 1, transfer: 1, matrix: 1, fullRange: false }]);
  assert.deepEqual(tags.sps, { present: true, fullRange: false, primaries: 1, transfer: 1, matrix: 1 });
  record("container colr and SPS VUI are limited-range BT.709");

  // Cancel a second render through the UI. Re-rendering is non-destructive, so
  // the finished MP4 from the first render must survive a cancelled attempt.
  const beforeCancel = await evaluate(
    "document.querySelector('a[download]')?.getAttribute('href') ?? null",
  );
  await clickText("button", "Render MP4 · 30 fps");
  await waitFor("document.body.innerText.includes('Encoding video frames')", 30_000);
  await clickText("button", "Cancel");
  await waitFor("document.body.innerText.includes('Render cancelled')", 30_000);
  const afterCancel = await evaluate(`({
    link: [...document.querySelectorAll('a')].find((a) => a.textContent.includes('Download MP4'))?.getAttribute('href') ?? null,
    badge: document.body.innerText.includes('MP4 · matches preview'),
    keepsFile: document.body.innerText.includes('previous MP4 is unchanged'),
  })`);
  assert.equal(beforeCancel !== null, true, "the first render produced no download link to protect");
  assert.equal(
    afterCancel.link,
    beforeCancel,
    "cancelling replaced or removed the previous download link",
  );
  assert.equal(afterCancel.badge, true, "the surviving file was no longer labelled as matching the preview");
  assert.equal(afterCancel.keepsFile, true, "the cancelled state did not say the previous MP4 is unchanged");
  record("cancel keeps the previous MP4 downloadable under the same URL");

  // A template that requires a photo is no longer a dead end: a bundled starter
  // must reach the preview and render without a manually chosen file.
  await evaluate("document.querySelector('input[value=\"first-light\"]').click()");
  await waitFor("document.querySelector('#render-image') !== null && !document.querySelector('#render-image').disabled");
  await sleep(300);
  const beforeStarter = await evaluate("window.__previewHash()");
  await evaluate(
    "document.querySelector('button[aria-label=\"Use Silver fog as the background image\"]').click()",
  );
  await waitFor(
    "![...document.querySelectorAll('button')].some((button) => button.textContent.includes('Loading…'))",
    30_000,
  );
  await sleep(300);
  const afterStarter = await evaluate("window.__previewHash()");
  assert.notEqual(afterStarter, beforeStarter, "the starter background did not reach the preview");
  const previousHref = await evaluate(
    "document.querySelector('a[download]')?.getAttribute('href') ?? null",
  );
  await clickText("button", "Render MP4");
  await waitFor(
    `(document.querySelector('a[download]')?.getAttribute('href') ?? null) !== ${JSON.stringify(previousHref)}`,
    120_000,
  );
  assert.equal(
    await evaluate("document.body.innerText.includes('could not be loaded')"),
    false,
    "a starter background failed to load",
  );
  record("a bundled starter background reaches the preview and renders without an uploaded photo");

  assert.deepEqual(pageErrors, [], "page raised an exception");
  const outputDir = await mkdtemp(join(tmpdir(), "beatflow-motion-proof-"));
  const proof = join(outputDir, downloaded);
  await writeFile(proof, bytes);

  console.log(`\nMotion check PASS — ${version.product}`);
  console.log(`  ${results.length} checks`);
  console.log(`  preview ${quiet.hash} (quiet) vs ${loud.hash} (loud)`);
  console.log(`  export ${decoded.packets} packets at ${decoded.rate.toFixed(2)} fps, ${decoded.duration}s`);
  console.log(`  proof: ${proof} (${bytes.length} bytes)`);
} catch (error) {
  console.error(`Motion check failed: ${error instanceof Error ? error.stack ?? error.message : error}`);
  process.exitCode = 1;
} finally {
  socket?.close();
  child.kill("SIGTERM");
  app.kill("SIGTERM");
  for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i++) await sleep(100);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  assetServer.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
