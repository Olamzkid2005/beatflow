export type OnboardingProgress = {
  setupComplete: boolean;
  tourComplete: boolean;
  tourStep: number;
};

export type OnboardingStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "beatflow.onboarding.v1";

export const DEFAULT_ONBOARDING_PROGRESS: OnboardingProgress = {
  setupComplete: false,
  tourComplete: false,
  tourStep: 0,
};

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
