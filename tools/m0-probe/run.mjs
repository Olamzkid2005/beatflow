/**
 * Runs the M0 capability probe in real Chrome and reports what it finds.
 *
 * Usage: npm run m0:probe [-- --headful]
 *
 * It exists because the spec's section 12 assumptions include two that can only be answered by
 * actually encoding: whether this machine's Chrome can encode H.264 High profile and AAC through
 * WebCodecs, and whether the resulting MP4 ends up with an edit list. `isConfigSupported` is known
 * to lie about AAC, so the probe performs real encodes and inspects the bytes afterwards.
 *
 * Writes the rendered test video to public/beatflow-m0-test-5s.mp4 and a JSON report next to this
 * script.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { inspectMp4 } from "./mp4.mjs";
import { startProbeServer } from "./server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../..");
const MEDIABUNNY_BUNDLE = join(
  projectRoot,
  "node_modules/mediabunny/dist/bundles/mediabunny.min.mjs",
);
const OUTPUT_MP4 = join(projectRoot, "public/beatflow-m0-test-5s.mp4");
const REPORT_JSON = join(here, "report.json");

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/opt/google/chrome/chrome",
];

const SERVER_PORT = 8791;
const DEBUG_PORT = 9223;
const headful = process.argv.includes("--headful");

function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  const candidates = fromEnv ? [fromEnv, ...CHROME_CANDIDATES] : CHROME_CANDIDATES;
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function waitForDevTools(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error("Chrome did not expose its DevTools endpoint in time.");
}

/** Opens a new tab for `url` and returns its debugger websocket URL. */
async function openTarget(url) {
  const response = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
  if (!response.ok) throw new Error(`Could not open a Chrome tab (${response.status}).`);
  const target = await response.json();
  return target.webSocketDebuggerUrl;
}

/** Minimal CDP client: enough to evaluate a promise in the page and surface console output. */
function connect(webSocketUrl, { onConsole }) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    if (message.method === "Runtime.consoleAPICalled") {
      onConsole(
        `[${message.params.type}] ${message.params.args
          .map((arg) => arg.value ?? arg.description ?? arg.type)
          .join(" ")}`,
      );
    }
    if (message.method === "Runtime.exceptionThrown") {
      onConsole(`[exception] ${message.params.exceptionDetails.text}`);
    }
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("CDP websocket failed.")));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return {
    ready,
    send,
    close: () => socket.close(),
  };
}

async function evaluate(client, expression, { awaitPromise = false } = {}) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Page evaluation threw.");
  }
  return result.result.value;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error("No Chrome binary found. Set CHROME_PATH to point at one.");
  if (!existsSync(MEDIABUNNY_BUNDLE)) {
    throw new Error("mediabunny is not installed. Run `npm install` first.");
  }

  await mkdir(dirname(OUTPUT_MP4), { recursive: true });
  await mkdir(here, { recursive: true });

  const server = await startProbeServer({
    port: SERVER_PORT,
    files: {
      "/probe.html": join(here, "probe.html"),
      "/mediabunny.mjs": MEDIABUNNY_BUNDLE,
      "/test.mp4": OUTPUT_MP4,
    },
    savePath: OUTPUT_MP4,
    log: (line) => console.log(`  server: ${line}`),
  });

  const consoleLines = [];
  const profileDir = join(here, ".chrome-profile");
  const chromeArgs = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--mute-audio",
    "--window-size=1280,900",
    ...(headful ? [] : ["--headless=new"]),
    "about:blank",
  ];

  const child = spawn(chrome, chromeArgs, { stdio: "ignore" });
  let report = null;
  let boxes = null;
  let chromeVersion = null;
  let failure = null;

  try {
    const version = await waitForDevTools(20_000);
    chromeVersion = version.Browser ?? null;
    console.log(`Chrome: ${chromeVersion}`);

    const targetUrl = `${server.url}/probe.html`;
    const wsUrl = await openTarget(targetUrl);
    const client = connect(wsUrl, { onConsole: (line) => consoleLines.push(line) });
    await client.ready;
    await client.send("Runtime.enable");

    // Wait for the page to finish, then read its report. The probe sets __probe last.
    const deadline = Date.now() + 180_000;
    let state = "undefined";
    while (Date.now() < deadline) {
      state = await evaluate(client, "typeof globalThis.__probe");
      if (state === "object") break;
      await sleep(500);
    }
    if (state !== "object") {
      const status = await evaluate(client, "document.getElementById('status')?.textContent");
      throw new Error(`The probe did not finish (page status: ${status ?? "unknown"}).`);
    }

    report = await evaluate(client, "globalThis.__probe");

    // Re-inspect the file the server wrote: independent of the page's own reader.
    try {
      const mp4 = await readFile(OUTPUT_MP4);
      boxes = inspectMp4(mp4);
    } catch (error) {
      console.error(
        `Could not inspect the rendered MP4: ${error instanceof Error ? error.message : error}`,
      );
    }

    client.close();
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    child.kill("SIGTERM");
    await sleep(300);
    if (!child.killed) child.kill("SIGKILL");
    await server.close();
  }

  if (failure) {
    console.error(`\nProbe failed: ${failure}`);
    if (consoleLines.length) console.error(consoleLines.join("\n"));
    process.exitCode = 1;
    return;
  }

  const mediaRequests = server.requests.filter((entry) => entry.path === "/test.mp4");
  const output = {
    ranAt: new Date().toISOString(),
    chrome: chromeVersion,
    probe: report,
    console: consoleLines,
    mp4: boxes,
    http: { mediaRequests },
  };
  await writeFile(REPORT_JSON, `${JSON.stringify(output, null, 2)}\n`);

  printReport(output);
}

