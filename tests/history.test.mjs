import assert from "node:assert/strict";
import { test } from "node:test";

import { createHistory, createMemoryBackend, MAX_ENTRIES, normalizeEntries } from "../lib/history-store.ts";
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
