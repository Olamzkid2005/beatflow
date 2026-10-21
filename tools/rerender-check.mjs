/**
 * Re-render check in a real browser. Proves the studio's promise that editing
 * after a render never costs the existing MP4:
 *
 *   - a finished MP4 is marked "matches preview"
 *   - editing an input marks it "previous settings" and explains how to update
 *   - the second render keeps the first file playable while it runs
 *   - no discard prompt is shown, and the finished file is replaced in place
 *
 *   npm run build && npm run rerender:check
 *
 * Needs Chrome or Edge; set CHROME_PATH to override the defaults.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browser = candidates.find((path) => existsSync(path));
assert(browser, "Set CHROME_PATH to an installed Chrome or Edge binary.");
assert(existsSync(join(root, ".next/BUILD_ID")), "Run npm run build first.");

const AUTH_SECRET = "test-only-rerender-browser-secret-000000000";
const OWNER_EMAIL = "owner@example.com";
const PORT = 3136;
const origin = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const server = spawn(
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
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

const profile = await mkdtemp(join(tmpdir(), "beatflow-rerender-"));
const child = spawn(
  browser,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let socket;
try {
  for (let i = 0; i < 600; i++) {
    if (server.exitCode !== null) throw new Error(`next start exited: ${serverLog}`);
    try {
      if ((await fetch(`${origin}/api/auth/session`)).ok) break;
    } catch {}
    if (i === 599) throw new Error(`next start never became ready: ${serverLog}`);
    await sleep(100);
  }

  let port;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`Browser exited with ${child.exitCode}.`);
    try {
      port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await sleep(100);
    }
  }
  assert(port, "The browser did not expose its debugging port.");

  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, {
    method: "PUT",
  });
  assert(target.ok);
  socket = new WebSocket((await target.json()).webSocketDebuggerUrl);
  const pending = new Map();
  const pageErrors = [];
  let dialogs = 0;
  let nextId = 0;
  const send = (method, params = {}) =>
    new Promise((done, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve: done, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") {
      pageErrors.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    }
    if (message.method === "Page.javascriptDialogOpening") {
      dialogs += 1;
      void send("Page.handleJavaScriptDialog", { accept: true });
    }
  });
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const evaluate = async (expression) => {
    const value = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (value.exceptionDetails) {
      throw new Error(
        value.exceptionDetails.exception?.description ?? value.exceptionDetails.text,
      );
    }
    return value.result.value;
  };
  const waitFor = async (expression, timeout = 30_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return true;
      await sleep(120);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };
  const goto = async (path) => {
    await send("Page.navigate", { url: `${origin}${path}` });
    await waitFor("document.readyState === 'complete'");
    await sleep(500);
  };
  const clickText = (text) =>
    evaluate(`(() => {
      const button = [...document.querySelectorAll("button")].find(
        (node) => node.textContent.trim() === ${JSON.stringify(text)},
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
  const setField = (selector, value) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        el,
        ${JSON.stringify(value)},
      );
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
  const setFiles = (selector, builder) =>
    evaluate(`(async () => {
      const files = await (${builder})();
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return 0;
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return input.files.length;
    })()`);
  const resultVideoSrc = () =>
    evaluate(`(() => {
      const video = [...document.querySelectorAll("video")].find((node) =>
        (node.getAttribute("src") ?? "").startsWith("blob:"),
      );
      return video?.getAttribute("src") ?? null;
    })()`);

  const wavFixture = `async () => {
    const rate = 48000, seconds = 8, n = rate * seconds;
    const bytes = new Uint8Array(44 + n * 4);
    const view = new DataView(bytes.buffer);
    const ascii = (offset, text) =>
      [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    ascii(0, "RIFF"); view.setUint32(4, 36 + n * 4, true); ascii(8, "WAVE"); ascii(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true);
    view.setUint16(32, 4, true); view.setUint16(34, 16, true);
    ascii(36, "data"); view.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      const sample = Math.sin((i / rate) * Math.PI * 2 * 220) * 6000;
      view.setInt16(44 + i * 4, sample, true);
      view.setInt16(46 + i * 4, sample, true);
    }
    return [new File([bytes], "Rerender Beat.wav", { type: "audio/wav" })];
  }`;
  const pngFixture = `async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    context.fillStyle = "#2b3550";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise((done) => canvas.toBlob(done, "image/png"));
    return [new File([blob], "cover.png", { type: "image/png" })];
  }`;

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
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

  // Skip the first-run dialog; this check is about the render studio.
  await goto("/generate");
  await evaluate(`(() => {
    localStorage.setItem("beatflow.onboarding.v1", JSON.stringify({
      setupComplete: true, tourComplete: true, tourStep: 0,
    }));
    localStorage.setItem("beatflow.producer-settings.v1", JSON.stringify({
      producerName: "Rerender Studio", timezone: "UTC", defaultTags: [],
      descriptionTemplate: "", defaultVisibility: "unlisted",
    }));
    return true;
  })()`);
  await goto("/generate");
  await waitFor("document.querySelector('#render-audio') !== null");

  assert.equal(await setFiles("#render-audio", wavFixture), 1, "audio file input missing");
  assert.equal(await setFiles("#render-image", pngFixture), 1, "image file input missing");
  await waitFor("document.querySelector('#render-track-name')?.value.length > 0");
  assert.equal(await setField("#render-track-name", "First pass"), true);

  assert.equal(await clickText("Render MP4"), true, "first render could not start");
  await waitFor(
    `[...document.querySelectorAll("button")].some((node) => node.textContent.includes("Use for upload") && !node.disabled)`,
    180_000,
  );
  const firstSrc = await resultVideoSrc();
  assert.ok(firstSrc, "the finished render has no playable video");
  await waitFor(`document.body.innerText.includes("MP4 · matches preview")`);

  // Editing the preview must not touch the finished file.
  assert.equal(await setField("#render-track-name", "Second pass"), true);
  await waitFor(`document.body.innerText.includes("Preview updated.")`);
  await waitFor(`document.body.innerText.includes("MP4 · previous settings")`);
  assert.equal(await resultVideoSrc(), firstSrc, "editing replaced the finished MP4");
  assert.equal(
    await evaluate(
      `[...document.querySelectorAll("button")].some((node) => node.textContent.includes("Use for upload") && !node.disabled)`,
    ),
    true,
    "the previous MP4 stopped being uploadable after an edit",
  );

  // Start the second render and watch the first file stay available.
  assert.equal(await clickText("Render MP4"), true, "second render could not start");
  let sawOldFileWhileRendering = false;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const state = await evaluate(`({
      rendering: document.body.innerText.includes("Rendering…"),
      src: (() => {
        const video = [...document.querySelectorAll("video")].find((node) =>
          (node.getAttribute("src") ?? "").startsWith("blob:"),
        );
        return video?.getAttribute("src") ?? null;
      })(),
    })`);
    if (state.rendering && state.src === firstSrc) {
      sawOldFileWhileRendering = true;
      break;
    }
    if (state.rendering && state.src !== firstSrc) {
      throw new Error("the old MP4 was replaced before the new render finished");
    }
    await sleep(40);
  }
  assert.equal(
    sawOldFileWhileRendering,
    true,
    "the finished MP4 was released when the re-render started",
  );
  await waitFor(`document.body.innerText.includes("stays available until this render replaces it")`);

  await waitFor(
    `[...document.querySelectorAll("button")].some((node) => node.textContent.includes("Use for upload") && !node.disabled)`,
    180_000,
  );
  const secondSrc = await resultVideoSrc();
  assert.ok(secondSrc && secondSrc !== firstSrc, "the re-render did not replace the MP4");
  await waitFor(`document.body.innerText.includes("MP4 · matches preview")`);
  assert.equal(
    await evaluate(`document.body.innerText.includes("Preview updated.")`),
    false,
    "the stale notice survived a finished re-render",
  );
  assert.equal(dialogs, 0, "the studio still asked for confirmation before re-rendering");
  assert.deepEqual(pageErrors, []);

  console.log(
    "Re-render check passed: stale/current status, non-destructive re-render, no discard prompt.",
  );
} finally {
  if (socket) socket.close();
  child.kill();
  server.kill();
  await sleep(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }).catch(
    () => {},
  );
}
