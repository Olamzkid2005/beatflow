import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createHistory,
  createIndexedDbBackend,
  createMemoryBackend,
  MAX_ENTRIES,
  normalizeEntries,
} from "../lib/history-store.ts";
import { historyStatus } from "../lib/history.ts";
import { parseChannelUploads, pickMatchingUpload } from "../lib/youtube/reconcile.ts";

function entry(videoId, createdAt = "2026-10-17T10:00:00Z", extra = {}) {
  return {
    videoId,
    title: `Release ${videoId}`,
    channelTitle: "BeatFlow",
    publishAt: null,
    privacyStatus: "unlisted",
    createdAt,
    ...extra,
  };
}

test("entries are validated, deduped by video id, and capped", () => {
  const rows = normalizeEntries([
    entry("a", "2026-10-17T10:00:00Z"),
    entry("a", "2026-10-17T09:00:00Z"),
    entry("b", "2026-10-17T11:00:00Z"),
    { videoId: "c" },
    null,
    "nope",
  ]);
  assert.deepEqual(rows.map((row) => row.videoId), ["b", "a"]);

  const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, index) =>
    entry(`v${index}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()),
  );
  assert.equal(normalizeEntries(many).length, MAX_ENTRIES);
  assert.equal(normalizeEntries(many)[0].videoId, `v${MAX_ENTRIES + 4}`);
});

test("history adds, replaces, trims, and clears through a backend", async () => {
  const backend = createMemoryBackend();
  const history = createHistory({ backend });

  await history.add(entry("keep", "2026-10-17T10:00:00Z"));
  await history.add(entry("keep", "2026-10-17T12:00:00Z", { privacyStatus: "private" }));
  const afterReplace = await history.list();
  assert.equal(afterReplace.length, 1, "same video id replaces the earlier row");
  assert.equal(afterReplace[0].privacyStatus, "private");
  assert.equal(afterReplace[0].createdAt, "2026-10-17T12:00:00Z");

  const overflow = Array.from({ length: MAX_ENTRIES + 3 }, (_, index) =>
    entry(`v${index}`, new Date(Date.UTC(2026, 5, 1, 0, index)).toISOString()),
  );
  for (const row of overflow) await history.add(row);
  const trimmed = await history.list();
  assert.equal(trimmed.length, MAX_ENTRIES);
  assert.equal((await backend.list()).length, MAX_ENTRIES, "the store itself is trimmed");

  await history.clear();
  assert.deepEqual(await history.list(), []);
});

test("the first read migrates the previous localStorage entries exactly once", async () => {
  const backend = createMemoryBackend();
  let cleared = 0;
  let stored = [entry("legacy-1", "2026-10-01T10:00:00Z"), entry("legacy-2", "2026-10-02T10:00:00Z")];
  const history = createHistory({
    backend,
    legacy: {
      read: () => stored,
      clear: () => {
        cleared += 1;
        stored = null;
      },
    },
  });

  const migrated = await history.list();
  assert.deepEqual(migrated.map((row) => row.videoId), ["legacy-2", "legacy-1"]);
  assert.equal(cleared, 1);

  await history.add(entry("new", "2026-10-17T10:00:00Z"));
  assert.equal(cleared, 1, "migration never runs twice");
  assert.equal((await history.list()).length, 3);
});

test("migration leaves an existing store alone and still clears the legacy key", async () => {
  let cleared = 0;
  const history = createHistory({
    backend: createMemoryBackend([entry("already-here", "2026-10-17T10:00:00Z")]),
    legacy: { read: () => [entry("legacy")], clear: () => { cleared += 1; } },
  });
  assert.deepEqual((await history.list()).map((row) => row.videoId), ["already-here"]);
  assert.equal(cleared, 1);
});

/**
 * Minimal IndexedDB stand-in. It reproduces the ordering the adapter must
 * respect: request success fires before the transaction can still abort.
 */
function fakeIndexedDb({ abortAfterRequest = false } = {}) {
  const state = { abortAfterRequest };
  const databases = new Map();

  function storesFor(name) {
    if (!databases.has(name)) databases.set(name, new Map());
    return databases.get(name);
  }

  const factory = {
    open(name) {
      const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        const stores = storesFor(name);
        const db = {
          objectStoreNames: { contains: (storeName) => stores.has(storeName) },
          createObjectStore: (storeName) => stores.set(storeName, new Map()),
          transaction: (storeName) => {
            const rows = stores.get(storeName);
            const snapshot = new Map(rows);
            let aborted = false;
            const tx = { error: null, oncomplete: null, onabort: null, onerror: null };
            const run = (work) => {
              const operation = { result: undefined, error: null, onsuccess: null, onerror: null };
              queueMicrotask(() => {
                if (aborted) return;
                try {
                  operation.result = work();
                } catch (error) {
                  operation.error = error;
                  operation.onerror?.(new Event("error"));
                  return;
                }
                operation.onsuccess?.(new Event("success"));
                // A transaction can still roll back after the request reported success.
                queueMicrotask(() => {
                  if (aborted) return;
                  if (state.abortAfterRequest) {
                    aborted = true;
                    // A real abort rolls the whole transaction back.
                    rows.clear();
                    for (const [key, value] of snapshot) rows.set(key, value);
                    tx.error = new Error("transaction aborted after request success");
                    tx.onabort?.(new Event("abort"));
                  } else {
                    tx.oncomplete?.(new Event("complete"));
                  }
                });
              });
              return operation;
            };
            tx.objectStore = () => ({
              getAll: () => run(() => [...rows.values()]),
              put: (value) => run(() => { rows.set(value.videoId, structuredClone(value)); }),
              delete: (videoId) => run(() => { rows.delete(videoId); }),
              clear: () => run(() => { rows.clear(); }),
            });
            return tx;
          },
        };
        request.result = db;
        request.onupgradeneeded?.(new Event("upgradeneeded"));
        request.onsuccess?.(new Event("success"));
      });
      return request;
    },
  };

  return { factory, state, databases };
}

test("an IndexedDB write resolves only after the transaction commits", async () => {
  const { factory } = fakeIndexedDb();
  const backend = createIndexedDbBackend(factory, "durable-history");

  await backend.put(entry("committed"));
  assert.deepEqual((await backend.list()).map((row) => row.videoId), ["committed"]);

  await backend.clear();
  assert.deepEqual(await backend.list(), []);
});

test("a write whose transaction aborts after request success rejects", async () => {
  const { factory, databases } = fakeIndexedDb({ abortAfterRequest: true });
  const backend = createIndexedDbBackend(factory, "aborting-history");

  await assert.rejects(backend.put(entry("rolled-back")), /aborted after request success/i);
  assert.equal(databases.get("aborting-history").get("uploads").size, 0, "nothing committed");
});

test("clear and remove reject an aborted transaction without claiming success", async () => {
  const { factory, state, databases } = fakeIndexedDb();
  const backend = createIndexedDbBackend(factory, "aborting-clear");
  await backend.put(entry("keep"));

  state.abortAfterRequest = true;
  await assert.rejects(backend.clear(), /aborted after request success/i);
  await assert.rejects(backend.remove(["keep"]), /aborted after request success/i);

  const rows = databases.get("aborting-clear").get("uploads");
  assert.deepEqual([...rows.keys()], ["keep"], "the stored row survives the aborted writes");
});

test("release state follows the schedule", () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const past = new Date(Date.now() - 3_600_000).toISOString();
  assert.equal(historyStatus(entry("a", "2026-10-17T10:00:00Z", { publishAt: future })), "scheduled");
  assert.equal(historyStatus(entry("b", "2026-10-17T10:00:00Z", { publishAt: past })), "published");
  assert.equal(historyStatus(entry("c")), "unlisted");
});

test("channel uploads are parsed defensively", () => {
  const uploads = parseChannelUploads({
    items: [
      { snippet: { title: "Good", publishedAt: "2026-10-17T10:00:00Z", resourceId: { videoId: "ok" } } },
      { snippet: { title: "No id", publishedAt: "2026-10-17T10:00:00Z" } },
      { snippet: { title: "Bad date", publishedAt: "not-a-date", resourceId: { videoId: "x" } } },
      { snippet: {} },
      "garbage",
    ],
  });
  assert.deepEqual(uploads, [{ videoId: "ok", title: "Good", publishedAt: "2026-10-17T10:00:00Z" }]);
  assert.deepEqual(parseChannelUploads(null), []);
  assert.deepEqual(parseChannelUploads({ items: "nope" }), []);
});

test("the newest matching upload inside the window wins, otherwise nothing", () => {
  const attemptStart = "2026-10-17T12:00:00.000Z";
  const items = [
    { videoId: "old-same-title", title: "Midnight Loop", publishedAt: "2026-10-16T12:00:00Z" },
    { videoId: "just-before", title: "Midnight  Loop", publishedAt: "2026-10-17T11:58:00Z" },
    { videoId: "first", title: "midnight loop", publishedAt: "2026-10-17T12:00:30Z" },
    { videoId: "second", title: "Midnight Loop", publishedAt: "2026-10-17T12:01:00Z" },
    { videoId: "other", title: "Different track", publishedAt: "2026-10-17T12:01:30Z" },
  ];

  assert.equal(pickMatchingUpload(items, { title: "Midnight Loop", notBefore: attemptStart }).videoId, "second");
  assert.equal(
    pickMatchingUpload(items, { title: "Midnight Loop", notBefore: attemptStart, toleranceMs: 0 }).videoId,
    "second",
  );
  assert.equal(
    pickMatchingUpload(items, { title: "Midnight Loop", notBefore: "2026-10-17T13:00:00Z" }),
    null,
    "an upload from before the attempt window must not be claimed",
  );
  assert.equal(pickMatchingUpload(items, { title: "Never uploaded", notBefore: attemptStart }), null);
  assert.equal(pickMatchingUpload(items, { title: "Midnight Loop", notBefore: "nonsense" }), null);
});
