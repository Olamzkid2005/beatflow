/**
 * F06 regression: real IndexedDB, real Chrome.
 *
 * The adapter must not report a write as saved when the transaction aborts
 * after its request succeeded. A wrapper aborts at exactly that point.
 *
 * Run: node tools/idb-durability-check.mjs
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
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

const PAGE = `<!doctype html><meta charset="utf-8"><title>F06 durability check</title>
<p id="status">running…</p><script type="module">
import { createHistory, createIndexedDbBackend } from "/history-store.js";
import { addHistoryEntry, readHistory } from "/history.js";

// Shared by both tabs in the two-tab replay below.
window.__historyEvents = 0;
window.addEventListener("beatflow:history", () => { window.__historyEvents += 1; });
window.historyAdd = (videoId) => addHistoryEntry(entry(videoId));
window.historyRead = async () => (await readHistory()).map((row) => row.videoId).sort();
window.historyEvents = () => window.__historyEvents;
window.historyResetEvents = () => { window.__historyEvents = 0; };
window.backend = (name, version) => createIndexedDbBackend(indexedDB, name, "uploads", version);
window.backendPut = (name, version, videoId) => window.backend(name, version).put(entry(videoId));
window.openHolder = (name) => new Promise((resolve, reject) => {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains("uploads")) {
      request.result.createObjectStore("uploads", { keyPath: "videoId" });
    }
  };
  request.onsuccess = () => { window.__holder = request.result; resolve(true); };
  request.onerror = () => reject(request.error);
});
window.closeHolder = () => { window.__holder?.close(); window.__holder = null; return true; };

/**
 * Wraps IndexedDB so a transaction can be aborted in the same tick its
 * request reports success. This is the ordering the old adapter mistook
 * for a durable write.
 */
function abortingFactory(flag) {
  const wrapRequest = (request, tx, mode) => {
    // Registered at creation so it fires even when the adapter attaches no
    // request handler (remove issues deletes and waits for the transaction).
    request.addEventListener("success", () => {
      if (flag.abort && (mode === "readwrite" || flag.scope === "all")) {
        try { tx.abort(); } catch (error) { flag.abortErrors.push(String(error)); }
      }
    });
    return {
      get result() { return request.result; },
      get error() { return request.error; },
      set onsuccess(fn) { request.addEventListener("success", () => fn?.()); },
      set onerror(fn) { request.addEventListener("error", () => fn?.(new Event("error"))); },
    };
  };
  const wrapDb = (db) => ({
    objectStoreNames: db.objectStoreNames,
    createObjectStore: (...args) => db.createObjectStore(...args),
    transaction(storeName, mode) {
      const tx = db.transaction(storeName, mode);
      return {
        get error() { return tx.error; },
        set oncomplete(fn) { tx.oncomplete = fn; },
        set onabort(fn) { tx.onabort = fn; },
        set onerror(fn) { tx.onerror = fn; },
        objectStore(name) {
          const store = tx.objectStore(name);
          return {
            getAll: () => wrapRequest(store.getAll(), tx, mode),
            put: (value) => wrapRequest(store.put(value), tx, mode),
            delete: (key) => wrapRequest(store.delete(key), tx, mode),
            clear: () => wrapRequest(store.clear(), tx, mode),
          };
        },
      };
    },
  });
  return {
    open(name, version) {
      const request = indexedDB.open(name, version);
      return {
        get result() { return wrapDb(request.result); },
        get error() { return request.error; },
        set onupgradeneeded(fn) {
          request.onupgradeneeded = () => fn({ target: { result: wrapDb(request.result) } });
        },
        set onsuccess(fn) {
          request.onsuccess = () => fn({ target: { result: wrapDb(request.result) } });
        },
        set onerror(fn) {
          request.onerror = () => fn({ target: { error: request.error } });
        },
      };
    },
  };
}

const entry = (videoId) => ({
  videoId, title: videoId, channelTitle: null, publishAt: null,
  privacyStatus: "unlisted", createdAt: "2026-10-18T10:00:00Z",
});

const rejected = async (promise, pattern) => {
  try {
    await promise;
    return false;
  } catch (error) {
    return pattern.test(String(error?.message ?? error));
  }
};

