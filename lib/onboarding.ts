import {
  readSettings,
  writeSettings,
  type ProducerSettings,
  type SettingsStorage,
} from "./settings";

export type OnboardingProgress = {
  setupComplete: boolean;
  tourComplete: boolean;
  tourStep: number;
};

export type OnboardingStorage = Pick<Storage, "getItem" | "setItem">;

export type OnboardingIdentity = Pick<ProducerSettings, "producerName" | "timezone">;
export type OnboardingSetupResult =
  | { ok: true; settings: ProducerSettings; progress: OnboardingProgress }
  | { ok: false; reason: "producer-name" | "timezone" | "storage" };

const STORAGE_KEY = "beatflow.onboarding.v1";

export const DEFAULT_ONBOARDING_PROGRESS: OnboardingProgress = {
  setupComplete: false,
  tourComplete: false,
  tourStep: 0,
};

export function completeOnboardingSetup(
  identity: OnboardingIdentity,
  options: {
    settingsStorage?: SettingsStorage | null;
    onboardingStorage?: OnboardingStorage | null;
  } = {},
): OnboardingSetupResult {
  const producerName = identity.producerName.trim();
  if (!producerName) return { ok: false, reason: "producer-name" };

  const timezone = identity.timezone.trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    return { ok: false, reason: "timezone" };
  }

  let settings: ProducerSettings;
  try {
    settings = {
      ...readSettings(options.settingsStorage),
      producerName,
      timezone,
    };
    writeSettings(settings, options.settingsStorage);
  } catch {
    return { ok: false, reason: "storage" } as const;
  }
  const progress: OnboardingProgress = {
    setupComplete: true,
    tourComplete: false,
    tourStep: 0,
  };
  try {
    writeOnboardingProgress(progress, options.onboardingStorage);
  } catch {
    return { ok: false, reason: "storage" } as const;
  }
  return { ok: true, settings, progress };
}

export type TourProgressAction = "start" | "resume" | "pause" | "advance" | "skip";

export function nextOnboardingProgress(
  progress: OnboardingProgress,
  action: TourProgressAction,
  stepCount: number,
  currentStep = progress.tourStep,
): OnboardingProgress {
  const count = Number.isInteger(stepCount) && stepCount > 0 ? stepCount : 1;
  const step = Math.min(Math.max(Number.isInteger(currentStep) ? currentStep : 0, 0), count - 1);
  if (action === "skip" || (action === "advance" && step === count - 1)) {
    return { setupComplete: true, tourComplete: true, tourStep: count };
  }
  if (action === "start") return { setupComplete: true, tourComplete: false, tourStep: 0 };
  if (action === "resume") {
    return {
      setupComplete: true,
      tourComplete: false,
      tourStep: Math.min(Math.max(progress.tourStep, 0), count - 1),
    };
  }
  return {
    setupComplete: true,
    tourComplete: false,
    tourStep: action === "advance" ? Math.min(step + 1, count - 1) : step,
  };
}

function storageOrNull(storage?: OnboardingStorage | null): OnboardingStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readOnboardingProgress(storage?: OnboardingStorage | null): OnboardingProgress {
  const store = storageOrNull(storage);
  if (!store) return { ...DEFAULT_ONBOARDING_PROGRESS };
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_ONBOARDING_PROGRESS };
    const value = parsed as Record<string, unknown>;
    return {
      setupComplete: value.setupComplete === true,
      tourComplete: value.tourComplete === true,
      tourStep:
        typeof value.tourStep === "number" && Number.isInteger(value.tourStep) && value.tourStep >= 0
          ? value.tourStep
          : 0,
    };
  } catch {
    return { ...DEFAULT_ONBOARDING_PROGRESS };
  }
}

export function writeOnboardingProgress(
  progress: OnboardingProgress,
  storage?: OnboardingStorage | null,
): void {
  const store = storageOrNull(storage);
  if (!store) {
    if (typeof window !== "undefined") throw new Error("Local storage is unavailable in this browser.");
    return;
  }
  store.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function onboardingStorageKey(): string {
  return STORAGE_KEY;
}
