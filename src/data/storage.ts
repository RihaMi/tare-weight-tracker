import { DataError, migrate, type AppData } from './schema';
import { isEnvelope, type Envelope } from '../lib/crypto';

/**
 * Where app data lives. The app talks only to this interface, so a cloud
 * store (accounts + sync) can replace the local one later without touching
 * the screens.
 */
export interface Store {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  load(): Promise<unknown | null>;
  /** Saves app data, or an encrypted envelope of it when a PIN is set. */
  save(data: AppData | Envelope): Promise<void>;
  /** Deletes the saved data, so the next start is a first run. Only when someone asks to start over. */
  clear(): Promise<void>;
}

const STATE_KEY = 'state';
/** Key used by the original single-file version of Tare. */
export const LEGACY_KEY = 'tare.v1';

class IndexedDBStore implements Store {
  readonly kind = 'indexeddb';
  private constructor(private db: IDBDatabase) {}

  static open(name = 'tare'): Promise<IndexedDBStore> {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB unavailable')); return; }
      const rq = indexedDB.open(name, 1);
      rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('app')) rq.result.createObjectStore('app'); };
      rq.onsuccess = () => resolve(new IndexedDBStore(rq.result));
      rq.onerror = () => reject(rq.error);
      rq.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  load(): Promise<unknown | null> {
    return new Promise((resolve, reject) => {
      const rq = this.db.transaction('app', 'readonly').objectStore('app').get(STATE_KEY);
      rq.onsuccess = () => resolve(rq.result ?? null);
      rq.onerror = () => reject(rq.error);
    });
  }

  save(data: AppData | Envelope): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('app', 'readwrite');
      tx.objectStore('app').put(structuredClone(data), STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('app', 'readwrite');
      tx.objectStore('app').delete(STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

class LocalStorageStore implements Store {
  readonly kind = 'localstorage';
  constructor(private key = 'tare.v2') {}
  async load(): Promise<unknown | null> { const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : null; }
  async save(data: AppData | Envelope): Promise<void> { localStorage.setItem(this.key, JSON.stringify(data)); }
  async clear(): Promise<void> { localStorage.removeItem(this.key); }
}

export class MemoryStore implements Store {
  readonly kind = 'memory';
  constructor(private data: unknown | null = null) {}
  async load(): Promise<unknown | null> { return this.data; }
  async save(data: AppData | Envelope): Promise<void> { this.data = structuredClone(data); }
  async clear(): Promise<void> { this.data = null; }
}

/** Best available store: IndexedDB, then localStorage, then memory (nothing survives a reload). */
export async function openStore(): Promise<Store> {
  try { return await IndexedDBStore.open(); } catch { /* fall through */ }
  try { localStorage.setItem('tare.probe', '1'); localStorage.removeItem('tare.probe'); return new LocalStorageStore(); } catch { /* fall through */ }
  return new MemoryStore();
}

/**
 * Saved data that's there but can't be used. The app must not start as if it
 * were a first run, or it would save the example profile over it.
 * - newer: saved by a newer version of Tare (an older copy is still running)
 * - damaged: not readable as Tare data
 * - unavailable: the browser wouldn't let Tare read its storage
 */
export type LoadProblem = { kind: 'newer' | 'damaged'; raw: unknown } | { kind: 'unavailable' };

/**
 * Loads and upgrades saved data, picking up data from the original version on
 * first run. Encrypted data comes back as `locked`: it needs the PIN first.
 * Data that's there but unusable comes back as `problem`, never as a first run.
 */
export async function loadData(store: Store): Promise<{ data: AppData | null; imported: boolean; locked?: Envelope; problem?: LoadProblem }> {
  let raw: unknown;
  try { raw = await store.load(); } catch { return { data: null, imported: false, problem: { kind: 'unavailable' } }; }
  if (isEnvelope(raw)) return { data: null, imported: false, locked: raw };
  if (raw != null) {
    try { return { data: migrate(raw), imported: false }; } catch (e) {
      return { data: null, imported: false, problem: { kind: e instanceof DataError && e.code === 'newerVersion' ? 'newer' : 'damaged', raw } };
    }
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const data = migrate(JSON.parse(legacy));
      await store.save(data);
      return { data, imported: true };
    }
  } catch { /* no usable legacy data */ }
  return { data: null, imported: false };
}

/**
 * Saves one at a time and in order, so a slow write never overwrites a newer one.
 * `encode` turns data into what's stored (e.g. encrypts it when a PIN is set).
 * `onSaved` runs after each save that worked, `onError` after each that didn't.
 */
export function createSaver(
  store: Store, onError: (e: unknown) => void,
  encode: (d: AppData) => AppData | Envelope | Promise<AppData | Envelope> = d => d,
  onSaved: () => void = () => {},
): (data: AppData) => Promise<void> {
  let chain: Promise<void> = Promise.resolve();
  return data => {
    const snapshot = structuredClone(data);
    chain = chain.then(async () => { await store.save(await encode(snapshot)); onSaved(); }).catch(onError);
    return chain;
  };
}
