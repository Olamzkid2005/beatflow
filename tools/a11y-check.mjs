/**
 * WCAG audit in a real browser: axe-core on every page plus a keyboard walk of
 * the studio. Run against a production build:
 *
 *   npm run build && npm run a11y:check
 *
 * Needs Chrome; set CHROME_PATH to override the macOS default.
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
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const axeSource = await readFile(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
const AUTH_SECRET = "test-only-a11y-browser-secret-0000000000000";
const OWNER_EMAIL = "owner@example.com";
const PORT = 3118;
const origin = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

assert(existsSync(chrome), "Set CHROME_PATH to an installed Chrome binary.");
assert(existsSync(join(root, ".next/BUILD_ID")), "Run npm run build first.");

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

const profile = await mkdtemp(join(tmpdir(), "beatflow-a11y-"));
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
let socket;
let failure;
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

  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, {
    method: "PUT",
  });
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
      throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    }
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
  const goto = async (path) => {
    await send("Page.navigate", { url: `${origin}${path}` });
    await waitFor("document.readyState === 'complete'");
    await sleep(400);
  };

  await send("Page.enable");
  await send("Runtime.enable");
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

  // Seed one history row through the legacy migration path so the release card
  // (badge, status dot, Studio link) is part of the audit.
  await goto("/");
  await evaluate(`localStorage.setItem("beatflow.upload-history.v1", ${JSON.stringify(
    JSON.stringify([
      {
        videoId: "a11ySeeded1",
        title: "Accessibility audit release",
        channelTitle: "Owner channel",
        publishAt: new Date(Date.now() + 86_400_000).toISOString(),
        privacyStatus: "private",
        createdAt: new Date().toISOString(),
      },
    ]),
  )})`);

  const audit = async (path, readyText) => {
    await goto(path);
    if (readyText) {
      await waitFor(`document.body.innerText.includes(${JSON.stringify(readyText)})`);
    }
    await evaluate(axeSource);
    return evaluate(`axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    }).then((result) => ({
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
      incomplete: result.incomplete.map((item) => ({
        id: item.id,
        nodes: item.nodes.length,
        targets: item.nodes.slice(0, 4).map((node) => node.target),
      })),
      passes: result.passes.length,
    }))`);
  };

  const pages = [
    { path: "/", label: "home" },
    { path: "/generate", label: "generate" },
    { path: "/history", label: "history" },
    { path: "/settings", label: "settings" },
  ];
  const results = [];
  for (const page of pages) {
    const readyText = page.path === "/history" ? "Accessibility audit release" : undefined;
    results.push({ ...page, width: 1280, ...(await audit(page.path, readyText)) });
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  results.push({ path: "/generate", label: "generate (mobile)", width: 390, ...(await audit("/generate")) });

  // Keyboard walk: every primary studio control must be reachable by Tab.
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await goto("/generate");
  await evaluate("document.activeElement?.blur(); window.scrollTo(0, 0);");
  const stops = [];
  for (let i = 0; i < 70; i++) {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    stops.push(
      await evaluate(`(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { tag: "BODY" };
        return {
          tag: el.tagName,
          id: el.id,
          type: el.getAttribute("type"),
          name: el.getAttribute("name"),
          label: (el.textContent ?? "").trim().slice(0, 40),
          aria: el.getAttribute("aria-label"),
          focusVisible: el.matches(":focus-visible"),
        };
      })()`),
    );
  }
  const reached = (predicate) => stops.some(predicate);
  const expected = [
    ["render audio", (stop) => stop.id === "render-audio"],
    ["render image", (stop) => stop.id === "render-image"],
    ["template radio", (stop) => stop.type === "radio" && stop.name === "render-template"],
    ["upload file", (stop) => stop.id === "video-file"],
    ["title", (stop) => stop.id === "video-title"],
    ["description", (stop) => stop.id === "video-description"],
    ["tags", (stop) => stop.id === "video-tags"],
    ["schedule", (stop) => stop.id === "video-schedule"],
    ["chunk size", (stop) => stop.id === "video-chunk"],
    ["start upload", (stop) => stop.tag === "BUTTON" && stop.label.includes("Start upload")],
  ];
  const missing = expected.filter(([, predicate]) => !reached(predicate)).map(([name]) => name);
  assert.deepEqual(missing, [], `keyboard traversal missed: ${missing.join(", ")}`);
  // Chromium's segmented datetime-local control keeps focus in its shadow tree,
  // so the host does not match :focus-visible even though the segment is focused
  // and visibly highlighted. It is still checked for reachability above.
  const notFocusVisible = stops.filter(
    (stop) => stop.tag !== "BODY" && stop.id !== "video-schedule" && stop.focusVisible === false,
  );
  assert.deepEqual(
    notFocusVisible.map((stop) => `${stop.tag}#${stop.id}`),
    [],
    "keyboard focus not exposed as :focus-visible",
  );
  assert.deepEqual(pageErrors, [], "page raised an exception");

  const violations = results.flatMap((page) =>
    page.violations.map((violation) => ({ ...violation, page: page.label, width: page.width })),
  );
  for (const result of results) {
    const count = result.violations.reduce((sum, violation) => sum + violation.nodes.length, 0);
    console.log(
      `${result.violations.length === 0 ? "PASS" : "FAIL"} ${result.label} (${result.width}px): ` +
        `${result.violations.length} rules, ${count} nodes, ${result.passes} passing rules`,
    );
    for (const violation of result.violations) {
      console.log(`  [${violation.impact}] ${violation.id} — ${violation.help} (${violation.nodes.length})`);
      for (const node of violation.nodes.slice(0, 4)) {
        console.log(`    ${node.target.join(" ")}`);
        if (node.summary) console.log(`      ${node.summary.replaceAll("\n", " ")}`);
      }
    }
    if (result.incomplete.length) {
      console.log(
        `  manual review (${result.incomplete.length}): ` +
          result.incomplete.map((item) => `${item.id}×${item.nodes}`).join(", "),
      );
      for (const item of result.incomplete) {
        for (const target of item.targets) console.log(`    ${item.id}: ${target.join(" ")}`);
      }
    }
  }
  const browser = await send("Browser.getVersion");
  console.log(
    `\nA11y — ${browser.product}: ${stops.filter((stop) => stop.tag !== "BODY").length} keyboard stops, ` +
      `${expected.length}/${expected.length} primary controls reached, ${violations.length} violating rules`,
  );
  if (violations.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  failure = error;
  console.error(`A11y check failed: ${error instanceof Error ? error.message : error}`);
  if (serverLog) console.error(serverLog.slice(-2000));
  process.exitCode = 1;
} finally {
  socket?.close();
  child.kill("SIGTERM");
  server.kill("SIGTERM");
  for (let i = 0; i < 40 && child.exitCode === null; i++) await sleep(100);
  if (child.exitCode === null) child.kill("SIGKILL");
  if (server.exitCode === null) server.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  if (failure) process.exitCode = 1;
}
