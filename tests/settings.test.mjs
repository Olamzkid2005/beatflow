import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_SETTINGS,
  readSettings,
  resetSettings,
  writeSettings,
} from "../lib/settings.ts";

function fakeStorage(initial = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => void rows.set(key, String(value)),
    removeItem: (key) => void rows.delete(key),
  };
}

const KEY = "beatflow.producer-settings.v1";

test("missing or unreadable settings fall back to empty defaults", () => {
  const empty = readSettings(fakeStorage());
  assert.deepEqual(empty, { ...DEFAULT_SETTINGS, defaultTags: [] });
  assert.deepEqual(readSettings(fakeStorage({ [KEY]: "not json" })), { ...DEFAULT_SETTINGS, defaultTags: [] });
  assert.deepEqual(readSettings(fakeStorage({ [KEY]: '"a string"' })), { ...DEFAULT_SETTINGS, defaultTags: [] });
  assert.deepEqual(readSettings(null), { ...DEFAULT_SETTINGS, defaultTags: [] });
});

test("valid fields survive and invalid ones are dropped one by one", () => {
  const storage = fakeStorage({
    [KEY]: JSON.stringify({
      producerName: "Nova",
      timezone: 42,
      defaultTags: ["beat", 7],
      descriptionTemplate: "From {{producer_name}}",
      extra: "ignored",
    }),
  });
  assert.deepEqual(readSettings(storage), {
    producerName: "Nova",
    timezone: "",
    defaultTags: [],
    descriptionTemplate: "From {{producer_name}}",
  });

  const partial = fakeStorage({
    [KEY]: JSON.stringify({ producerName: "", timezone: "Africa/Lagos", defaultTags: ["type beat"], descriptionTemplate: "" }),
  });
  assert.deepEqual(readSettings(partial), {
    producerName: "",
    timezone: "Africa/Lagos",
    defaultTags: ["type beat"],
    descriptionTemplate: "",
  });
});

test("writing replaces the stored value and reset clears it", () => {
  const storage = fakeStorage();
  writeSettings({ producerName: "Nova", timezone: "UTC", defaultTags: ["beat"], descriptionTemplate: "hi" }, storage);
  assert.deepEqual(readSettings(storage), {
    producerName: "Nova",
    timezone: "UTC",
    defaultTags: ["beat"],
    descriptionTemplate: "hi",
  });
  resetSettings(storage);
  assert.equal(storage.getItem(KEY), null);
  assert.deepEqual(readSettings(storage), { ...DEFAULT_SETTINGS, defaultTags: [] });
});

test("a browser that refuses to store raises so the form can report it", () => {
  const blocked = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  assert.throws(() => writeSettings({ ...DEFAULT_SETTINGS, defaultTags: [] }, blocked), /QuotaExceeded/);
});

test("defaults are never shared between reads", () => {
  const first = readSettings(fakeStorage());
  first.defaultTags.push("mutated");
  assert.deepEqual(readSettings(fakeStorage()).defaultTags, []);
  assert.deepEqual(DEFAULT_SETTINGS.defaultTags, []);
});
