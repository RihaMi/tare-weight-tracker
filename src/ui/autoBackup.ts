import { app } from '../app';
import { backupKey, backupsToPrune, toBackupJSON } from '../data/backup';
import { todayISO } from '../lib/dates';
import { seal } from '../lib/crypto';

// Automatic backups to a folder the person picks (Chrome and Edge on a
// computer). After each change Tare writes that day's backup there, keeping
// the last seven days. A folder that OneDrive, Google Drive or Dropbox syncs
// puts the backups off the device too. With a PIN set they're encrypted with it.
//
// The folder's handle is kept in its own small database, not in Tare's data:
// it's this browser's permission, not something to back up or sync.

// The File System Access API isn't in TypeScript's DOM types yet.
type Permission = 'granted' | 'denied' | 'prompt';
/** The parts of a folder handle Tare uses. */
interface DirHandle {
  readonly name: string;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string): Promise<void>;
  keys(): AsyncIterable<string>;
  queryPermission(o: { mode: 'readwrite' }): Promise<Permission>;
  requestPermission(o: { mode: 'readwrite' }): Promise<Permission>;
}
declare global {
  interface Window { showDirectoryPicker?: (o?: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<DirHandle> }
}

interface Saved { handle: DirHandle; lastAt: number | null; lastKey: string | null }

export type AutoBackupState =
  | { kind: 'unsupported' }
  | { kind: 'off' }
  | { kind: 'on'; folder: string; lastAt: number | null }
  | { kind: 'paused'; folder: string };

const DB = 'tare-files', STORE = 'handles', KEY = 'backupFolder';
let state: AutoBackupState = { kind: 'off' };
let changed: () => void = () => {};
let timer: number | undefined;
let writing: Promise<void> = Promise.resolve();

export const autoBackupSupported = (): boolean => typeof window.showDirectoryPicker === 'function';
export const autoBackupState = (): AutoBackupState => state;

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const rq = op(d.transaction(STORE, mode).objectStore(STORE));
    rq.onsuccess = () => { resolve(rq.result as T); d.close(); };
    rq.onerror = () => { reject(rq.error); d.close(); };
  });
}
const load = () => idb<Saved | undefined>('readonly', s => s.get(KEY));
const store = (v: Saved) => idb<void>('readwrite', s => s.put(v, KEY));
const forget = () => idb<void>('readwrite', s => s.delete(KEY));

function set(next: AutoBackupState): void {
  state = next;
  changed();
}

/** Finds out whether automatic backups are on, and whether the browser still allows the folder. */
export async function initAutoBackup(onChange: () => void): Promise<void> {
  changed = onChange;
  if (!autoBackupSupported()) { state = { kind: 'unsupported' }; return; }
  try {
    const saved = await load();
    if (!saved) { state = { kind: 'off' }; return; }
    const ok = (await saved.handle.queryPermission({ mode: 'readwrite' })) === 'granted';
    set(ok ? { kind: 'on', folder: saved.handle.name, lastAt: saved.lastAt } : { kind: 'paused', folder: saved.handle.name });
  } catch { state = { kind: 'off' }; }
}

/** Asks for a folder (needs a click) and makes the first backup there straight away. */
export async function chooseBackupFolder(): Promise<boolean> {
  let handle: DirHandle;
  try { handle = await window.showDirectoryPicker!({ id: 'tare-backups', mode: 'readwrite', startIn: 'documents' }); }
  catch { return false; } // cancelled
  await store({ handle, lastAt: null, lastKey: null });
  set({ kind: 'on', folder: handle.name, lastAt: null });
  await backUpNow();
  return true;
}

/** After a browser restart the folder needs permission again; this asks (needs a click). */
export async function resumeAutoBackup(): Promise<boolean> {
  const saved = await load();
  if (!saved) return false;
  if ((await saved.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
  set({ kind: 'on', folder: saved.handle.name, lastAt: saved.lastAt });
  await backUpNow();
  return true;
}

export async function stopAutoBackup(): Promise<void> {
  clearTimeout(timer);
  await forget();
  set({ kind: 'off' });
}

/** Called after every save: backs up a few seconds later, once changes settle. */
export function scheduleAutoBackup(): void {
  if (state.kind !== 'on') return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void backUpNow(false), 4000);
}

/** Writes today's backup if anything changed since the last one (or always, when `force`). */
export function backUpNow(force = true): Promise<void> {
  writing = writing.then(() => write(force)).catch(() => {
    // Most likely the permission went away; show that rather than failing silently.
    if (state.kind === 'on') set({ kind: 'paused', folder: state.folder });
  });
  return writing;
}

async function write(force: boolean): Promise<void> {
  const saved = await load();
  if (!saved) return;
  if ((await saved.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') { set({ kind: 'paused', folder: saved.handle.name }); return; }
  const key = backupKey(app.data);
  if (!force && key === saved.lastKey) return;
  // With a PIN, the file is encrypted like the saved data; restoring it asks for the PIN.
  const json = toBackupJSON(app.data);
  const content = app.data.settings.pin && app.key ? JSON.stringify(await seal(JSON.parse(json), app.key)) : json;
  const file = await saved.handle.getFileHandle(`tare-backup-${todayISO()}.json`, { create: true });
  const w = await file.createWritable();
  await w.write(content);
  await w.close();
  const names: string[] = [];
  for await (const n of saved.handle.keys()) names.push(n);
  for (const n of backupsToPrune(names)) await saved.handle.removeEntry(n).catch(() => {});
  const now = Date.now();
  await store({ ...saved, lastAt: now, lastKey: key });
  set({ kind: 'on', folder: saved.handle.name, lastAt: now });
  // Counts as a backup for the reminder. Saving this changes only bookkeeping, so it won't back up again.
  app.data.settings.lastBackupAt = now;
  app.data.settings.backupSnoozeUntil = null;
  void app.persist(app.data);
}
