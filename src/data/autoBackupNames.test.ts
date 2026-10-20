import { describe, expect, it } from 'vitest';
import { backupKey, backupsToPrune } from './backup';
import { freshData } from './schema';
import { sampleProfile } from './sample';

describe('automatic backups', () => {
  it('keeps the newest seven daily files and leaves other files alone', () => {
    const days = Array.from({ length: 10 }, (_, i) => `tare-backup-2026-10-${String(11 + i).padStart(2, '0')}.json`);
    const names = [...days, 'notes.txt', 'tare-backup-old.json', 'holiday.jpg'];
    expect(backupsToPrune(names)).toEqual(['tare-backup-2026-10-13.json', 'tare-backup-2026-10-12.json', 'tare-backup-2026-10-11.json']);
    expect(backupsToPrune(days.slice(0, 3))).toEqual([]);
  });

  it('sees no change when only the backup bookkeeping changed', () => {
    const d = freshData([sampleProfile('2026-10-20')]);
    const before = backupKey(d);
    d.settings.lastBackupAt = Date.now();
    d.settings.backupSnoozeUntil = Date.now();
    expect(backupKey(d)).toBe(before);
    d.profiles[0].entries[0].kg += 1;
    expect(backupKey(d)).not.toBe(before);
  });
});

describe('encrypted backups', () => {
  it('are read back as encrypted, and open with the PIN they were made with', async () => {
    const { isEnvelope, keyInfoFor, newKeyInfo, seal, unseal } = await import('../lib/crypto');
    const { migrate } = await import('./schema');
    const { readBackupFile, toBackupJSON } = await import('./backup');
    const d = freshData([sampleProfile('2026-10-20')]);
    const k = await newKeyInfo('2580', 1000);
    const file = JSON.stringify(await seal(JSON.parse(toBackupJSON(d)), k));
    const read = readBackupFile(file);
    expect(isEnvelope(read)).toBe(true);
    if (!isEnvelope(read)) return;
    await expect(keyInfoFor('1111', read).then(w => unseal(read, w))).rejects.toThrow();
    const back = migrate(await unseal(read, await keyInfoFor('2580', read)));
    expect(back.profiles[0].entries).toHaveLength(d.profiles[0].entries.length);
  });
});
