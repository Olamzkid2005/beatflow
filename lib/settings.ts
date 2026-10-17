export type ProducerSettings = {
  producerName: string;
  timezone: string;
  defaultTags: string[];
  descriptionTemplate: string;
};

const STORAGE_KEY = "beatflow.producer-settings.v1";

export const DEFAULT_SETTINGS: ProducerSettings = {
  producerName: "",
  timezone: "",
  defaultTags: [],
  descriptionTemplate: "",
};

/** Minimal storage contract so Node tests can drive this without a browser. */
export type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageOrNull(storage?: SettingsStorage | null): SettingsStorage | null {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readSettings(storage?: SettingsStorage | null): ProducerSettings {
  const store = storageOrNull(storage);
  if (!store) return { ...DEFAULT_SETTINGS, defaultTags: [] };
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS, defaultTags: [] };
    const value = parsed as Record<string, unknown>;
    return {
      producerName: typeof value.producerName === "string" ? value.producerName : "",
      timezone: typeof value.timezone === "string" ? value.timezone : "",
      defaultTags:
        Array.isArray(value.defaultTags) && value.defaultTags.every((tag) => typeof tag === "string")
          ? value.defaultTags
          : [],
      descriptionTemplate:
        typeof value.descriptionTemplate === "string" ? value.descriptionTemplate : "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS, defaultTags: [] };
  }
}

/** Throws when the browser refuses to store the settings, so the form can say so. */
export function writeSettings(settings: ProducerSettings, storage?: SettingsStorage | null): void {
  const store = storageOrNull(storage);
  if (!store) return;
  store.setItem(STORAGE_KEY, JSON.stringify(settings));
  announce();
}

export function resetSettings(storage?: SettingsStorage | null): void {
  const store = storageOrNull(storage);
  if (!store) return;
  store.removeItem(STORAGE_KEY);
  announce();
}

function announce(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("beatflow:settings"));
}
