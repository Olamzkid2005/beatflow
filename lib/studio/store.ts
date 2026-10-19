export type RecordKind = "template" | "asset" | "brand" | "job" | "preference";
type Row = { key: string; kind: RecordKind; value: unknown };
let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("IndexedDB is unavailable. Projects cannot be saved in this browser.")); return; }
    const request = indexedDB.open("beatflow-studio", 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "key" }).createIndex("kind", "kind");
    request.onerror = () => reject(request.error ?? new Error("Could not open project storage."));
    request.onblocked = () => { blocked = true; reject(new Error("Project storage is blocked by another tab. Close it and retry.")); };
    request.onsuccess = () => { const db = request.result; if (blocked) { db.close(); return; } db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
  }).catch(error => { opening = null; throw error; });
  return opening;
}
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", mode);
    let result: T | undefined;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error("Project storage transaction was rolled back. Nothing was saved."));
    tx.onerror = () => reject(tx.error ?? new Error("Project storage failed. Check available disk space."));
    try { const req = work(tx.objectStore("records")); if (req) req.onsuccess = () => { result = req.result; }; }
    catch (error) { tx.abort(); reject(error); }
  });
}
export async function getRecord<T>(kind: RecordKind, id: string): Promise<T | undefined> {
  const row = await transaction<Row | undefined>("readonly", store => store.get(`${kind}:${id}`));
  return row?.value as T | undefined;
}
export async function listRecords<T>(kind: RecordKind): Promise<T[]> {
  const rows = await transaction<Row[]>("readonly", store => store.index("kind").getAll(kind));
  return (rows ?? []).map(row => row.value as T);
}
export async function putRecords(items: Array<{ kind: RecordKind; id: string; value: unknown }>): Promise<void> {
  await transaction("readwrite", store => { for (const item of items) store.put({ key: `${item.kind}:${item.id}`, kind: item.kind, value: item.value } satisfies Row); });
  window.dispatchEvent(new Event("beatflow:studio"));
}
export async function putRecord(kind: RecordKind, id: string, value: unknown): Promise<void> { return putRecords([{ kind, id, value }]); }
export async function deleteRecords(items: Array<{kind: RecordKind; id: string}>): Promise<void> {
  await transaction("readwrite", store => { for (const {kind,id} of items) store.delete(`${kind}:${id}`); });
  window.dispatchEvent(new Event("beatflow:studio"));
}
export async function deleteRecord(kind: RecordKind, id: string): Promise<void> { return deleteRecords([{kind,id}]); }
export async function requestPersistentStorage(): Promise<boolean> { return navigator.storage?.persist ? navigator.storage.persist() : false; }
export async function storageEstimate(): Promise<StorageEstimate> { return navigator.storage?.estimate ? navigator.storage.estimate() : {}; }
export type StoredAsset = { id: string; name: string; blob: Blob; type: string; createdAt: string };
export async function storeAsset(file: File): Promise<string> {
  const id = crypto.randomUUID();
  await putRecord("asset", id, { id, name: file.name, blob: file, type: file.type, createdAt: new Date().toISOString() } satisfies StoredAsset);
  return id;
}
export async function assetFile(id: string): Promise<File> {
  const asset = await getRecord<StoredAsset>("asset", id);
  if (!asset) throw new Error(`Missing local asset ${id}. Re-import the file; it was not uploaded anywhere.`);
  return new File([asset.blob], asset.name, { type: asset.type });
}
