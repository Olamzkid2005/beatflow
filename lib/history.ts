import {
  createHistory,
  createIndexedDbBackend,
  createMemoryBackend,
  LEGACY_STORAGE_KEY,
  MAX_ENTRIES,
  type HistoryController,
  type UploadHistoryEntry,
} from "./history-store";

export type { UploadHistoryEntry };
export { MAX_ENTRIES };

/**
 * Browser wiring for the upload history. IndexedDB is the store (spec section
 * 7 step 4); the localStorage entries an earlier version wrote are migrated on
 * first use. If IndexedDB is unavailable, the session keeps an in-memory copy
 * instead of throwing away an upload that already reached YouTube.
 */
let controller: HistoryController | null = null;

function history(): HistoryController {
  if (controller) return controller;
  let backend;
  try {
    backend = createIndexedDbBackend();
  } catch {
    backend = createMemoryBackend();
  }
  controller = createHistory({
    backend,
    legacy:
      typeof window === "undefined"
        ? undefined
        : {
            read: () => {
              try {
                return JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "null");
              } catch {
                return null;
              }
            },
            clear: () => window.localStorage.removeItem(LEGACY_STORAGE_KEY),
          },
  });
  return controller;
}

function announce() {
  window.dispatchEvent(new Event("beatflow:history"));
}

export async function readHistory(): Promise<UploadHistoryEntry[]> {
  if (typeof window === "undefined") return [];
  try {
    return await history().list();
  } catch {
    return [];
  }
}

export async function addHistoryEntry(entry: UploadHistoryEntry): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await history().add(entry);
  } catch {
    // History is a convenience; never turn a successful upload into an error.
  }
  announce();
}

export async function clearHistory(): Promise<void> {
  if (typeof window === "undefined") return;
  await history().clear();
  announce();
}

export function historyStatus(entry: UploadHistoryEntry): "scheduled" | "published" | "unlisted" {
  if (!entry.publishAt) return "unlisted";
  return Date.parse(entry.publishAt) > Date.now() ? "scheduled" : "published";
}
