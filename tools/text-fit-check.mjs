/**
 * F07 regression: real Chrome, real canvas metrics, real shipped fonts.
 * Run: node tools/text-fit-check.mjs
 * Needs Chrome; set CHROME_PATH to override the macOS default.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
assert(existsSync(chrome), "Set CHROME_PATH to an installed Chrome binary.");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const PAGE = `<!doctype html><meta charset="utf-8"><title>F07 text fit check</title>
<p id="status">running…</p><script type="module">
import { layoutText, MAX_TEXT_LINES } from "/scene.js";
import { FIRST_LIGHT_TEMPLATE } from "/first-light.js";
import { PULSE_TEMPLATE } from "/pulse.js";
import { GRID_TEMPLATE } from "/grid.js";

const presets = [FIRST_LIGHT_TEMPLATE, PULSE_TEMPLATE, GRID_TEMPLATE];
const samples = {
  title: [
    "Midnight Loop Extended Visualizer Version Featuring A Guest Verse And A Very Long Name That Keeps Going",
    "Supercalifragilisticexpialidociousandthensomemoreletters",
    "Café del Mar — Noche Ñandú 東京",
  ],
  brand: ["PRODUCER BRAND WITH A DELIBERATELY LONGER COLLECTIVE NAME", "NOVA"],
};

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
// The scene resolves template families to the loaded faces; measure with the
// same faces, never a system fallback.
const loadedFont = (font) =>
  font.replace("JetBrains Mono", "FitCheckMono").replace("Inter", "FitCheckInter");
const measure = (value, font) => {
  ctx.font = loadedFont(font);
  return ctx.measureText(value).width;
};

async function run() {
  const families = [
    ["FitCheckInter", "/inter.woff2", "400"],
    ["FitCheckMono", "/mono.woff2", "400"],
  ];
  for (const [family, url, weight] of families) {
    const face = new FontFace(family, "url(" + url + ")", { weight: "100 900" });
    await face.load();
    document.fonts.add(face);
    if (!document.fonts.check(weight + " 64px " + family)) {
      throw new Error("Font did not become measurable: " + family);
    }
  }

  const results = [];
  let failures = 0;
  for (const preset of presets) {
    for (const layer of preset.layers.filter((item) => item.type === "text")) {
      const role = /brand/i.test(layer.value) || layer.value.includes("producer_name") ? "brand" : "title";
      for (const text of samples[role]) {
        const layout = layoutText({
          text,
          fontSize: layer.fontSize,
          minFontSize: layer.minFontSize,
          maxWidth: layer.maxWidth,
          weight: layer.fontWeight,
          family: layer.fontFamily,
          letterSpacing: layer.letterSpacing,
          maxHeight: layer.maxHeight,
          lineHeight: layer.lineHeight,
          measure,
        });
        const font = layer.fontWeight + " " + layout.fontSize + "px " + layer.fontFamily;
        const width = Math.max(
          ...layout.lines.map(
            (line) => measure(line, font) + (line.length > 1 ? layer.letterSpacing * (line.length - 1) : 0),
          ),
        );
        const glyphDescent = Math.max(
          ...layout.lines.map((line) => {
            ctx.font = loadedFont(font);
            return ctx.measureText(line).actualBoundingBoxDescent || 0;
          }),
        );
        const blockHeight = layout.lines.length * layout.lineHeight;
        const row = {
          preset: preset.name,
          role,
          text: text.slice(0, 24),
          lines: layout.lines.length,
          fontSize: layout.fontSize,
          width: Math.round(width),
          maxWidth: layer.maxWidth,
          blockHeight,
          maxHeight: layer.maxHeight,
          glyphDescent: Math.round(glyphDescent),
          ellipsized: layout.lines.some((line) => line.endsWith("…")),
        };
        const ok =
          width <= layer.maxWidth + 0.5 &&
          blockHeight <= layer.maxHeight &&
          layout.lines.length <= MAX_TEXT_LINES &&
          layout.fontSize >= layer.minFontSize &&
          glyphDescent <= layout.lineHeight;
        row.ok = ok;
        if (!ok) failures += 1;
        results.push(row);
      }
    }
  }

  let tooSmallRejected = false;
  try {
    layoutText({
      text: "Midnight", fontSize: 100, minFontSize: 40, maxWidth: 1200,
      weight: 700, family: "FitCheckInter", maxHeight: 10, measure,
    });
  } catch {
    tooSmallRejected = true;
  }
  return { results, failures, tooSmallRejected, titles: presets.map((preset) => preset.name) };
}

window.runFitCheck = async () => {
  const data = await run();
  return { ok: data.failures === 0 && data.tooSmallRejected, ...data };
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
    if (path === "/scene.js") {
      return send("text/javascript", await transpile("lib/renderer/scene.ts", [
        ['"./assets"', '"/assets-stub.js"'],
        ['"./template-schema"', '"/schema-stub.js"'],
      ]));
    }
    if (path === "/schema-stub.js") {
      return send(
        "text/javascript",
        'export const parseTemplate = (value) => value;\n' +
          "export const interpolateTemplateValue = (value, vars) => value.replace(/\\{\\{\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\}\\}/g, (_m, name) => vars[name.toLowerCase()] ?? '');\n",
      );
    }
    if (path === "/assets-stub.js") {
      return send(
        "text/javascript",
        'export const resolveFontFamily = (family) => family === "Inter" ? "FitCheckInter" : "FitCheckMono";\n',
      );
    }
    const template = { "/first-light.js": "first-light", "/pulse.js": "pulse", "/grid.js": "grid" }[path];
    if (template) {
      return send("text/javascript", await transpile(`lib/templates/${template}.ts`, [
        ['"@/lib/renderer/template-schema"', '"/schema-stub.js"'],
      ]));
    }
    if (path === "/inter.woff2" || path === "/mono.woff2") {
      return send("font/woff2", await readFile(join(root, `app/fonts/${path === "/inter.woff2" ? "Inter" : "JetBrainsMono"}-Variable.woff2`)));
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
const profile = await mkdtemp(join(tmpdir(), "beatflow-fit-"));
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
  assert(ready, "Fit check page did not load.");
  const result = await evaluate("window.runFitCheck()");
  assert.deepEqual(pageErrors, [], "page raised an exception");
  assert.equal(result.ok, true, JSON.stringify(result.results.filter((row) => !row.ok)));

  const browser = await send("Browser.getVersion");
  const tightest = result.results
    .slice()
    .sort((a, b) => b.blockHeight / b.maxHeight - a.blockHeight / a.maxHeight)
    .slice(0, 5);
  console.log(`F07 PASS — ${browser.product}`);
  console.log(`  ${result.results.length} real-font layouts across ${result.titles.join(", ")}`);
  console.log(`  too-small box rejected: ${result.tooSmallRejected}`);
  for (const row of tightest) {
    console.log(
      `  ${row.preset}/${row.role}: ${row.lines} lines @ ${row.fontSize}px, ` +
        `${row.blockHeight}/${row.maxHeight}px tall, ${row.width}/${row.maxWidth}px wide` +
        (row.ellipsized ? ", ellipsized" : ""),
    );
  }
} catch (error) {
  console.error(`F07 check failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  socket?.close();
  child.kill("SIGTERM");
  for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i++) await sleep(100);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
