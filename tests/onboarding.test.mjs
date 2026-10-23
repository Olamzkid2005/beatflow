import assert from "node:assert/strict";
import { test } from "node:test";

import {
  completeOnboardingSetup,
  DEFAULT_ONBOARDING_PROGRESS,
  nextOnboardingProgress,
  onboardingStorageKey,
  readOnboardingProgress,
  writeOnboardingProgress,
} from "../lib/onboarding.ts";
import { readSettings, settingsStorageKey } from "../lib/settings.ts";

function storage(initial = {}, canWrite = true) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    getItem(key) { return rows.get(key) ?? null; },
    setItem(key, next) {
      if (!canWrite) throw new Error("QuotaExceededError");
      rows.set(key, String(next));
    },
  };
}

function settingsStorage(initial = {}, canWrite = true) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    getItem(key) { return rows.get(key) ?? null; },
    setItem(key, next) {
      if (!canWrite) throw new Error("QuotaExceededError");
      rows.set(key, String(next));
    },
    removeItem(key) { rows.delete(key); },
  };
}

test("setup saves required identity, preserves optional defaults, and starts the tour", () => {
  const settingsStore = settingsStorage({
    [settingsStorageKey()]: JSON.stringify({
      producerName: "Previous artist",
      timezone: "Europe/London",
      defaultTags: ["instrumental"],
      descriptionTemplate: "Credits: {{producer_name}}",
      defaultVisibility: "public",
    }),
  });
  const progressStore = storage();

  const result = completeOnboardingSetup(
    { producerName: "  Nova Beats  ", timezone: "UTC" },
    { settingsStorage: settingsStore, onboardingStorage: progressStore },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(readSettings(settingsStore), {
    producerName: "Nova Beats",
    timezone: "UTC",
    defaultTags: ["instrumental"],
    descriptionTemplate: "Credits: {{producer_name}}",
    defaultVisibility: "public",
  });
  assert.deepEqual(readOnboardingProgress(progressStore), {
    setupComplete: true,
    tourComplete: false,
    tourStep: 0,
  });
});

test("onboarding progress defaults safely when missing, malformed, or out of range", () => {
  assert.deepEqual(readOnboardingProgress(storage()), DEFAULT_ONBOARDING_PROGRESS);
  assert.deepEqual(readOnboardingProgress(storage({ [onboardingStorageKey()]: "broken" })), DEFAULT_ONBOARDING_PROGRESS);
  assert.deepEqual(readOnboardingProgress(storage({ [onboardingStorageKey()]: JSON.stringify({ setupComplete: "yes", tourStep: -8 }) })), DEFAULT_ONBOARDING_PROGRESS);
  assert.deepEqual(readOnboardingProgress(storage({ [onboardingStorageKey()]: JSON.stringify({ setupComplete: true, tourComplete: false, tourStep: 3 }) })), {
    setupComplete: true,
    tourComplete: false,
    tourStep: 3,
  });
});

test("tour progress starts, advances, pauses, resumes, and completes through persisted states", () => {
  const store = storage();
  const initial = readOnboardingProgress(store);
  const started = nextOnboardingProgress(initial, "start", 5);
  writeOnboardingProgress(started, store);
  assert.deepEqual(readOnboardingProgress(store), { setupComplete: true, tourComplete: false, tourStep: 0 });

  const advanced = nextOnboardingProgress(readOnboardingProgress(store), "advance", 5, 0);
  writeOnboardingProgress(advanced, store);
  assert.deepEqual(readOnboardingProgress(store), { setupComplete: true, tourComplete: false, tourStep: 1 });

  const paused = nextOnboardingProgress(readOnboardingProgress(store), "pause", 5, 3);
  writeOnboardingProgress(paused, store);
  const resumed = nextOnboardingProgress(readOnboardingProgress(store), "resume", 5);
  assert.deepEqual(resumed, { setupComplete: true, tourComplete: false, tourStep: 3 });
  writeOnboardingProgress(resumed, store);

  const completed = nextOnboardingProgress(resumed, "advance", 5, 4);
  writeOnboardingProgress(completed, store);
  assert.deepEqual(readOnboardingProgress(store), { setupComplete: true, tourComplete: true, tourStep: 5 });

  assert.throws(
    () => writeOnboardingProgress(completed, storage({}, false)),
    /QuotaExceeded/,
  );
});

test("setup refuses a blank producer name or invalid timezone without saving", () => {
  const settingsStore = settingsStorage();
  const progressStore = storage();
  assert.deepEqual(
    completeOnboardingSetup({ producerName: "   ", timezone: "UTC" }, { settingsStorage: settingsStore, onboardingStorage: progressStore }),
    { ok: false, reason: "producer-name" },
  );
  assert.deepEqual(
    completeOnboardingSetup({ producerName: "Nova", timezone: "Not/AZone" }, { settingsStorage: settingsStore, onboardingStorage: progressStore }),
    { ok: false, reason: "timezone" },
  );
  assert.equal(settingsStore.getItem(settingsStorageKey()), null);
  assert.deepEqual(readOnboardingProgress(progressStore), DEFAULT_ONBOARDING_PROGRESS);
});

test("setup reports blocked storage rather than marking the tour ready", () => {
  const settingsStore = settingsStorage({}, false);
  const progressStore = storage();
  assert.deepEqual(
    completeOnboardingSetup({ producerName: "Nova", timezone: "UTC" }, { settingsStorage: settingsStore, onboardingStorage: progressStore }),
    { ok: false, reason: "storage" },
  );
  assert.deepEqual(readOnboardingProgress(progressStore), DEFAULT_ONBOARDING_PROGRESS);
});
