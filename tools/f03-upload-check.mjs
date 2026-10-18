/**
 * F02/F03 production-browser replay: render -> handoff -> held upload,
 * navigation guard (link + back), download bypass, and artifact ownership.
 *
 * Run: npm run build && node tools/f03-upload-check.mjs
 * Starts `next start` with a test-only owner session; no Google call is made.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const AUTH_SECRET = "test-only-f03-browser-secret-0000000000000000";
const OWNER_EMAIL = "owner@example.com";
const PORT = 3117;
const origin = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

assert(existsSync(chrome), "Set CHROME_PATH to an installed Chrome binary.");
assert(existsSync(join(root, ".next/BUILD_ID")), "Run npm run build first.");

const UPLOAD_TITLE = "Browser check release";
const results = [];
const pumps = new Set();
const record = (name, detail = "") => {
  results.push(name);
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
};

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

const profile = await mkdtemp(join(tmpdir(), "beatflow-f03-"));
const downloads = await mkdtemp(join(tmpdir(), "beatflow-f03-dl-"));
const child = spawn(chrome, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });
let socket;
let failed = false;
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
  socket = new WebSocket((await target.json()).webSocketDebuggerUrl);
  const pending = new Map();
  const events = [];
  let nextId = 0;
  let dialogAction = "dismiss";
  let downloadStarted = false;
  const dialogs = [];
  let send;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
    if (message.method) {
      events.push(message);
      if (message.method === "Page.downloadWillBegin") downloadStarted = true;
      if (message.method === "Page.javascriptDialogOpening") {
        const accepted = dialogAction === "accept";
        dialogs.push({ message: message.params.message, accepted });
        void send("Page.handleJavaScriptDialog", { accept: accepted });
      }
    }
  });
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  send = (method, params = {}) =>
    new Promise((done, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve: done, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  // Fire-and-forget CDP calls can race a navigation that already invalidated
  // the interception id; a failed continuation must not crash the harness.
  const fire = (method, params = {}) => {
    void send(method, params).catch(() => {});
  };
  const evaluate = async (expression) => {
    const value = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  };
  const waitFor = async (expression, timeout = 20_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };
  const pathname = () => evaluate("location.pathname");
  const bodyText = () => evaluate("document.body.innerText");
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
  const pickBytes = (selector, name, size, type) =>
    evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(${size})], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
      input.files = data.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return input.files[0].size;
    })()`);
  const setSelectValue = (selector, value) =>
    evaluate(`(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
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
  await send("Network.enable");
  const version = await send("Browser.getVersion");
  await send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloads,
    eventsEnabled: true,
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

  const paused = [];
  const uploadBodies = [];
  const fetchRule = { urlPattern: "*", requestStage: "Request" };
  await send("Fetch.enable", { patterns: [fetchRule] });
  // Hold the upload handshake; everything else continues untouched.
  const intercept = (message) => {
    if (message.method !== "Fetch.requestPaused") return;
    const { requestId, request } = message.params;
    if (request.url.includes("/api/youtube/init-upload")) {
      paused.push(requestId);
      uploadBodies.push(request.postData ?? "");
      return;
    }
    return fire("Fetch.continueRequest", { requestId });
  };
  const pump = setInterval(() => {
    while (events.length) {
      const event = events.shift();
      intercept(event);
    }
  }, 20);
  pumps.add(pump);

  const goto = async (path) => {
    await send("Page.navigate", { url: `${origin}${path}` });
    await waitFor("document.readyState === 'complete'");
  };
  const startRender = async () => {
    await waitFor("document.querySelector('#render-audio') !== null");
    await pickFile("#render-audio", "/beatflow-m0-test-5s.mp4", "proof-track.mp4", "audio/mp4");
    await pickFile("#render-image", "/images/orbital/background-obsidian.jpg", "background.jpg", "image/jpeg");
    await waitFor(
      "[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Render MP4') && !b.disabled)",
    );
    await clickText("button", "Render MP4");
    await waitFor(
      "[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Use for upload') && !b.disabled)",
      60_000,
    );
  };
  const startHeldUpload = async () => {
    const before = paused.length;
    await clickText("button", "Start upload");
    for (let i = 0; i < 200 && paused.length === before; i++) await sleep(50);
    assert(paused.length > before, "init-upload was not held");
    await waitFor("document.body.innerText.includes('Upload in progress')");
  };

  // F04: the saved zone owns the default wall time, even when Chrome is elsewhere.
  await goto("/generate");
  await send("Emulation.setTimezoneOverride", { timezoneId: "America/New_York" });
  await evaluate(`localStorage.setItem(
    "beatflow.producer-settings.v1",
    JSON.stringify({ producerName: "", timezone: "Asia/Tokyo", defaultTags: [], descriptionTemplate: "" }),
  )`);
  await goto("/generate");
  await waitFor("document.querySelector('#video-schedule') !== null");
  const semantics = await evaluate(`(() => {
    const described = (selector) =>
      (document.querySelector(selector)?.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    return {
      radios: document.querySelectorAll('input[type="radio"][name="render-template"]').length,
      group: Boolean(document.querySelector('[role="radiogroup"][aria-label="Template"]')),
      titleDescribed: described("#video-title"),
      audioDescribed: described("#render-audio"),
      hints: ["video-title-hint", "render-audio-hint"].filter((id) => document.getElementById(id)),
    };
  })()`);
  assert.equal(semantics.radios, 3, "template options must be native radio controls");
  assert.equal(semantics.group, true, "template picker must expose its radio group name");
  assert(semantics.titleDescribed.includes("video-title-hint"), "the title hint is not linked");
  assert(semantics.audioDescribed.includes("render-audio-hint"), "the track hint is not linked");
  assert.equal(semantics.hints.length, 2);
  record("template picker uses native radios and field hints are programmatically linked");

  const scheduleInfo = await evaluate(`(() => {
    const text = document.body.innerText;
    const line = text.split(String.fromCharCode(10)).find((value) => value.toUpperCase().includes("SENDS AS"));
    const time = line?.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}) ([0-9]{2}:[0-9]{2})/);
    return {
      browserZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      value: document.querySelector('#video-schedule')?.value ?? null,
      utc: time ? time[1] + 'T' + time[2] + ':00Z' : null,
      hint: text.toLowerCase().includes('wall time in asia/tokyo'),
    };
  })()`);
  assert.equal(scheduleInfo.browserZone, "America/New_York");
  assert.equal(scheduleInfo.hint, true, "the schedule did not state the saved zone");
  assert.match(scheduleInfo.value ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert(scheduleInfo.utc, "the UTC confirmation was not shown");
  const defaultDrift = Date.parse(scheduleInfo.utc) - (Date.now() + 10 * 60_000);
  assert(Math.abs(defaultDrift) < 120_000, `default schedule drifted ${defaultDrift}ms from now+10m`);
  record("default schedule follows the saved zone and shows its UTC instant", scheduleInfo.value);

  // A second browser zone must not move the saved-zone default.
  await send("Emulation.setTimezoneOverride", { timezoneId: "Europe/Berlin" });
  await goto("/generate");
  await waitFor("document.querySelector('#video-schedule') !== null");
  const secondZone = await evaluate(`(() => {
    const text = document.body.innerText;
    const line = text.split(String.fromCharCode(10)).find((value) => value.toUpperCase().includes("SENDS AS"));
    const time = line?.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}) ([0-9]{2}:[0-9]{2})/);
    return {
      browserZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      value: document.querySelector('#video-schedule')?.value ?? null,
      utc: time ? time[1] + 'T' + time[2] + ':00Z' : null,
    };
  })()`);
  assert.equal(secondZone.browserZone, "Europe/Berlin");
  assert(secondZone.utc, "the UTC confirmation disappeared in the second zone");
  assert(
    Math.abs(Date.parse(secondZone.utc) - (Date.now() + 10 * 60_000)) < 120_000,
    "the intended instant moved with the browser zone",
  );
  assert.match(secondZone.value ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  record("a second browser zone leaves the saved-zone default unchanged", secondZone.value);

  await evaluate('localStorage.removeItem("beatflow.producer-settings.v1")');
  await send("Emulation.setTimezoneOverride", { timezoneId: "" });

  // A previous page, so back has somewhere to go.
  await goto("/history");
  await waitFor("document.body.innerText.includes('Release history')");
  await clickText("a", "Studio");
  await waitFor("location.pathname === '/generate'");

  await pickFile("#render-audio", "/beatflow-m0-test-5s.mp4", "proof-track.mp4", "audio/mp4");
  await waitFor("document.querySelector('#render-track-name')?.value === 'proof track'");
  await pickFile("#render-audio", "/beatflow-m0-test-5s.mp4", "second_track.mp4", "audio/mp4");
  await waitFor("document.querySelector('#render-track-name')?.value === 'second track'");
  record("track name follows a newly selected source");
  await pickFile("#render-audio", "/beatflow-m0-test-5s.mp4", "proof-track.mp4", "audio/mp4");

  await startRender();
  record("render completed in production build");

  await clickText("button", "Use for upload");
  await waitFor(
    "document.querySelector('#video-file').closest('div.overflow-hidden').innerText.includes('proof track.mp4')",
  );
  assert.equal(await evaluate("document.querySelector('#video-title').value"), "proof track");
  record("handoff fills an untouched title from the rendered track");
  await setInputValue("#video-title", UPLOAD_TITLE);

  assert.match(await bodyText(), /Private until publish/);
  await setInputValue("#video-schedule", "");
  await waitFor("document.body.innerText.includes('Public immediately')");
  await clickText("button", "Public immediately");
  await waitFor("document.body.innerText.includes('uploads public immediately')");
  record("immediate public visibility is selectable when no schedule is set");

  await startHeldUpload();
  const uploadBody = JSON.parse(uploadBodies.at(-1));
  assert.equal(uploadBody.metadata.privacyStatus, "public");
  assert.equal(uploadBody.metadata.publishAt ?? null, null);
  record("the immediate visibility choice reaches init-upload");
  record("upload held open by a paused init-upload request");

  const locked = await evaluate(`(() => {
    const discard = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Discard');
    const use = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Use for upload'));
    const template = document.querySelector('input[name="render-template"]');
    return {
      discard: discard?.disabled,
      use: use?.disabled,
      template: template?.disabled,
      uploadFile: document.querySelector('#video-file')?.disabled,
      renderAudio: document.querySelector('#render-audio')?.disabled,
      renderImage: document.querySelector('#render-image')?.disabled,
    };
  })()`);
  assert.deepEqual(locked, {
    discard: true,
    use: true,
    template: true,
    uploadFile: true,
    renderAudio: true,
    renderImage: true,
  });
  record("render controls locked while uploading");

  // F03 download bypass: saving a file must not look like navigation.
  const dialogsBeforeDownload = dialogs.length;
  await clickText("a", "Sample");
  for (let i = 0; i < 100 && !downloadStarted; i++) await sleep(50);
  await sleep(300);
  assert.equal(downloadStarted, true, "the sample MP4 download never started");
  assert.equal(dialogs.length, dialogsBeforeDownload, "download prompted for navigation");
  assert.equal(await pathname(), "/generate");
  record("download link bypasses the navigation guard");

  // Link guard: decline keeps the upload and the page alive.
  dialogAction = "dismiss";
  const dialogsBeforeLink = dialogs.length;
  await clickText("a", "History");
  for (let i = 0; i < 100 && dialogs.length === dialogsBeforeLink; i++) await sleep(50);
  await sleep(500);
  assert.match(dialogs.at(-1)?.message ?? "", /upload is still in progress/i);
  assert.equal(await pathname(), "/generate");
  assert.match(await bodyText(), /Upload in progress/);
  record("declining internal navigation keeps the upload alive");

  // Back guard: trap entry, decline, then accept.
  dialogAction = "dismiss";
  const dialogsBeforeBack = dialogs.length;
  await sleep(400);
  await evaluate("history.back()");
  for (let i = 0; i < 100 && dialogs.length === dialogsBeforeBack; i++) await sleep(50);
  await sleep(600);
  assert.match(dialogs.at(-1)?.message ?? "", /upload is still in progress/i);
  assert.equal(await pathname(), "/generate");
  assert.match(await bodyText(), /Upload in progress/);
  record("browser back is intercepted; declining keeps the job alive");

  dialogAction = "accept";
  await sleep(400);
  await evaluate("history.back()");
  for (let i = 0; i < 200 && (await pathname()) !== "/history"; i++) await sleep(50);
  assert.equal(await pathname(), "/history", "accepting back did not leave the studio");
  assert.doesNotMatch(await bodyText(), /Upload in progress/);
  const survived = await send("Fetch.continueRequest", { requestId: paused.at(-1) })
    .then(() => true)
    .catch(() => false);
  assert.equal(survived, false, "the held upload request survived leaving the studio");
  record("accepting back leaves the studio and aborts the upload");

  await send("Fetch.disable");
  clearInterval(pump);

  // F02 ownership, same browser: discard a render, keep manual selections.
  await clickText("a", "Studio");
  await waitFor("location.pathname === '/generate'");
  await startRender();
  await setInputValue("#video-title", "Kept title");
  await clickText("button", "Use for upload");
  await waitFor(
    "document.querySelector('#video-file').closest('div.overflow-hidden').innerText.includes('proof track.mp4')",
  );
  assert.equal(
    await evaluate("document.querySelector('#video-title').value"),
    "Kept title",
    "a handoff overwrote an explicitly edited title",
  );
  record("handoff preserves a title the owner edited");

  await send("Fetch.enable", { patterns: [fetchRule] });
  const pump2 = setInterval(() => {
    while (events.length) intercept(events.shift());
  }, 20);
  pumps.add(pump2);
  await startHeldUpload();
  await clickText("button", "Cancel upload");
  await waitFor("document.body.innerText.includes('Ready when you are')");
  await sleep(300);
  clearInterval(pump2);
  await send("Fetch.disable");

  dialogAction = "accept";
  await clickText("button", "Discard");
  await sleep(400);
  assert.match(await bodyText(), /No video selected/, "discarding the render left its handoff selected");
  record("discarding a render clears only its own upload handoff");

  await pickFile("#video-file", "/beatflow-m0-test-5s.mp4", "manual-choice.mp4", "video/mp4");
  await waitFor("document.body.innerText.includes('manual-choice.mp4')");
  await startRender();
  dialogAction = "accept";
  await clickText("button", "Discard");
  await sleep(400);
  assert.match(await bodyText(), /manual-choice\.mp4/, "a later render discard cleared a manual file");
  record("a later render discard leaves a manually chosen file selected");

  // The guard's history trap must not leave an inert duplicate behind.
  dialogAction = "dismiss";
  const dialogsBeforeIdleBack = dialogs.length;
  await sleep(500);
  await evaluate("history.back()");
  for (let i = 0; i < 200 && (await pathname()) !== "/history"; i++) await sleep(50);
  assert.equal(await pathname(), "/history", "one back press after work did not reach the previous page");
  assert.equal(dialogs.length, dialogsBeforeIdleBack, "work that already ended still prompted");
  record("ending work removes the trap; one back press leaves the studio");

  // F01: an unreadable session response offers candidates, never an auto-pick.
  await clickText("a", "Studio");
  await waitFor("location.pathname === '/generate'");
  await pickFile("#video-file", "/beatflow-m0-test-5s.mp4", "recovery-source.mp4", "video/mp4");
  await setInputValue("#video-title", UPLOAD_TITLE);
  await waitFor("document.body.innerText.includes('recovery-source.mp4')");

  const candidate = {
    videoId: "confirmed-recovered",
    title: UPLOAD_TITLE,
    publishedAt: new Date(Date.now() - 5_000).toISOString(),
  };
  const fulfill = (requestId, body) =>
    send("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: "application/json" },
        { name: "Access-Control-Allow-Origin", value: origin },
      ],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    }).catch(() => {});
  await send("Fetch.enable", { patterns: [fetchRule] });
  const recoveryPump = setInterval(() => {
    while (events.length) {
      const event = events.shift();
      if (event.method !== "Fetch.requestPaused") continue;
      const { requestId, request } = event.params;
      if (request.url.includes("/api/youtube/init-upload")) {
        void fulfill(requestId, { sessionUri: "https://upload.example/session" });
      } else if (request.url.startsWith("https://upload.example/")) {
        fire("Fetch.failRequest", { requestId, errorReason: "Failed" });
      } else if (request.url.includes("/api/youtube/latest-upload")) {
        fire("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            { name: "Access-Control-Allow-Origin", value: origin },
          ],
          body: Buffer.from(JSON.stringify({ candidates: [candidate] })).toString("base64"),
        });
      } else if (request.url.includes("/api/youtube/video-status")) {
        void fulfill(requestId, {
          videos: [{
            videoId: candidate.videoId,
            privacyStatus: "public",
            uploadStatus: "processed",
            publishAt: null,
            failureReason: null,
            processingStatus: "succeeded",
          }],
        });
      } else {
        fire("Fetch.continueRequest", { requestId });
      }
    }
  }, 20);
  pumps.add(recoveryPump);

  await clickText("button", "Start upload");
  for (let i = 0; i < 700 && !(await bodyText()).includes("Find it on my channel"); i++) await sleep(50);
  assert.match(await bodyText(), /Upload outcome unknown/);
  assert.doesNotMatch(await bodyText(), /Confirmed on your channel/);
  record("unreadable upload response leaves the outcome unknown");

  await clickText("button", "Find it on my channel");
  await waitFor("document.body.innerText.includes('Choose the upload this attempt created')");
  assert.match(await bodyText(), new RegExp(candidate.videoId));
  assert.doesNotMatch(await bodyText(), /Confirmed on your channel/);
  record("recovery shows candidates without adopting one");

  await clickText("button", "That's this upload");
  await waitFor("document.body.innerText.includes('Confirmed on your channel')");
  assert.match(await bodyText(), /privacy, processing state and schedule could not be verified/i);
  record("only explicit confirmation records the recovered ID, with unverified state");

  await clickText("a", "History");
  await waitFor("document.body.innerText.includes('Release history')");
  await waitFor("document.body.innerText.includes('confirmed-recovered')");
  assert.match(await bodyText(), /Check in Studio/);
  assert.match(await bodyText(), /Privacy unverified/);
  record("history marks recovered release state as unverified");

  await clickText("button", "Refresh from YouTube");
  await waitFor("!document.body.innerText.includes('Check in Studio')");
  const refreshedText = await bodyText();
  assert.match(refreshedText, /Published/);
  assert.equal(
    await evaluate("document.body.innerText.includes('Privacy unverified')"),
    false,
    "a checked status must replace the unverified placeholder",
  );
  record("refreshing history shows the actual YouTube status");

  clearInterval(recoveryPump);
  await send("Fetch.disable");
  // Durability check after interception stops, so the reload cannot race a
  // paused request that no longer has a valid interception id.
  const timeOrigin = await evaluate("performance.timeOrigin");
  await evaluate("location.reload()");
  await waitFor(`performance.timeOrigin !== ${timeOrigin}`);
  await waitFor("document.body.innerText.includes('Release history')");
  await waitFor("!document.body.innerText.includes('Check in Studio')");
  assert.match(await bodyText(), /Published/);
  record("the refreshed status survives a reload via IndexedDB");

  // F10: a partial transfer that fails must never read as complete.
  await clickText("a", "Studio");
  await waitFor("location.pathname === '/generate'");
  await pickBytes("#video-file", "large-partial.mp4", 600_000, "video/mp4");
  await setInputValue("#video-title", "Partial upload check");
  await setSelectValue("#video-chunk", "262144");
  let sessionPuts = 0;
  await send("Fetch.enable", { patterns: [fetchRule] });
  const partialPump = setInterval(() => {
    while (events.length) {
      const event = events.shift();
      if (event.method !== "Fetch.requestPaused") continue;
      const { requestId } = event.params;
      if (event.params.request.url.includes("/api/youtube/init-upload")) {
        void fulfill(requestId, { sessionUri: "/fake-session" });
      } else if (event.params.request.url.includes("/fake-session")) {
        sessionPuts += 1;
        if (sessionPuts === 1) {
          fire("Fetch.fulfillRequest", {
            requestId,
            responseCode: 308,
            responseHeaders: [{ name: "Range", value: "bytes=0-262143" }],
          });
        } else {
          fire("Fetch.fulfillRequest", {
            requestId,
            responseCode: 400,
            responseHeaders: [{ name: "Content-Type", value: "text/plain" }],
            body: Buffer.from("invalid chunk").toString("base64"),
          });
        }
      } else {
        fire("Fetch.continueRequest", { requestId });
      }
    }
  }, 20);
  pumps.add(partialPump);

  await clickText("button", "Start upload");
  await waitFor("document.body.innerText.includes('Upload stopped')");
  const stoppedText = await bodyText();
  assert.match(stoppedText, /Not handed off/);
  assert.match(stoppedText, /after 4[34]%/);
  assert.doesNotMatch(stoppedText, /Upload complete/);
  record("a failed partial transfer is not labeled complete or handed off");

  clearInterval(partialPump);
  await send("Fetch.disable");

  console.log(`F02/F03 PASS — ${version.product}`);
  console.log(`  ${results.length} browser assertions in production Chrome`);
  console.log(`  download dir: ${downloads}`);
  await rm(downloads, { recursive: true, force: true });
} catch (error) {
  failed = true;
  console.error(`F02/F03 replay failed: ${error instanceof Error ? error.message : error}`);
  if (serverLog) console.error(serverLog.slice(-2000));
  process.exitCode = 1;
} finally {
  for (const id of pumps) clearInterval(id);
  socket?.close();
  child.kill("SIGTERM");
  server.kill("SIGTERM");
  for (let i = 0; i < 40 && child.exitCode === null; i++) await sleep(100);
  if (child.exitCode === null) child.kill("SIGKILL");
  if (server.exitCode === null) server.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  if (failed) await rm(downloads, { recursive: true, force: true });
}
