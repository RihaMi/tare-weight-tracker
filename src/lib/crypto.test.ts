import { describe, expect, it } from 'vitest';
import { MemoryStore, createSaver, loadData } from '../data/storage';
import { defaultSettings, type AppData } from '../data/schema';
import { KEY_ITERATIONS, isEnvelope, isWeakKey, keyInfoFor, newKeyInfo, seal, unseal } from './crypto';

const ROUNDS = 1000; // fast for tests; the app uses 600 000

const data = (): AppData => ({
  version: 8, unit: 'kg', activeId: 'p',
  profiles: [{ id: 'p', name: 'Secret Name', unit: 'kg', sex: 'f', birthYear: 1990, heightCm: 165, frame: 'medium', activity: 1.375, goalKg: 60, goalDate: null, updatedAt: 0, events: [], goalSteps: [], cycleTracking: false, periodStarts: [],
    entries: [{ id: 'e1', date: '2026-10-19', kg: 63.4, note: 'private note', updatedAt: 0 }] }],
  settings: defaultSettings(),
});

describe('encryption', () => {
  it('opens data saved with fewer rounds, and flags its key for a stronger one', async () => {
    const old = await seal(data(), await newKeyInfo('2580', 150_000));
    const k = await keyInfoFor('2580', old);
    expect(await unseal(old, k)).toEqual(data());
    expect(isWeakKey(k)).toBe(true);
    const strong = await newKeyInfo('2580');
    expect(strong.iterations).toBe(KEY_ITERATIONS);
    expect(KEY_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(isWeakKey(strong)).toBe(false);
  });

  it('round-trips data with the right PIN', async () => {
    const k = await newKeyInfo('2580', ROUNDS);
    const env = await seal(data(), k);
    expect(await unseal(env, k)).toEqual(data());
    expect(await unseal(env, await keyInfoFor('2580', env))).toEqual(data());
  });

  it('stores nothing readable', async () => {
    const env = await seal(data(), await newKeyInfo('2580', ROUNDS));
    const stored = JSON.stringify(env);
    for (const secret of ['Secret Name', 'private note', '63.4', '2580']) expect(stored).not.toContain(secret);
    expect(env.pinLength).toBe(4);
  });

  it('rejects a wrong PIN and tampered data', async () => {
    const env = await seal(data(), await newKeyInfo('2580', ROUNDS));
    await expect(unseal(env, await keyInfoFor('2581', env))).rejects.toThrow();
    const tampered = { ...env, data: env.data.slice(0, -4) + (env.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
    await expect(unseal(tampered, await keyInfoFor('2580', env))).rejects.toThrow();
  });

  it('uses a fresh IV for every save', async () => {
    const k = await newKeyInfo('2580', ROUNDS);
    const a = await seal(data(), k), b = await seal(data(), k);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('is saved encrypted and comes back as a locked envelope', async () => {
    const store = new MemoryStore();
    const k = await newKeyInfo('2580', ROUNDS);
    await createSaver(store, () => {}, d => seal(d, k))(data());
    const loaded = await loadData(store);
    expect(loaded.data).toBeNull();
    expect(isEnvelope(loaded.locked)).toBe(true);
    expect(await unseal(loaded.locked!, k)).toEqual(data());
  });
});
