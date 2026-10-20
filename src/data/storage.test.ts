import { describe, expect, it } from 'vitest';
import { LEGACY_KEY, MemoryStore, createSaver, loadData, type Store } from './storage';
import { freshData, SCHEMA_VERSION } from './schema';
import { sampleProfile } from './sample';

const good = () => freshData([sampleProfile('2026-10-20')]);

describe('loading saved data', () => {
  it('loads good data, and reports nothing saved as a first run', async () => {
    expect((await loadData(new MemoryStore(good()))).data?.profiles).toHaveLength(1);
    expect(await loadData(new MemoryStore())).toEqual({ data: null, imported: false });
  });

  it('reports data from a newer version instead of treating it as a first run', async () => {
    const raw = { ...good(), version: SCHEMA_VERSION + 1 };
    expect(await loadData(new MemoryStore(raw))).toEqual({ data: null, imported: false, problem: { kind: 'newer', raw } });
  });

  it('reports damaged data, and does not replace it with older data', async () => {
    const raw = { hello: 'not tare' };
    const legacy = new Map([[LEGACY_KEY, JSON.stringify({ entries: [{ date: '2020-01-01', kg: 80 }] })]]);
    globalThis.localStorage = { getItem: (k: string) => legacy.get(k) ?? null } as Storage;
    const store = new MemoryStore(raw);
    expect((await loadData(store)).problem).toEqual({ kind: 'damaged', raw });
    expect(await store.load()).toEqual(raw); // left exactly as it was
  });

  it('reports storage that cannot be read', async () => {
    const store: Store = { kind: 'indexeddb', load: () => Promise.reject(new Error('blocked')), save: async () => {}, clear: async () => {} };
    expect((await loadData(store)).problem).toEqual({ kind: 'unavailable' });
  });
});

describe('saving', () => {
  it('reports each save that worked and each that failed', async () => {
    let fail = true;
    const store: Store = { kind: 'memory', load: async () => null, save: async () => { if (fail) throw new Error('full'); }, clear: async () => {} };
    const events: string[] = [];
    const save = createSaver(store, () => events.push('error'), d => d, () => events.push('saved'));
    await save(good());
    fail = false;
    await save(good());
    expect(events).toEqual(['error', 'saved']);
  });
});
