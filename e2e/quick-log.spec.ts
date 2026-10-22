import { createProfile, expect, test, type Page } from './fixtures';

// Quick log: the entry form opens by itself when you come back and haven't weighed in today.

/** Pretends the app went to the background and came back. */
async function awayAndBack(page: Page, minutes: number) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  if (minutes) await page.clock.fastForward(minutes * 60_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test('opens after a real break, not on return from a download or share sheet', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'Sam');
  await page.locator('#logBtn').click();
  await page.locator('#eDate').fill('2020-01-01'); // a weigh-in, but not today
  await page.locator('#eW').fill('80');
  await page.locator('#entryForm button[type=submit]').click();
  await expect(page.locator('#entryDlg')).toBeHidden();

  // A moment away (a download or share sheet): nothing pops up.
  await awayAndBack(page, 0);
  await page.clock.runFor(500);
  await expect(page.locator('#entryDlg')).toBeHidden();

  // A real break: the form opens, once.
  await awayAndBack(page, 6);
  await expect(page.locator('#entryDlg')).toBeVisible();
  await page.locator('#entryClose').click();
  await awayAndBack(page, 6);
  await page.clock.runFor(500);
  await expect(page.locator('#entryDlg')).toBeHidden();
});
