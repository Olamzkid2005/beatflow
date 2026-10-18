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
let channel: BroadcastChannel | null = null;

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

function ensureChannel(): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined" || channel) return;
  channel = new BroadcastChannel("beatflow-history");
  // Node exposes BroadcastChannel too; do not let tests hang on it.
  (channel as BroadcastChannel & { unref?: () => void }).unref?.();
  // IndexedDB writes do not emit `storage`; tell other tabs explicitly.
  channel.onmessage = () => window.dispatchEvent(new Event("beatflow:history"));
}

function announce() {
  ensureChannel();
  window.dispatchEvent(new Event("beatflow:history"));
  channel?.postMessage("changed");
}

/** Moves any in-memory receipts back to IndexedDB once it becomes available. */
async function retryDurable(extra?: UploadHistoryEntry): Promise<boolean> {
  const rows = controller ? await controller.list() : [];
  const fresh = createHistory({ backend: createIndexedDbBackend() });
  for (const row of rows) await fresh.add(row);
  if (extra) await fresh.add(extra);
  controller = fresh;
  durable = true;
  return true;
}

export async function readHistory(): Promise<UploadHistoryEntry[]> {
  if (typeof window === "undefined") return [];
  // A tab that only reads must still hear other tabs' writes.
  ensureChannel();
  try {
    if (!durable) await retryDurable().catch(() => {});
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
    if (!durable) {
      await retryDurable(entry);
      announce();
      return true;
    }
    await history().add(entry);
    announce();
    return true;
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
  // Never imply the durable rows were cleared when only memory is available.
  if (!durable) throw new Error("History storage is unavailable; nothing was cleared.");
  await history().clear();
  announce();
}

export function historyStatus(
  entry: UploadHistoryEntry,
): "scheduled" | "published" | "publish-time-passed" | "unlisted" | "unknown" | "failed" {
  // A confirmed recovery never read the video's real release state.
  if (entry.privacyStatus === "unknown" && !entry.checkedAt) return "unknown";
  if (
    entry.failureReason ||
    entry.uploadStatus === "failed" ||
    entry.uploadStatus === "rejected" ||
    entry.processingStatus === "failed"
  ) {
    return "failed";
  }
  // A real status check proves publication; a timestamp alone does not.
  if (entry.checkedAt && entry.privacyStatus === "public") return "published";
  if (entry.checkedAt && entry.privacyStatus === "unlisted") return "unlisted";
  if (!entry.publishAt) return entry.checkedAt ? "unlisted" : "unknown";
  return Date.parse(entry.publishAt) > Date.now() ? "scheduled" : "publish-time-passed";
}
