/**
 * Upload history storage. The controller is pure and takes a backend, so Node
 * tests can drive it with a fake while the browser uses IndexedDB (spec
 * section 7 step 4). No React, no DOM types outside the IndexedDB adapter.
 */

export const MAX_ENTRIES = 50;
export const LEGACY_STORAGE_KEY = "beatflow.upload-history.v1";

export type UploadHistoryEntry = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  publishAt: string | null;
  privacyStatus: string;
  createdAt: string;
};

export type HistoryBackend = {
  list(): Promise<unknown[]>;
  put(entry: UploadHistoryEntry): Promise<void>;
  remove(videoIds: string[]): Promise<void>;
  clear(): Promise<void>;
};

export type LegacyHistoryStorage = {
  read(): unknown;
  clear(): void;
};

export type HistoryController = {
  list(): Promise<UploadHistoryEntry[]>;
  add(entry: UploadHistoryEntry): Promise<UploadHistoryEntry[]>;
  clear(): Promise<void>;
};

export function isHistoryEntry(value: unknown): value is UploadHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.videoId === "string" &&
    entry.videoId.length > 0 &&
    typeof entry.title === "string" &&
    (typeof entry.channelTitle === "string" || entry.channelTitle === null) &&
    (typeof entry.publishAt === "string" || entry.publishAt === null) &&
    typeof entry.privacyStatus === "string" &&
    typeof entry.createdAt === "string"
  );
}

/** Newest first, validated, unique by video ID, uncapped. */
export function sortEntries(values: unknown[]): UploadHistoryEntry[] {
  const seen = new Set<string>();
  return values
    .filter(isHistoryEntry)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((entry) => (seen.has(entry.videoId) ? false : seen.add(entry.videoId)));
}

/** `sortEntries`, capped at the entries the browser keeps. */
export function normalizeEntries(values: unknown[]): UploadHistoryEntry[] {
  return sortEntries(values).slice(0, MAX_ENTRIES);
}

export function createHistory({
  backend,
  legacy,
}: {
  backend: HistoryBackend;
  legacy?: LegacyHistoryStorage;
}): HistoryController {
  let migrated = legacy === undefined;
  const read = async () => normalizeEntries(await backend.list());

  /**
   * Drops the oldest rows from the store itself. Trimming on the capped list
   * would be a no-op once the store exceeds the cap, because the cap hides the
   * rows that need removing.
   */
  async function trim(): Promise<void> {
    const all = sortEntries(await backend.list());
    if (all.length <= MAX_ENTRIES) return;
    await backend.remove(all.slice(MAX_ENTRIES).map((entry) => entry.videoId));
  }

  /** Moves the entries the previous localStorage version wrote, once. */
  async function migrate(): Promise<void> {
    if (migrated || !legacy) return;
    migrated = true;
    try {
      if ((await backend.list()).length > 0) return;
      const previous = legacy.read();
      const incoming = Array.isArray(previous) ? normalizeEntries(previous).reverse() : [];
      for (const entry of incoming) await backend.put(entry);
    } finally {
      legacy.clear();
    }
  }

  return {
    async list() {
      await migrate();
      return read();
    },
    async add(entry) {
      await migrate();
      await backend.put(entry);
      await trim();
      return read();
    },
    async clear() {
      await migrate();
      await backend.clear();
    },
  };
}

export function createMemoryBackend(initial: unknown[] = []): HistoryBackend {
  let rows = [...initial];
  return {
    async list() {
      return rows;
    },
    async put(entry) {
      rows = [...rows.filter((row) => (row as UploadHistoryEntry)?.videoId !== entry.videoId), entry];
    },
    async remove(videoIds) {
      const drop = new Set(videoIds);
      rows = rows.filter((row) => !drop.has((row as UploadHistoryEntry)?.videoId));
    },
    async clear() {
      rows = [];
    },
  };
}

/**
 * IndexedDB adapter. Kept thin on purpose: the controller above holds the
 * logic, and this is exercised by the browser check rather than Node tests.
 */
export function createIndexedDbBackend(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  dbName = "beatflow",
  storeName = "uploads",
): HistoryBackend {
  if (!factory) throw new Error("IndexedDB is unavailable in this browser.");
  let dbPromise: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    dbPromise ??= new Promise((resolve, reject) => {
      const request = factory.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "videoId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open the history database."));
    });
    return dbPromise;
  }

  function transaction<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          const request = work(tx.objectStore(storeName));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("History request failed."));
          tx.onabort = () => reject(tx.error ?? new Error("History transaction aborted."));
        }),
    );
  }

  return {
    list: () => transaction("readonly", (store) => store.getAll() as IDBRequest<unknown[]>),
    async put(entry) {
      await transaction("readwrite", (store) => store.put(entry));
    },
    async remove(videoIds) {
      if (videoIds.length === 0) return;
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        for (const videoId of videoIds) store.delete(videoId);
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("History cleanup failed."));
      });
    },
    async clear() {
      await transaction("readwrite", (store) => store.clear());
    },
  };
}
