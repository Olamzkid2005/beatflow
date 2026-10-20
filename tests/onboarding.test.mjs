import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_ONBOARDING_PROGRESS,
  onboardingStorageKey,
  readOnboardingProgress,
  writeOnboardingProgress,
} from "../lib/onboarding.ts";

function storage(value = null, canWrite = true) {
  const rows = new Map(value === null ? [] : [[onboardingStorageKey(), value]]);
  return {
    rows,
    getItem(key) { return rows.get(key) ?? null; },
    setItem(key, next) {
      if (!canWrite) throw new Error("QuotaExceededError");
      rows.set(key, String(next));
    },
  };
}

test("onboarding progress defaults safely when missing, malformed, or out of range", () => {
  assert.deepEqual(readOnboardingProgress(storage()), DEFAULT_ONBOARDING_PROGRESS);
  assert.deepEqual(readOnboardingProgress(storage("broken")), DEFAULT_ONBOARDING_PROGRESS);
  assert.deepEqual(readOnboardingProgress(storage(JSON.stringify({ setupComplete: "yes", tourStep: -8 }))), DEFAULT_ONBOARDING_PROGRESS);
  assert.deepEqual(readOnboardingProgress(storage(JSON.stringify({ setupComplete: true, tourComplete: false, tourStep: 3 }))), {
    setupComplete: true,
    tourComplete: false,
    tourStep: 3,
  });
});

test("tour progress persists, resumes, and surfaces storage write errors", () => {
  const store = storage();
  const progress = { setupComplete: true, tourComplete: false, tourStep: 8 };
  writeOnboardingProgress(progress, store);
  assert.deepEqual(readOnboardingProgress(store), progress);
  assert.throws(() => writeOnboardingProgress(progress, storage(null, false)), /QuotaExceeded/);
});
