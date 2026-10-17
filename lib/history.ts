export type UploadHistoryEntry = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  publishAt: string | null;
  privacyStatus: string;
  createdAt: string;
};

const STORAGE_KEY = "beatflow.upload-history.v1";
const MAX_ENTRIES = 50;

function isEntry(value: unknown): value is UploadHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.videoId === "string" &&
    typeof entry.title === "string" &&
    (typeof entry.channelTitle === "string" || entry.channelTitle === null) &&
    (typeof entry.publishAt === "string" || entry.publishAt === null) &&
    typeof entry.privacyStatus === "string" &&
    typeof entry.createdAt === "string"
  );
}

export function readHistory(): UploadHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function addHistoryEntry(entry: UploadHistoryEntry) {
  if (typeof window === "undefined") return;
  const existing = readHistory().filter((item) => item.videoId !== entry.videoId);
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("beatflow:history"));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("beatflow:history"));
}

export function historyStatus(entry: UploadHistoryEntry): "scheduled" | "published" | "unlisted" {
  if (!entry.publishAt) return "unlisted";
  return Date.parse(entry.publishAt) > Date.now() ? "scheduled" : "published";
}
