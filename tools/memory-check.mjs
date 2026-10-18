/**
 * Peak-memory benchmark for the real render path in production Chrome.
 *
 * Target: 8 GB 2013 MacBook Air (dual-core i7), 1.5 GiB peak renderer memory.
 * Beat lengths measured: 30 s, 3 min, 5 min; plus five 30 s render/discard
 * cycles for retention. Synthesized 48 kHz stereo WAVs stand in for beats and
 * stay under the 64 MiB compressed-input cap (5 min = 54.9 MiB).
 *
 * Run: npm run build && npm run memory:check
 * Needs Chrome; set CHROME_PATH to override the macOS default.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const AUTH_SECRET = "test-only-memory-browser-secret-00000000000";
const OWNER_EMAIL = "owner@example.com";
const PORT = 3119;
const origin = `http://127.0.0.1:${PORT}`;
const BUDGET_MIB = 1536;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

assert(existsSync(chrome), "Set CHROME_PATH to an installed Chrome binary.");
assert(existsSync(join(root, ".next/BUILD_ID")), "Run npm run build first.");

/** Deterministic, music-like 48 kHz stereo PCM in a RIFF/WAVE container. */
function makeWav(seconds) {
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

  let seed = 0x1234_5678;
  const noise = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return (seed / 4_294_967_296) * 2 - 1;
  };
  const chords = [
    [220, 277.18, 329.63],
    [246.94, 293.66, 369.99],
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
  ];
  for (let i = 0; i < frames; i++) {
    const time = i / 48_000;
    const beat = time % 0.5;
    const kick = Math.exp(-beat / 0.05) * Math.sin(2 * Math.PI * 55 * time) * 0.5;
    const chord = chords[Math.floor(time / 2) % chords.length];
    const pad =
      chord.reduce((sum, freq) => sum + Math.sin(2 * Math.PI * freq * time), 0) * 0.06;
    const bass = Math.sin(2 * Math.PI * 55 * time) * 0.18;
    const hat = (i % 12_000) < 240 ? noise() * 0.12 : 0;
    const sample = Math.max(-1, Math.min(1, kick + pad + bass + hat));
    const value = Math.round(sample * 32_767);
    buffer.writeInt16LE(value, 44 + i * 4);
    buffer.writeInt16LE(value, 46 + i * 4);
  }
  return buffer;
}

const wavs = new Map();
const wavFor = (seconds) => {
  if (!wavs.has(seconds)) wavs.set(seconds, makeWav(seconds));
  return wavs.get(seconds);
};

const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const match = path.match(/^\/beat-(\d+)s\.wav$/);
  if (!match) {
    res.writeHead(404);
    res.end();
    return;
  }
  const data = wavFor(Number(match[1]));
  res.writeHead(200, {
    "Content-Type": "audio/wav",
    "Content-Length": String(data.length),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
});
server.keepAliveTimeout = 120_000;
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const assetOrigin = `http://127.0.0.1:${server.address().port}`;

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
let serverLog = "";
app.stdout.on("data", (chunk) => (serverLog += chunk));
app.stderr.on("data", (chunk) => (serverLog += chunk));

const profile = await mkdtemp(join(tmpdir(), "beatflow-mem-"));
const child = spawn(
  chrome,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const readTree = () => {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid=,rss=,args="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      return match
        ? { pid: Number(match[1]), ppid: Number(match[2]), rss: Number(match[3]), args: match[4] }
        : null;
    })
    .filter(Boolean);
  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }
  const descendants = [];
  const stack = [child.pid];
  while (stack.length) {
    const pid = stack.pop();
    for (const row of byParent.get(pid) ?? []) {
      descendants.push(row);
      stack.push(row.pid);
    }
  }
  const rootRow = rows.find((row) => row.pid === child.pid);
  const renderer = descendants
    .filter((row) => row.args.includes("--type=renderer"))
    .reduce((sum, row) => sum + row.rss, 0);
  const total = [rootRow, ...descendants]
    .filter(Boolean)
    .reduce((sum, row) => sum + row.rss, 0);
  return { renderer: renderer / 1024, total: total / 1024 };
};

