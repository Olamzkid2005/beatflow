/**
 * F08 regression: real 30 fps encode + real MP4 track readback.
 * Run: node tools/fps-readback-check.mjs
 * Needs Chrome; set CHROME_PATH to override the macOS default.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
assert(existsSync(chrome), "Set CHROME_PATH to an installed Chrome binary.");
const bundle = join(root, "node_modules/mediabunny/dist/bundles/mediabunny.min.mjs");
assert(existsSync(bundle), "Mediabunny is not installed; run npm install.");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const PAGE = `<!doctype html><meta charset="utf-8"><title>F08 30 fps readback</title>
<p id="status">encoding…</p><script type="module">
import { encodeMp4 } from "/encode.js";
import { Input, BlobSource, ALL_FORMATS } from "/mediabunny.mjs";

window.runFpsCheck = async () => {
  const checks = {};
  try {
    const canvas = new OffscreenCanvas(1920, 1080);
    const ctx = canvas.getContext("2d");
    const audio = new AudioBuffer({ length: 96_000, sampleRate: 48_000, numberOfChannels: 2 });
    for (let channel = 0; channel < 2; channel++) {
      const data = audio.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = Math.sin((i / 48_000) * 440 * Math.PI * 2) * 0.2;
    }
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.fillStyle = "#eeeeee";
    ctx.font = "120px sans-serif";
    ctx.fillText("30 FPS", 120, 540);

    let invalidRejected = false;
    try {
      await encodeMp4({ canvas, audio, fps: NaN });
    } catch {
      invalidRejected = true;
    }
    checks.invalidFpsRejected = invalidRejected;

    const blob = await encodeMp4({ canvas, audio, fps: 30 });
    checks.blobType = blob.type;
    checks.blobBytes = blob.size;
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const sound = await input.getPrimaryAudioTrack();
    checks.videoTrack = Boolean(video);
    checks.audioTrack = Boolean(sound);
    if (video) {
      checks.width = video.displayWidth;
      checks.height = video.displayHeight;
      checks.videoCodec = await video.getCodec();
      const stats = await video.computePacketStats();
      checks.videoPackets = stats.packetCount;
      checks.frameRate = stats.averagePacketRate;
      checks.videoDuration = await video.computeDuration();
    }
    if (sound) {
      checks.audioCodec = await sound.getCodec();
      checks.sampleRate = sound.sampleRate;
      checks.channels = sound.numberOfChannels;
      checks.audioDuration = await sound.computeDuration();
    }

    checks.frameRateOk = typeof checks.frameRate === "number" && Math.abs(checks.frameRate - 30) < 0.5;
    checks.packetsOk = checks.videoPackets === 60;
    checks.durationOk = typeof checks.videoDuration === "number" && Math.abs(checks.videoDuration - 2) < 0.15;
    checks.sizeOk = checks.width === 1920 && checks.height === 1080;
    checks.tracksOk = checks.videoTrack && checks.audioTrack;
    checks.codecsOk = checks.videoCodec === "avc" && checks.audioCodec === "aac";
    checks.audioOk = checks.sampleRate === 48_000 && checks.channels === 2;
    checks.blobOk = checks.blobType === "video/mp4" && checks.blobBytes > 2000;
    return { ok: Object.values(checks).every((value) => value !== false), checks, bytes: Array.from(bytes) };
  } catch (error) {
    return { ok: false, error: String(error?.stack ?? error) };
  }
};
window.runAbortCheck = async () => {
  try {
    const canvas = new OffscreenCanvas(640, 360);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, 640, 360);
    const audio = new AudioBuffer({ length: 48_000 * 60, sampleRate: 48_000, numberOfChannels: 2 });
    const controller = new AbortController();
    let blob = null;
    let errorName = null;
    let rejected = false;
    try {
      blob = await encodeMp4({
        canvas,
        audio,
        fps: 1,
        signal: controller.signal,
        onProgress: (stage, pct) => {
          // Abort after the last video frame, while audio encoding is running.
          if (stage === "video" && pct === 1) setTimeout(() => controller.abort(), 0);
        },
      });
    } catch (error) {
      rejected = true;
      errorName = error?.name ?? String(error);
    }
    return {
      ok: rejected && blob === null && errorName === "AbortError",
      rejected,
      errorName,
      hasBlob: Boolean(blob),
    };
  } catch (error) {
    return { ok: false, error: String(error?.stack ?? error) };
  }
};

window.ready = true;
</script>`;

const transpile = async (file, replacements) => {
  const source = ts.transpileModule(await readFile(join(root, file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  let output = source;
  for (const [from, to] of replacements) output = output.split(from).join(to);
  return output;
};

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    const send = (type, body) => {
      res.setHeader("Content-Type", type);
      res.end(body);
    };
    if (path === "/") return send("text/html", PAGE);
    if (path === "/mediabunny.mjs") return send("text/javascript", await readFile(bundle));
    if (path === "/encode.js") {
      return send("text/javascript", await transpile("lib/renderer/encode.ts", [
        ['"mediabunny"', '"/mediabunny.mjs"'],
        ['"./capabilities"', '"/caps-stub.js"'],
        ['"./validate"', '"/validate.js"'],
      ]));
    }
    if (path === "/caps-stub.js") {
      return send("text/javascript",
        "export const RENDER_VIDEO = { width: 1920, height: 1080, bitrate: 1800000, fullCodecString: 'avc1.640028', keyFrameInterval: 2 };\n" +
        "export const RENDER_AUDIO = { bitrate: 288000, sampleRate: 48000, channels: 2 };\n");
    }
    if (path === "/validate.js") {
      return send("text/javascript", await transpile("lib/renderer/validate.ts", [
        ['"./template-schema"', '"/schema-stub.js"'],
      ]));
    }
    if (path === "/schema-stub.js") {
      return send("text/javascript", "export const parseTemplate = (value) => value;\n");
    }
    res.writeHead(404);
    res.end();
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), "beatflow-fps-"));
const child = spawn(chrome, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });
let socket;
try {
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
  let nextId = 0;
  const pageErrors = [];
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
  await send("Runtime.enable");
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (await evaluate("window.ready === true")) { ready = true; break; }
    await sleep(100);
  }
  assert(ready, "FPS page did not load.");
  const result = await evaluate("window.runFpsCheck()");
  assert.deepEqual(pageErrors, [], "page raised an exception");
  assert.equal(result.ok, true, JSON.stringify(result));

  const abort = await evaluate("window.runAbortCheck()");
  assert.deepEqual(abort, { ok: true, rejected: true, errorName: "AbortError", hasBlob: false });

  const outputDir = await mkdtemp(join(tmpdir(), "beatflow-f08-"));
  const mp4 = Buffer.from(result.bytes);
  await writeFile(join(outputDir, "30fps.mp4"), mp4);

  const browser = await send("Browser.getVersion");
  const c = result.checks;
  console.log(`F08 PASS — ${browser.product}`);
  console.log(`  ${c.videoCodec}/${c.audioCodec}, ${c.width}×${c.height}, ${c.sampleRate} Hz ${c.channels} ch`);
  console.log(`  ${c.videoPackets} video packets at ${c.frameRate} fps, ${c.videoDuration}s`);
  console.log(`  invalid FPS rejected before encoding: ${c.invalidFpsRejected}`);
  console.log("  abort during audio encoding rejects with AbortError and no blob");
  console.log(`  proof: ${join(outputDir, "30fps.mp4")} (${mp4.length} bytes)`);
} catch (error) {
  console.error(`F08 readback failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  socket?.close();
  child.kill("SIGTERM");
  for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i++) await sleep(100);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
