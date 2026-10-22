import { readFileSync } from 'node:fs';
import { createProfile, expect, test, type Page } from './fixtures';

// Merging a backup from another device into this one, instead of replacing everything.

async function log(page: Page, date: string, kg: string) {
  await page.locator('#logBtn').click();
  await page.locator('#eDate').fill(date);
  await page.locator('#eW').fill(kg);
  await page.locator('#entryForm button[type=submit]').click();
  await expect(page.locator('#entryDlg')).toBeHidden();
}

test('a backup from another device merges in, keeping what is only here, and can be undone', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'Sam');
  await log(page, '2026-10-01', '80');

  // "The other device": a backup of this state, plus a weigh-in logged there.
  await page.goto('/#profile');
  const download = page.waitForEvent('download');
  await page.locator('#bkDownload').click();
  const backup = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  backup.profiles[0].entries.push({ id: 'other-device', date: '2026-10-03', kg: 79.2, updatedAt: Date.now() + 1000 });

  // Meanwhile, here: another weigh-in the backup doesn't have.
  // Still on #profile: going there again would reload the page in WebKit.
  await log(page, '2026-10-02', '79.6');
  await expect(page).toHaveURL(/#profile$/);

  const chooser = page.waitForEvent('filechooser');
  await page.locator('#bkRestore').click();
  await (await chooser).setFiles({ name: 'other-device.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#restoreConfirm')).toContainText('stays deleted');
  await page.locator('#restoreMerge').click();
  await expect(page.locator('#toast')).toContainText('Merged: 1 new, 0 updated');

  await page.goto('/#history');
  for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) await expect(page.locator(`.row[data-edit="${d}"]`)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.row[data-edit="2026-10-03"]')).toHaveCount(0);
  await expect(page.locator('.row[data-edit="2026-10-02"]')).toHaveCount(1);
});

test('a weigh-in deleted after the backup was made stays deleted when merging it', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'Sam');
  await log(page, '2026-10-01', '80');
  await log(page, '2026-10-02', '79.8');
  await page.goto('/#profile');
  const download = page.waitForEvent('download');
  await page.locator('#bkDownload').click();
  const file = readFileSync((await (await download).path())!);

  // Delete the 2nd here, then merge the older backup that still has it.
  await page.goto('/#history');
  await page.locator('.row[data-edit="2026-10-02"]').click();
  await page.locator('#eDelete').click();
  await page.locator('#eDelete').click();
  await expect(page.locator('.row[data-edit="2026-10-02"]')).toHaveCount(0);
  await page.goto('/#profile');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#bkRestore').click();
  await (await chooser).setFiles({ name: 'older.json', mimeType: 'application/json', buffer: file });
  await page.locator('#restoreMerge').click();
  await expect(page.locator('#toast')).toContainText('Nothing new in that backup');
  await page.goto('/#history');
  await expect(page.locator('.row[data-edit="2026-10-02"]')).toHaveCount(0);
  await expect(page.locator('.row[data-edit="2026-10-01"]')).toHaveCount(1);
});

test('a weigh-in deleted on the other device is removed here by merging', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'Sam');
  await log(page, '2026-10-01', '80');
  await log(page, '2026-10-02', '79.8');
  await page.goto('/#profile');
  const download = page.waitForEvent('download');
  await page.locator('#bkDownload').click();
  // "The other device" deleted the 2nd after this device last changed it.
  const backup = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  backup.profiles[0].entries = backup.profiles[0].entries.filter((x: { date: string }) => x.date !== '2026-10-02');
  backup.profiles[0].deleted = [{ kind: 'entry', date: '2026-10-02', at: Date.now() + 60_000 }];
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#bkRestore').click();
  await (await chooser).setFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.locator('#restoreMerge').click();
  await expect(page.locator('#toast')).toContainText('1 removed');
  await page.goto('/#history');
  await expect(page.locator('.row[data-edit="2026-10-02"]')).toHaveCount(0);
});

test('merging the same backup again finds nothing new', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'Sam');
  await log(page, '2026-10-01', '80');
  await page.goto('/#profile');
  const download = page.waitForEvent('download');
  await page.locator('#bkDownload').click();
  const file = readFileSync((await (await download).path())!);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#bkRestore').click();
  await (await chooser).setFiles({ name: 'same.json', mimeType: 'application/json', buffer: file });
  await page.locator('#restoreMerge').click();
  await expect(page.locator('#toast')).toContainText('Nothing new in that backup');
});

test.describe('in dark mode at 320 px', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 320, height: 800 }, bypassCSP: true });
  test('the restore panel passes the layout check (its red buttons too)', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one run is enough');
    await page.goto('/#profile');
    const download = page.waitForEvent('download');
    await page.locator('#bkDownload').click();
    const file = readFileSync((await (await download).path())!);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#bkRestore').click();
    await (await chooser).setFiles({ name: 'tare-backup.json', mimeType: 'application/json', buffer: file });
    await expect(page.locator('#restoreGo')).toBeVisible();
    await page.addScriptTag({ path: new URL('../scripts/visual-audit.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
    const found = await page.evaluate(() => (window as unknown as { tareAudit: (o: object) => Promise<Record<string, string[]>> }).tareAudit({ tabs: ['current'] }));
    expect(found.current).toEqual([]);
  });
});