let socket;
let failure;
try {
  for (let i = 0; i < 600; i++) {
    if (app.exitCode !== null) throw new Error(`next start exited: ${serverLog}`);
    try {
      if ((await fetch(`${origin}/api/auth/session`)).ok) break;
    } catch {}
    if (i === 599) throw new Error(`next start never became ready: ${serverLog}`);
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

  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, {
    method: "PUT",
  });
  assert(target.ok);
  socket = new WebSocket((await target.json()).webSocketDebuggerUrl);
  const pending = new Map();
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
    if (message.method === "Page.javascriptDialogOpening") {
      void send("Page.handleJavaScriptDialog", { accept: dialogAction === "accept" }).catch(() => {});
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
    const value = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (value.exceptionDetails) {
      throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    }
    return value.result.value;
  };
  const waitFor = async (expression, timeout = 300_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await sleep(150);
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
  const pickAudio = (seconds) =>
    evaluate(`(async () => {
      const blob = await (await fetch(${JSON.stringify(`${assetOrigin}/beat-`)} + ${seconds} + "s.wav")).blob();
      const input = document.querySelector("#render-audio");
      const data = new DataTransfer();
      data.items.add(new File([blob], "beat-${seconds}s.wav", { type: "audio/wav" }));
      input.files = data.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return blob.size;
    })()`);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("HeapProfiler.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

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

  const startSampler = () => {
    const peak = { renderer: 0, total: 0 };
    const sample = () => {
      const current = readTree();
      peak.renderer = Math.max(peak.renderer, current.renderer);
      peak.total = Math.max(peak.total, current.total);
    };
    sample();
    const timer = setInterval(sample, 100);
    return () => {
      clearInterval(timer);
      sample();
      return peak;
    };
  };

  await send("Page.navigate", { url: `${origin}/generate` });
  await waitFor("document.readyState === 'complete'");
  await waitFor("document.querySelector('#render-audio') !== null");
  const imageSize = await evaluate(`(async () => {
    const blob = await (await fetch("/images/orbital/background-obsidian.jpg")).blob();
    const input = document.querySelector("#render-image");
    const data = new DataTransfer();
    data.items.add(new File([blob], "background.jpg", { type: "image/jpeg" }));
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return blob.size;
  })()`);
  assert(imageSize > 0);

  const mode = process.env.MEMORY_MODE ?? "full";
  const durations = mode === "quick" ? [30] : [30, 180, 300];
  const measurements = [];
  for (const seconds of durations) {
    const audioBytes = await pickAudio(seconds);
    assert(audioBytes > 0);
    await waitFor("document.querySelector('#render-track-name')?.value.length > 0");
    const baseline = readTree();
    const stop = startSampler();
    const started = Date.now();
    await clickText("button", "Render MP4");
    await waitFor(
      "[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Use for upload') && !b.disabled)",
      300_000,
    );
    const elapsed = (Date.now() - started) / 1000;
    const peak = stop();
    await evaluate("true");
    const resultText = await evaluate(
      "document.querySelector('#video-file')?.files?.[0]?.name ?? document.body.innerText",
    );
    dialogAction = "accept";
    await clickText("button", "Use for upload");
    await clickText("button", "Discard");
    await waitFor("document.body.innerText.includes('No video selected')");
    await send("HeapProfiler.collectGarbage");
    await sleep(700);
    const retained = readTree();
    measurements.push({ seconds, elapsed, baseline, peak, retained, resultText });
    console.log(
      `  ${seconds}s: peak renderer ${peak.renderer.toFixed(0)} MiB, total ${peak.total.toFixed(0)} MiB, ` +
        `baseline ${baseline.renderer.toFixed(0)} MiB, retained ${retained.renderer.toFixed(0)} MiB, ${elapsed.toFixed(1)}s`,
    );
    assert(
      peak.renderer <= BUDGET_MIB,
      `${seconds}s render peaked at ${peak.renderer.toFixed(0)} MiB renderer memory, over the ${BUDGET_MIB} MiB budget`,
    );
  }

  // Retention: five render/discard cycles without reloading the page.
  await pickAudio(30);
  await waitFor("document.querySelector('#render-track-name')?.value.length > 0");
  const cycleRetained = [];
  for (let cycle = 1; cycle <= 5; cycle++) {
    const stop = startSampler();
    await clickText("button", "Render MP4");
    await waitFor(
      "[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Use for upload') && !b.disabled)",
      300_000,
    );
    const peak = stop();
    assert(
      peak.renderer <= BUDGET_MIB,
      `cycle ${cycle} peaked at ${peak.renderer.toFixed(0)} MiB renderer memory`,
    );
    await clickText("button", "Use for upload");
    await clickText("button", "Discard");
    await waitFor("document.body.innerText.includes('No video selected')");
    await send("HeapProfiler.collectGarbage");
    await sleep(500);
    const retained = readTree();
    cycleRetained.push(retained.renderer);
    console.log(`  cycle ${cycle}: peak ${peak.renderer.toFixed(0)} MiB, retained ${retained.renderer.toFixed(0)} MiB`);
  }
  const growth = cycleRetained.at(-1) - cycleRetained[0];
  assert(
    growth <= 150,
    `retained renderer memory grew ${growth.toFixed(0)} MiB across five cycles (limit 150 MiB)`,
  );

  const browser = await send("Browser.getVersion");
  console.log(
    `\nMEMORY PASS — ${browser.product}, 8 GB 2013 MacBook Air, budget ${BUDGET_MIB} MiB renderer\n` +
      `  measured ${measurements.map((m) => `${m.seconds}s/${m.peak.renderer.toFixed(0)} MiB`).join(", ")}\n` +
      `  five-cycle retention growth ${growth.toFixed(0)} MiB (limit 150 MiB)`,
  );
} catch (error) {
  failure = error;
  console.error(`Memory check failed: ${error instanceof Error ? error.message : error}`);
  if (serverLog) console.error(serverLog.slice(-2000));
  process.exitCode = 1;
} finally {
  socket?.close();
  child.kill("SIGTERM");
  app.kill("SIGTERM");
  for (let i = 0; i < 40 && child.exitCode === null; i++) await sleep(100);
  if (child.exitCode === null) child.kill("SIGKILL");
  if (app.exitCode === null) app.kill("SIGKILL");
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  if (failure) process.exitCode = 1;
}
