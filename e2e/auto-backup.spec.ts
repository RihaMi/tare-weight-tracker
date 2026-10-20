import { expect, test, type Page } from './fixtures';

// Automatic backups to a folder. The real folder picker can't be driven in a
// headless browser, so it's replaced by a folder in the browser's private
// storage (OPFS), which works the same way for writing and listing files.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker =
      async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Tare backups', { create: true });
  });
});

/** The backup files in the picked folder, with their text. */
const files = (page: Page) => page.evaluate(async () => {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tare backups', { create: true });
  const out: Record<string, string> = {};
  for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemFileHandle]> }).entries()) {
    if (name.endsWith('.crswap')) continue; // the browser's temporary file while one is being written
    try { out[name] = await (await h.getFile()).text(); } catch { /* removed meanwhile */ }
  }
  return out;
});

async function ready(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 6000 });
}

test('backs up to the chosen folder, again after a change, keeping the last 7 days', async ({ page }) => {
  await ready(page, '/#profile');
  // Nine older daily backups already in the folder, plus an unrelated file.
  await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tare backups', { create: true });
    for (const n of [...Array.from({ length: 9 }, (_, i) => `tare-backup-2025-01-0${i + 1}.json`), 'notes.txt']) {
      const w = await (await dir.getFileHandle(n, { create: true })).createWritable(); await w.write('{}'); await w.close();
    }
  });
  await page.locator('#abChoose').click();
  await expect(page.locator('#toast')).toContainText('Automatic backups are on');
  await expect(page.locator('#autoBackup')).toContainText('Backing up to the folder Tare backups');
  const today = await page.evaluate(() => { const d = new Date(); return `tare-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`; });
  let f = await files(page);
  expect(Object.keys(f).filter(n => n.startsWith('tare-backup-'))).toHaveLength(7);
  expect(f['notes.txt']).toBe('{}');
  expect(f[today]).toContain('"app": "tare"');

  // A change is backed up a few seconds later.
  await page.locator('#logBtn').click();
  await page.locator('#eW').fill('88.8');
  await page.locator('#eNote').fill('after the backup');
  await page.locator('#entryForm button[type=submit]').click();
  await expect.poll(async () => (await files(page))[today], { timeout: 15_000 }).toContain('after the backup');
  // It also counts as a backup for the reminder.
  await expect(page.locator('#view')).toContainText('Last backup:');
});

test('with a PIN, folder backups are encrypted, and restoring one asks for the PIN', async ({ page }) => {
  await ready(page, '/#profile');
  await page.locator('[data-pin=set]').click();
  await page.locator('#pinNew').fill('2580');
  await page.locator('#pinRepeat').fill('2580');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('[data-pin=remove]')).toBeVisible({ timeout: 20_000 });
  await page.locator('#abChoose').click();
  await expect(page.locator('#autoBackup')).toContainText('encrypted with it');
  const backup = await expect.poll(async () => Object.values(await files(page)).find(t => t.includes('"tare":"encrypted"')), { timeout: 20_000 }).toBeTruthy()
    .then(async () => Object.entries(await files(page)).find(([, t]) => t.includes('"tare":"encrypted"'))!);
  expect(backup[1]).not.toContain('Alex');

  const chooser = page.waitForEvent('filechooser');
  await page.locator('#bkRestore').click();
  await (await chooser).setFiles({ name: backup[0], mimeType: 'application/json', buffer: Buffer.from(backup[1]) });
  await expect(page.locator('#restoreConfirm')).toContainText('it is encrypted');
  await page.locator('#restorePin').fill('1111');
  await page.locator('#restorePinForm button[type=submit]').click();
  await expect(page.locator('#restorePinErr')).toHaveText("That PIN doesn't open this backup.", { timeout: 20_000 });
  await page.locator('#restorePin').fill('2580');
  await page.locator('#restorePinForm button[type=submit]').click();
  await expect(page.locator('#restoreConfirm')).toContainText('nothing here is deleted', { timeout: 20_000 });
});

test('when the browser forgets the permission, backups pause and can be allowed again', async ({ page }) => {
  await ready(page, '/#profile');
  await page.locator('#abChoose').click();
  await expect(page.locator('#autoBackup')).toContainText('Backing up');
  // Next visit: the browser wants permission again.
  await page.addInitScript(() => {
    const proto = (FileSystemHandle.prototype as unknown as { queryPermission: () => Promise<string>; requestPermission: () => Promise<string> });
    proto.queryPermission = async () => (sessionStorage.getItem('allowed') ? 'granted' : 'prompt');
    proto.requestPermission = async () => { sessionStorage.setItem('allowed', '1'); return 'granted'; };
  });
  await page.goto('/#overview');
  await page.reload(); // a hash change alone doesn't load the page again, so the override above wouldn't apply
  const banner = page.locator('.banner', { hasText: 'Automatic backups are paused' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Allow again' }).click();
  await expect(page.locator('#toast')).toContainText('Automatic backups are on again');
  await expect(banner).toBeHidden();
});
