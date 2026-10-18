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
/** False once this session had to use memory because IndexedDB was unavailable. */
let durable = true;

function legacyStorage() {
  if (typeof window === "undefined") return undefined;
  return {
    read: () => {
      try {
        return JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "null");
      } catch {
        return null;
      }
    },
    clear: () => window.localStorage.removeItem(LEGACY_STORAGE_KEY),
  };
}

function memoryHistory(): HistoryController {
  durable = false;
  return createHistory({ backend: createMemoryBackend() });
}

function history(): HistoryController {
  if (controller) return controller;
  try {
    controller = createHistory({ backend: createIndexedDbBackend(), legacy: legacyStorage() });
  } catch {
    controller = memoryHistory();
  }
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

/**
 * Resolves true only when the entry is durably stored. A false result means the
 * upload succeeded but this browser could not keep the receipt; callers must
 * show a nonfatal warning instead of treating it as an upload failure.
 */
export async function addHistoryEntry(entry: UploadHistoryEntry): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    await history().add(entry);
    announce();
    return durable;
  } catch {
    // A failed async open/write still must not lose the receipt for this
    // session: keep it in memory and tell the user it is not durable.
    const memory = memoryHistory();
    controller = memory;
    try {
      await memory.add(entry);
    } catch {
      // The warning is still the honest result.
    }
    announce();
    return false;
  }
}

export async function clearHistory(): Promise<void> {
  if (typeof window === "undefined") return;
  // Let failures reject: the page must not show an empty list it did not clear.
  await history().clear();
  announce();
}

export function historyStatus(
  entry: UploadHistoryEntry,
): "scheduled" | "publish-time-passed" | "unlisted" | "unknown" {
  // A confirmed recovery never read the video's real release state.
  if (entry.privacyStatus === "unknown") return "unknown";
  if (!entry.publishAt) return "unlisted";
  // Passing the scheduled time is not proof that YouTube published it.
  return Date.parse(entry.publishAt) > Date.now() ? "scheduled" : "publish-time-passed";
}
