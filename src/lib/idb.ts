const DB_NAME = "floppy-studio";
const VERSION = 1;
export const STORES = ["designs", "holo", "paper", "fonts", "models"] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no idb"));
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const idb = {
  async all<T>(store: StoreName): Promise<T[]> {
    try {
      return (await tx<T[]>(store, "readonly", (s) => s.getAll())) ?? [];
    } catch {
      return [];
    }
  },
  async put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
    try {
      await tx(store, "readwrite", (s) => s.put(value));
    } catch {
      /* ignore */
    }
  },
  async del(store: StoreName, id: string): Promise<void> {
    try {
      await tx(store, "readwrite", (s) => s.delete(id));
    } catch {
      /* ignore */
    }
  },
};
