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

export function readSettings(): ProducerSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS, defaultTags: [] };
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
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

export function writeSettings(settings: ProducerSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("beatflow:settings"));
}

export function resetSettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("beatflow:settings"));
}
