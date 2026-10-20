/**
 * Guided-tour check in a real browser. Seeds a first-run profile, walks the
 * setup dialog, then exercises the tour: spotlight, pointer, hands-on practice
 * for description / tags / schedule, hands-off upload step, pause and resume,
 * and the replay button on Settings.
 *
 *   npm run build && npm run onboarding:check
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
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browser = candidates.find((path) => existsSync(path));
assert(browser, "Set CHROME_PATH to an installed Chrome or Edge binary.");
assert(existsSync(join(root, ".next/BUILD_ID")), "Run npm run build first.");
const axeSource = await readFile(join(root, "node_modules/axe-core/axe.min.js"), "utf8");

const AUTH_SECRET = "test-only-onboarding-browser-secret-000000000";
const OWNER_EMAIL = "owner@example.com";
const PORT = 3120;
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

const profile = await mkdtemp(join(tmpdir(), "beatflow-onboarding-"));
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
  let nextId = 0;
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
      throw new Error(
        value.exceptionDetails.exception?.description ?? value.exceptionDetails.text,
      );
    }
    return value.result.value;
  };
  const waitFor = async (expression, timeout = 15_000) => {
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

  const tourScope = "[aria-labelledby='tour-title']";
  const setupScope = "[aria-labelledby='onboarding-title']";
  const tourTitle = () =>
    evaluate(`document.querySelector(${JSON.stringify(`${tourScope} h2`)})?.textContent ?? ""`);
  const clickText = (text, scope = "") =>
    evaluate(`(() => {
      const root = ${scope ? `document.querySelector(${JSON.stringify(scope)})` : "document"};
      if (!root) return false;
      const button = [...root.querySelectorAll("button")].find(
        (node) => node.textContent.trim() === ${JSON.stringify(text)},
      );
      if (!button) return false;
      button.click();
      return true;
    })()`);
  const setField = (selector, value) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
  const pressTab = async (times, shift = false) => {
    for (let index = 0; index < times; index++) {
      const modifiers = shift ? 8 : 0;
      await send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
        modifiers,
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
        modifiers,
      });
      await sleep(60);
    }
  };
  const focusInside = (selector) =>
    evaluate(`Boolean(document.activeElement?.closest(${JSON.stringify(selector)}))`);
  const assertTabTrapped = async (selector, label, presses = 24) => {
    for (let index = 0; index < presses; index++) {
      await pressTab(1);
      const inside = await focusInside(selector);
      const active = await evaluate(`(() => {
        const el = document.activeElement;
        if (!el) return "none";
        return el.tagName + "|" + (el.id || "") + "|" + String(el.textContent || "").trim().slice(0, 24) + "|" + Boolean(el.closest(${JSON.stringify(selector)}));
      })()`);
      assert.equal(inside, true, `${label}: focus escaped on Tab ${index + 1} to ${active}`);
    }
  };
  const nextStep = async (expectedTitle) => {
    const before = await evaluate(`localStorage.getItem("beatflow.onboarding.v1")`);
    assert.equal(await clickText("Next", tourScope), true, "Next button missing");
    await waitFor(`localStorage.getItem("beatflow.onboarding.v1") !== ${JSON.stringify(before)}`);
    await waitFor(
      `document.querySelector(${JSON.stringify(`${tourScope} h2`)})?.textContent === ${JSON.stringify(expectedTitle)}`,
    );
  };
  const practiceDone = () =>
    waitFor(
      `document.querySelector(${JSON.stringify(tourScope)})?.innerText.toLowerCase().includes("practice complete")`,
    );
  const layoutReport = (selector) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        scrollX: el.scrollWidth - el.clientWidth,
        inside: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
        rect: { l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom) },
        viewport: { w: innerWidth, h: innerHeight },
      };
    })()`);
  const assertAccessible = async (label) => {
    await evaluate(axeSource);
    const violations = await evaluate(`axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    }).then((result) => result.violations
      .filter((violation) => violation.id !== "color-contrast")
      .map((violation) => ({ id: violation.id, help: violation.help, nodes: violation.nodes.length })))`);
    assert.deepEqual(violations, [], `${label} has accessibility violations`);
  };
  const assertInside = async (selector, label) => {
    const report = await layoutReport(selector);
    assert.ok(report, `${label} missing`);
    assert.equal(report.scrollX <= 1, true, `${label} overflows horizontally: ${JSON.stringify(report)}`);
    assert.equal(report.inside, true, `${label} leaves the viewport: ${JSON.stringify(report)}`);
  };

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

  // First run: no onboarding progress and no saved settings.
  await goto("/generate");
  await evaluate(
    `localStorage.removeItem("beatflow.onboarding.v1"); localStorage.removeItem("beatflow.producer-settings.v1")`,
  );
  await goto("/generate");
  await waitFor(`document.body.innerText.includes("Make BeatFlow feel like yours.")`);

  await assertAccessible("First-run setup dialog");
  await assertTabTrapped(setupScope, "Setup dialog");
  assert.equal(
    await setField(`${setupScope} input`, "Tour Verification Studio"),
    true,
    "Producer name field missing",
  );
  assert.equal(await clickText("Next", setupScope), true);
  await waitFor(`document.body.innerText.includes("Choose your starting metadata.")`);
  assert.equal(
    await setField(
      `${setupScope} textarea`,
      "Prefilled by setup for the tour",
    ),
    true,
    "Starting description field missing",
  );
  assert.equal(await clickText("Next", setupScope), true);
  await waitFor(`document.body.innerText.includes("How should a new release start?")`);
  await assertInside(setupScope, "Setup dialog");
  assert.equal(await clickText("Save & start the tour", setupScope), true);
  await waitFor(`document.querySelector(${JSON.stringify(`${tourScope} h2`)}) !== null`);

  assert.equal(await tourTitle(), "This is your private beat-to-YouTube studio");
  assert.equal(
    await evaluate(`document.querySelector("#video-description")?.value`),
    "Prefilled by setup for the tour",
    "Saved starting description did not reach the mounted upload desk",
  );
  const stored = JSON.parse(await evaluate(`localStorage.getItem("beatflow.onboarding.v1")`));
  assert.equal(stored.setupComplete, true);
  assert.equal(stored.tourComplete, false);

  await nextStep("Choose your visual signature");
  await assertInside(tourScope, "Tour card");
  await waitFor(`Boolean(document.querySelector(".onboarding-spotlight"))`, 8_000);
  await waitFor(`Boolean(document.querySelector(".onboarding-pointer"))`, 8_000);
  await assertAccessible("Guided tour step");
  assert.equal(
    await evaluate(`Boolean(document.querySelector(".onboarding-spotlight"))`),
    true,
    "Spotlight missing",
  );
  assert.equal(
    await evaluate(`Boolean(document.querySelector(".onboarding-pointer"))`),
    true,
    "Pointer arrow missing",
  );
  assert.equal(
    await evaluate(`(() => {
      const pointer = document.querySelector(".onboarding-pointer").getBoundingClientRect();
      const tip = document.querySelector(${JSON.stringify(tourScope)}).getBoundingClientRect();
      const target = document.querySelector("[data-tour='render-template']").getBoundingClientRect();
      const above = pointer.bottom <= tip.top + 1 && tip.top > target.bottom;
      const below = pointer.top >= tip.bottom - 1 && tip.bottom < target.top;
      const leftOf = pointer.right <= tip.left + 1 && tip.left > target.right;
      const rightOf = pointer.left >= tip.right - 1 && tip.right < target.left;
      return above || below || leftOf || rightOf;
    })()`),
    true,
    "Pointer should sit between the tooltip and the highlighted control",
  );

  // Clicking the highlighted radio reaches the page; the rest is blocked.
  assert.equal(
    await evaluate(`document.querySelector("[data-tour='render-template'] input[value='orbital']").click(); true`),
    true,
  );
  await practiceDone();

  const orbited = await evaluate(`(() => {
    const target = document.querySelector("[data-tour='render-template']");
    const rect = target.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 20);
    const tip = document.querySelector(${JSON.stringify(tourScope)})?.getBoundingClientRect();
    return {
      insideReached: Boolean(hit?.closest("[data-tour='render-template']")),
      hit: hit ? hit.tagName + "." + String(hit.className).split(" ").slice(0, 2).join(".") : null,
      target: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      tip: tip ? { left: tip.left, top: tip.top, width: tip.width, height: tip.height } : null,
    };
  })()`);
  assert.equal(
    orbited.insideReached,
    true,
    `Highlighted control must stay clickable: ${JSON.stringify(orbited)}`,
  );

  await nextStep("Bring in the beat");
  await nextStep("Set the atmosphere");
  await nextStep("Name the track inside the video");
  assert.equal(await setField("#render-track-name", "Midnight Loop"), true);
  await practiceDone();
  await nextStep("Render privately on this device");
  await nextStep("Choose what to send to YouTube");
  await nextStep("Your description lives here");

  assert.equal(await setField("#video-description", "Produced by Tour Verification Studio"), true);
  await practiceDone();
  await nextStep("Add tags to describe the release");
  assert.equal(
    await evaluate(`(() => {
      const el = document.querySelector("#video-tags");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "type beat");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return true;
    })()`),
    true,
  );
  await practiceDone();
  const packedChip = await evaluate(`(() => {
    const box = document.querySelector("#video-tags")?.parentElement;
    if (!box) return null;
    const bounds = box.getBoundingClientRect();
    return [...box.querySelectorAll("button[aria-label^='Remove ']")].every((button) => {
      const chip = button.parentElement.getBoundingClientRect();
      return chip.right <= bounds.right + 1 && chip.left >= bounds.left - 1 && chip.top >= bounds.top - 1 && chip.bottom <= bounds.bottom + 1;
    });
  })()`);
  assert.equal(packedChip, true, "A tag chip escaped the tag box");
  await nextStep("Schedule a release");
  assert.equal(await setField("#video-schedule", "2030-01-16T19:30"), true);
  await practiceDone();
  await assertInside(tourScope, "Tour card");
  await nextStep("Nothing publishes without your click");

  await assertTabTrapped(tourScope, "Hands-off tour step", 12);

  // The final hand-off is deliberately not clickable during the tour.
  const guarded = await evaluate(`(() => {
    const button = document.querySelector("[data-tour='upload-submit']");
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { reached: hit === button || button.contains(hit), hit: hit?.tagName ?? null };
  })()`);
  assert.equal(guarded.reached, false, `Upload button must be blocked, hit ${guarded.hit}`);

  assert.equal(await clickText("Pause", tourScope), true);
  await waitFor(`document.querySelector(${JSON.stringify(tourScope)}) === null`);
  const paused = JSON.parse(await evaluate(`localStorage.getItem("beatflow.onboarding.v1")`));
  assert.equal(paused.tourStep, 10);
  await waitFor(`document.body.innerText.includes("Resume tour")`);
  assert.equal(
    await evaluate(`[...document.querySelectorAll("button")].find((node) => node.textContent.includes("Resume tour"))?.click(); true`),
    true,
  );
  await waitFor(`document.querySelector(${JSON.stringify(tourScope)}) !== null`);
  assert.equal(await tourTitle(), "Nothing publishes without your click");

  // Settings exposes a replay action that restarts at the welcome step.
  await clickText("Pause", tourScope);
  await goto("/settings");
  await waitFor(`document.body.innerText.includes("Producer settings")`);
  assert.equal(
    await evaluate(`[...document.querySelectorAll("button")].find((node) => node.textContent.includes("Replay walkthrough"))?.click(); true`),
    true,
  );
  await waitFor(`document.querySelector(${JSON.stringify(tourScope)}) !== null`);
  assert.equal(await tourTitle(), "This is your private beat-to-YouTube studio");
  const replayed = JSON.parse(await evaluate(`localStorage.getItem("beatflow.onboarding.v1")`));
  assert.equal(replayed.tourStep, 0);
  assert.equal(replayed.tourComplete, false);

  // The saved defaults from setup reach the upload desk and settings form.
  assert.equal(await clickText("Pause", tourScope), true);
  await waitFor(`document.querySelector(${JSON.stringify(tourScope)}) === null`);
  await goto("/settings");
  assert.equal(
    await evaluate(`document.querySelector("#producer-name")?.value`),
    "Tour Verification Studio",
  );
  await goto("/generate");
  await waitFor(`document.body.innerText.includes("Drop your rendered MP4 here")`);

  assert.deepEqual(pageErrors, []);
  console.log("Onboarding check passed: setup, spotlight, practice probes, hand-off guard, pause/resume, replay.");
} finally {
  if (socket) socket.close();
  child.kill();
  server.kill();
  await sleep(500);
  // Windows keeps the browser profile locked briefly after the process exits.
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }).catch(
    () => {},
  );
}