async function run() {
  const dbName = "beatflow-f06-" + crypto.randomUUID();
  const flag = { abort: true, scope: "write", abortErrors: [] };
  const aborting = createIndexedDbBackend(abortingFactory(flag), dbName);
  const normal = createIndexedDbBackend(indexedDB, dbName);
  const checks = {};

  checks.abortedPutRejected = await rejected(aborting.put(entry("rolled-back")), /abort/i);
  checks.abortedPutCommittedNothing = (await normal.list()).length === 0;

  await normal.put(entry("kept"));
  checks.normalPutCommitted = (await normal.list()).map((row) => row.videoId).join(",") === "kept";

  checks.abortedClearRejected = await rejected(aborting.clear(), /abort/i);
  checks.abortedClearKeptRow = (await normal.list()).map((row) => row.videoId).join(",") === "kept";

  checks.abortedRemoveRejected = await rejected(aborting.remove(["kept"]), /abort/i);
  checks.abortedRemoveKeptRow = (await normal.list()).map((row) => row.videoId).join(",") === "kept";

  // Reopen proves the successful write is durable, not just cached in a connection.
  const reopened = createIndexedDbBackend(indexedDB, dbName);
  checks.reopenSeesCommittedRow = (await reopened.list()).map((row) => row.videoId).join(",") === "kept";

  // F05: a failing legacy migration must keep the only copy and retry cleanly.
  const legacy = { rows: [entry("legacy-1"), entry("legacy-2")], cleared: 0 };
  const migration = createHistory({
    backend: createIndexedDbBackend(abortingFactory(flag), "beatflow-f05-" + crypto.randomUUID()),
    legacy: {
      read: () => legacy.rows,
      clear: () => { legacy.cleared += 1; legacy.rows = null; },
    },
  });
  checks.failedMigrationRejected = await rejected(migration.list(), /abort/i);
  checks.failedMigrationKeptLegacy = legacy.cleared === 0 && Array.isArray(legacy.rows);
  flag.abort = false;
  checks.migrationRetryCopiedRows =
    (await migration.list()).map((row) => row.videoId).sort().join(",") === "legacy-1,legacy-2";
  checks.migrationRetryClearedLegacyOnce = legacy.cleared === 1;
  checks.abortDidNotThrow = flag.abortErrors.length === 0;
  checks.dbName = dbName;
  return checks;
}