function line(label, value) {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

function printReport(output) {
  const { probe, mp4 } = output;

  console.log("\n== environment ==");
  const env = probe.steps.environment ?? {};
  line("user agent", env.userAgent ?? "?");
  line("secure context", String(env.secureContext));

  console.log("\n== raw WebCodecs (real encodes, not just support checks) ==");
  for (const key of ["webcodecsVideo", "webcodecsAudio"]) {
    const step = probe.steps[key] ?? {};
    line(key, step.ok ? `${step.ms} ms` : `FAILED: ${step.error}`);
    if (step.ok) {
      line("  isConfigSupported", String(step.isConfigSupported));
      line("  encoded chunks", `${step.chunks} (key: ${step.keyChunks ?? "n/a"})`);
      line("  encoder state", String(step.encoderState));
      line("  encoder error", String(step.encoderError));
    }
  }

  console.log("\n== Mediabunny capability helpers ==");
  const caps = probe.steps.mediabunnyCapabilities ?? {};
  if (caps.ok) {
    for (const [name, variant] of Object.entries(caps.videoVariants ?? {})) {
      line(`avc ${name}`, variant.error ? `ERROR ${variant.error}` : String(variant.supported));
    }
    line("canEncodeAudio('aac')", String(caps.canEncodeAudio));
    line("first encodable video", String(caps.firstEncodableVideoCodec));
    line("encodable video codecs", (caps.encodableVideoCodecs ?? []).join(", "));
    line("encodable audio codecs", (caps.encodableAudioCodecs ?? []).join(", "));
  } else {
    line("capabilities", `FAILED: ${caps.error}`);
  }

  console.log("\n== render ==");
  const render = probe.steps.renderMp4 ?? {};
  if (render.ok) {
    line("encode time", `${render.ms} ms`);
    line("mime type", String(render.mimeType));
    line("output state", String(render.outputState));
    line("file size", `${render.bytes} bytes`);
    line("video encoder codec", String(render.videoEncoderConfig?.codec));
    line("audio encoder codec", String(render.audioEncoderConfig?.codec));
  } else {
    line("render", `FAILED: ${render.error}`);
  }

  console.log("\n== read back through Mediabunny ==");
  const back = probe.steps.readBack ?? {};
  if (back.ok) {
    line("duration", `${back.duration?.toFixed?.(3)} s`);
    line("video codec", String(back.videoCodec));
    line("coded size", `${back.width}x${back.height}`);
    line("video packets", `${back.videoPackets} @ ${back.videoFrameRate} fps`);
    line("video bitrate", `${back.videoAverageBitrate} bps`);
    line("audio codec", String(back.audioCodec));
    line("audio format", `${back.audioSampleRate} Hz, ${back.audioChannels} ch`);
    line("audio bitrate", `${back.audioAverageBitrate} bps`);
    line("decoded frames", `${back.decodedFrames} @ ${back.decodedWidth}px`);
    line(
      "decoded audio",
      `${back.decodedAudioBuffers} buffers, ${back.decodedAudioSeconds} s`,
    );
  } else {
    line("read back", `FAILED: ${back.error}`);
  }

  console.log("\n== Chrome playback ==");
  const playback = probe.steps.chromePlayback ?? {};
  if (playback.ok) {
    line("duration", `${playback.duration} s`);
    line("video size", `${playback.videoWidth}x${playback.videoHeight}`);
    line("readyState", String(playback.readyState));
    line("played to", `${playback.playedTo?.toFixed?.(2)} s`);
    line("seek to 4s landed at", `${playback.seekedTo?.toFixed?.(2)} s`);
    line("video element error", String(playback.error));
  } else {
    line("playback", `FAILED: ${playback.error}`);
  }

  console.log("\n== MP4 structure (independent byte-level read) ==");
  if (!mp4) {
    line("mp4", "not produced (see the render step above)");
    console.log(`\nReport written to ${REPORT_JSON}`);
    return;
  }
  line("file size", `${mp4.fileSize} bytes`);
  line("top-level boxes", mp4.topLevel.map((box) => box.type).join(" → "));
  line("moov offset", String(mp4.moovOffset));
  line("mdat offset", String(mp4.mdatOffset));
  line("moov before mdat", String(mp4.moovBeforeMdat));
  line("edit list present", `${mp4.hasElst} (edts: ${mp4.hasEdts})`);
  line(
    "movie timescale/duration",
    `${mp4.movie?.timescale} / ${mp4.movie?.duration} (${mp4.movie?.seconds?.toFixed?.(3)} s)`,
  );
  for (const [index, track] of mp4.tracks.entries()) {
    line(
      `track ${index}`,
      `${track.handler} ${track.codec} ${track.codedWidth ?? "-"}x${track.codedHeight ?? "-"} ` +
        `${track.sampleRate ? `${track.sampleRate} Hz ${track.channels} ch` : ""} ` +
        `samples=${track.sampleCount} duration=${track.mediaSeconds?.toFixed?.(3)}s`,
    );
  }

  console.log("\n== HTTP requests for the rendered file ==");
  for (const request of output.http.mediaRequests) {
    line(`${request.method} ${request.path}`, `Range: ${request.range ?? "none"}`);
  }

  console.log(`\nReport written to ${REPORT_JSON}`);
  console.log(`Test video written to ${OUTPUT_MP4}`);
}

await main();
