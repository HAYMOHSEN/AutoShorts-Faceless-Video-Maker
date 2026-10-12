// IndexedDB storage: projects, binary assets (voice clips, media, music) and key/value settings.

const DB_NAME = 'autoshorts';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets')) {
        const s = db.createObjectStore('assets', { keyPath: 'id' });
        s.createIndex('kind', 'kind');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Transaction aborted'));
      })
  );
}

const req2p = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const db = {
  get: (store, key) => tx(store, 'readonly', (s) => req2p(s.get(key))),
  put: (store, value) => tx(store, 'readwrite', (s) => req2p(s.put(value))),
  del: (store, key) => tx(store, 'readwrite', (s) => req2p(s.delete(key))),
  all: (store) => tx(store, 'readonly', (s) => req2p(s.getAll())),
  keys: (store) => tx(store, 'readonly', (s) => req2p(s.getAllKeys())),
  clear: (store) => tx(store, 'readwrite', (s) => req2p(s.clear())),
  byIndex: (store, index, value) => tx(store, 'readonly', (s) => req2p(s.index(index).getAll(value))),
  keysByIndex: (store, index, value) => tx(store, 'readonly', (s) => req2p(s.index(index).getAllKeys(value))),
};

const kvCache = new Map();

export async function kvGet(k, def = null) {
  if (kvCache.has(k)) return kvCache.get(k);
  try {
    const row = await db.get('kv', k);
    const v = row ? row.v : def;
    kvCache.set(k, v);
    return v;
  } catch {
    return def;
  }
}

export async function kvSet(k, v) {
  kvCache.set(k, v);
  try {
    await db.put('kv', { k, v });
  } catch (e) {
    console.warn('kvSet failed', e);
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
}

export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
  } catch {
    /* ignore */
  }
  return { usage: 0, quota: 0 };
}