window.runDurabilityCheck = async () => {
  try {
    const checks = await run();
    const failed = Object.entries(checks).filter(([, value]) => value === false);
    return { ok: failed.length === 0, checks, failed: failed.map(([key]) => key) };
  } catch (error) {
    return { ok: false, error: String(error?.stack ?? error) };
  }
};
window.ready = true;
</script>`;

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(PAGE);
      return;
    }
    if (path === "/history.js") {
      const source = await readFile(join(root, "lib/history.ts"), "utf8");
      res.setHeader("Content-Type", "text/javascript");
      res.end(
        ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        })
          .outputText.replaceAll("./history-store", "/history-store.js"),
      );
      return;
    }
    if (path === "/history-store.js") {
      const source = await readFile(join(root, "lib/history-store.ts"), "utf8");
      res.setHeader("Content-Type", "text/javascript");
      res.end(
        ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      );
      return;
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
const profile = await mkdtemp(join(tmpdir(), "beatflow-f06-"));
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

  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`,
    { method: "PUT" },
  );
  assert(target.ok, `Could not open a tab (${target.status}).`);
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
      pageErrors.push(message.params.exceptionDetails.text ?? "page exception");
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
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.text);
    return value.result.value;
  };

  /** Opens an independent tab with its own CDP session. */
  const openTab = async () => {
    const response = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`,
      { method: "PUT" },
    );
    assert(response.ok, `Could not open a second tab (${response.status}).`);
    const ws = new WebSocket((await response.json()).webSocketDebuggerUrl);
    const tabPending = new Map();
    let tabId = 0;
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !tabPending.has(message.id)) return;
      const item = tabPending.get(message.id);
      tabPending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    });
    await new Promise((done, reject) => {
      ws.addEventListener("open", done, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const tabSend = (method, params = {}) =>
      new Promise((done, reject) => {
        const id = ++tabId;
        tabPending.set(id, { resolve: done, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const tabEvaluate = async (expression) => {
      const value = await tabSend("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (value.exceptionDetails) {
        throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
      }
      return value.result.value;
    };
    await tabSend("Runtime.enable");
    let tabReady = false;
    for (let i = 0; i < 100; i++) {
      if (await tabEvaluate("window.ready === true")) {
        tabReady = true;
        break;
      }
      await sleep(100);
    }
    assert(tabReady, "Second tab did not load the check page.");
    return { evaluate: tabEvaluate, close: () => ws.close() };
  };

  await send("Runtime.enable");
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (await evaluate("window.ready === true")) {
      ready = true;
      break;
    }
    await sleep(100);
  }
  assert(ready, "Check page did not load.");

  const result = await evaluate("window.runDurabilityCheck()");
  assert.equal(result.ok, true, JSON.stringify(result));
  for (const value of Object.values(result.checks)) {
    if (typeof value === "boolean") assert.equal(value, true, "a durability check failed");
  }
  assert.deepEqual(pageErrors, [], "page raised an exception");

  // --- Real two-tab replay -------------------------------------------------
  const tabB = await openTab();

  // A raw holder in tab A has no onversionchange, so tab B's upgrade blocks.
  const blockedName = `beatflow-two-blocked-${crypto.randomUUID()}`;
  assert.equal(await evaluate(`window.openHolder(${JSON.stringify(blockedName)})`), true);
  const blockedOutcome = await tabB.evaluate(`Promise.race([
    window.backend(${JSON.stringify(blockedName)}, 2).list()
      .then(() => "opened")
      .catch((error) => "rejected:" + String(error?.message ?? error)),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 20000)),
  ])`);
  assert.match(blockedOutcome, /^rejected:.*blocked by another tab/i);
  await evaluate("window.closeHolder()");
  let afterUnblock = { ok: false };
  for (let i = 0; i < 100; i++) {
    afterUnblock = await tabB.evaluate(`window.backend(${JSON.stringify(blockedName)}, 2).list()
      .then((rows) => ({ ok: true, rows }))
      .catch(() => ({ ok: false }))`);
    if (afterUnblock.ok) break;
    await sleep(100);
  }
  assert.equal(afterUnblock.ok, true, "the upgrade did not complete after the holder closed");
  assert.equal(afterUnblock.rows.length, 0);

  // Both tabs start listening; a write in one must wake the other.
  assert.deepEqual(await evaluate("window.historyRead()"), []);
  assert.deepEqual(await tabB.evaluate("window.historyRead()"), []);
  await tabB.evaluate("window.historyResetEvents()");
  assert.equal(await evaluate(`window.historyAdd("broadcast-a")`), true);
  let heard = 0;
  for (let i = 0; i < 100; i++) {
    heard = await tabB.evaluate("window.historyEvents()");
    if (heard > 0) break;
    await sleep(50);
  }
  assert(heard > 0, "the reading tab did not hear the broadcast");
  assert.deepEqual(await tabB.evaluate("window.historyRead()"), ["broadcast-a"]);

  await evaluate("window.historyResetEvents()");
  assert.equal(await tabB.evaluate(`window.historyAdd("broadcast-b")`), true);
  heard = 0;
  for (let i = 0; i < 100; i++) {
    heard = await evaluate("window.historyEvents()");
    if (heard > 0) break;
    await sleep(50);
  }
  assert(heard > 0, "the writing tab's peer did not hear the broadcast");
  assert.deepEqual(await evaluate("window.historyRead()"), ["broadcast-a", "broadcast-b"]);

  // Tab B upgrades the schema. Tab A's connection must close and reopen at v2.
  assert.equal(
    await tabB.evaluate(`window.backend("beatflow", 2).list().then((rows) => rows.length)`),
    2,
  );
  assert.deepEqual(
    await evaluate("window.historyRead()"),
    ["broadcast-a", "broadcast-b"],
    "the older tab did not reopen after the other tab upgraded the schema",
  );
  await tabB.evaluate(`window.backendPut("beatflow", 2, "after-upgrade")`);
  assert.deepEqual(await evaluate("window.historyRead()"), [
    "after-upgrade",
    "broadcast-a",
    "broadcast-b",
  ]);
  assert.equal(await evaluate(`window.historyAdd("after-upgrade-2")`), true);
  assert.deepEqual(
    await tabB.evaluate(
      `window.backend("beatflow", 2).list().then((rows) => rows.map((row) => row.videoId).sort())`,
    ),
    ["after-upgrade", "after-upgrade-2", "broadcast-a", "broadcast-b"],
  );
  tabB.close();

  const browser = await send("Browser.getVersion");
  console.log(
    `F06/F05 PASS — ${browser.product}\n` +
      `  aborted put/clear/remove rejected with nothing committed\n` +
      `  committed write survived reopen\n` +
      `  failed migration kept the legacy copy and retried once\n` +
      `  two tabs: blocked upgrade rejected, then completed after the holder closed\n` +
      `  two tabs: broadcast refreshed the reading tab; a later schema upgrade reopened the old tab\n` +
      `  abort did not throw; test database ${result.checks.dbName}`,
  );
} catch (error) {
  failure = error;
  console.error(`F06 check failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  socket?.close();
  child.kill("SIGTERM");
  for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i++) await sleep(100);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  if (failure) process.exitCode = 1;
}
