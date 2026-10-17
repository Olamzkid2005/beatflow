import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK_ALIGNMENT, uploadToResumableSession } from "../lib/youtube/uploader.ts";

const file = () => new Blob([new Uint8Array(CHUNK_ALIGNMENT * 2)], { type: "video/mp4" });
const options = () => ({ sessionUri: "https://upload.example/session", file: file(), chunkSize: CHUNK_ALIGNMENT });

function sequence(t, responses) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    calls.push(init);
    assert(responses.length, "Unexpected extra upload request");
    const response = responses.shift();
    return typeof response === "function" ? response(init) : response;
  });
  return calls;
}

async function drainTimers(t, promise) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let done = false;
  const observed = promise.finally(() => { done = true; });
  // Mark rejections handled while the clock-driving loop is still running.
  observed.catch(() => {});
  // Allow fetch/body promises to settle between advancing the clock.
  for (let i = 0; i < 100 && !done; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(120_000);
  }
  return observed;
}

test("uses the direct chunk Range without an extra status query", async (t) => {
  const calls = sequence(t, [
    new Response(null, { status: 308, headers: { Range: `bytes=0-${CHUNK_ALIGNMENT - 1}` } }),
    Response.json({ id: "healthy" }, { status: 201 }),
  ]);
  const progress = [];
  assert.equal(await uploadToResumableSession({ ...options(), onProgress: (p) => progress.push(p.percent) }), "healthy");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers["Content-Range"], `bytes ${CHUNK_ALIGNMENT}-${CHUNK_ALIGNMENT * 2 - 1}/${CHUNK_ALIGNMENT * 2}`);
  assert.deepEqual(progress, [0, 50, 100]);
});

test("resumes a network interruption from the server-confirmed partial offset", async (t) => {
  const calls = sequence(t, [
    () => { throw new TypeError("offline"); },
    new Response(null, { status: 308, headers: { Range: "bytes=0-1023" } }),
    Response.json({ id: "resumed" }, { status: 201 }),
  ]);
  assert.equal(await drainTimers(t, uploadToResumableSession(options())), "resumed");
  assert.equal(calls[1].headers["Content-Range"], `bytes */${CHUNK_ALIGNMENT * 2}`);
  assert.equal(calls[2].headers["Content-Range"], `bytes 1024-${CHUNK_ALIGNMENT + 1023}/${CHUNK_ALIGNMENT * 2}`);
});

test("absent Range never skips the unconfirmed first chunk", async (t) => {
  const calls = sequence(t, [new Response(null, { status: 308 }), Response.json({ id: "retried-first" }, { status: 201 })]);
  assert.equal(await drainTimers(t, uploadToResumableSession(options())), "retried-first");
  assert.equal(calls[0].headers["Content-Range"], calls[1].headers["Content-Range"]);
});

test("bounds stalled 308 responses", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response(null, { status: 308 }); });
  await assert.rejects(drainTimers(t, uploadToResumableSession(options())), /Retry limit reached/);
  assert.equal(calls, 6);
});

test("passes cancellation to status queries", async (t) => {
  const controller = new AbortController();
  const calls = sequence(t, [new Response(null, { status: 503 }), (init) => new Promise((_resolve, reject) => {
    assert(init.signal);
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    controller.abort();
  })]);
  await assert.rejects(drainTimers(t, uploadToResumableSession({ ...options(), signal: controller.signal })), { name: "AbortError" });
  assert.equal(calls.length, 2);
});

test("cancels backoff without sending another request", async (t) => {
  const controller = new AbortController();
  const calls = sequence(t, [new Response(null, { status: 503 })]);
  const uploading = uploadToResumableSession({ ...options(), signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(uploading, { name: "AbortError" });
  assert.equal(calls.length, 1);
});

test("rejects malformed ranges, empty files, and invalid chunk sizes", async (t) => {
  sequence(t, [new Response(null, { status: 308, headers: { Range: "bytes=0-9999999" } })]);
  await assert.rejects(uploadToResumableSession(options()), /inconsistent/);
  await assert.rejects(uploadToResumableSession({ ...options(), file: new Blob() }), /empty file/);
  await assert.rejects(uploadToResumableSession({ ...options(), chunkSize: NaN }), /positive multiple/);
});

test("bounds repeated network failures and reports an unknown outcome", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; throw new TypeError("offline"); });
  await assert.rejects(drainTimers(t, uploadToResumableSession(options())), {
    name: "UploadOutcomeUnknownError",
    message: /may already have this video/,
  });
  assert.equal(calls, 6);
});

test("honors Retry-After before checking the existing session", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = sequence(t, [new Response(null, { status: 429, headers: { "Retry-After": "3" } }), Response.json({ id: "after-backoff" }, { status: 201 })]);
  const pending = uploadToResumableSession(options());
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(2999);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  assert.equal(await pending, "after-backoff");
});

test("does not report success after cancellation while reading the final resource", async (t) => {
  const controller = new AbortController();
  const response = Response.json({ id: "already-created" }, { status: 201 });
  response.json = async () => { controller.abort(); return { id: "already-created" }; };
  sequence(t, [response]);
  const progress = [];
  await assert.rejects(uploadToResumableSession({ ...options(), signal: controller.signal, onProgress: (p) => progress.push(p.percent) }), { name: "AbortError" });
  assert(!progress.includes(100));
});

test("returns the existing video ID when a recovery query finds the upload completed", async (t) => {
  sequence(t, [new Response(null, { status: 503 }), Response.json({ id: "created-once" }, { status: 201 })]);
  assert.equal(await drainTimers(t, uploadToResumableSession(options())), "created-once");
});
