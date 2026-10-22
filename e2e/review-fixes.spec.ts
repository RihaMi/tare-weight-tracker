import { readFileSync } from 'node:fs';
import { createProfile, expect, test, type Page } from './fixtures';

// Fixes from the code review: the lock closes every dialog, the log form refuses a future
// date, and "Replace everything" can be undone.

/** Pretends the app went to the background. */
const hide = (page: Page) => page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
});

test('locking closes an open dialog, so nothing shows above the lock screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  const slow = { timeout: 30_000 };
  await page.goto('/#profile');
  await page.locator('[data-pin=set]').click();
  await page.locator('#pinNew').fill('2580');
  await page.locator('#pinRepeat').fill('2580');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('[data-pin=remove]')).toBeVisible(slow);
  await page.locator('#autoLock').selectOption('0');            // lock as soon as Tare is in the background

  await page.goto('/#overview');
  await page.locator('[data-act=share]').click();
  await expect(page.locator('#shareImg')).toBeVisible();
  await hide(page);
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('the log form refuses a date that has not happened yet', async ({ page }) => {
  await page.goto('/');
  await page.locator('#logBtn').click();
  await page.locator('#eDate').fill('2099-01-01');
  await page.locator('#eW').fill('84.2');
  await page.locator('#entryForm button[type=submit]').click();
  await expect(page.locator('#eError')).toHaveText(/hasn't happened yet/);
  await expect(page.locator('#entryDlg')).toBeVisible();
});

test('"Replace everything" can be undone', async ({ page }) => {
  await page.goto('/#profile');
  const download = page.waitForEvent('download');
  await page.locator('#bkDownload').click();
  const exampleOnly = readFileSync((await (await download).path())!);
  await page.goto('/');
  await createProfile(page, 'Sam', true);
  await expect(page.locator('#profileSel option', { hasText: 'Sam' })).toHaveCount(1);

  await page.goto('/#profile');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#bkRestore').click();
  await (await chooser).setFiles({ name: 'old.json', mimeType: 'application/json', buffer: exampleOnly });
  await page.locator('#restoreGo').click();
  await expect(page.locator('#toast')).toContainText('Backup restored');
  await expect(page.locator('#profileSel option', { hasText: 'Sam' })).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(page.locator('#profileSel option', { hasText: 'Sam' })).toHaveCount(1);
});
