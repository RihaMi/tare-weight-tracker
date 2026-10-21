import { createProfile, expect, test, type Page } from './fixtures';

// Asking the browser to keep Tare's data (persistent storage): not on a first visit with
// only the example, but once there are weigh-ins, and Profile says what the browser answered.

async function fakeStorage(page: Page, grant: boolean) {
  await page.addInitScript(grant => {
    let kept = false;
    (window as unknown as { persistAsked: number }).persistAsked = 0;
    StorageManager.prototype.persisted = async () => kept;
    StorageManager.prototype.persist = async () => { (window as unknown as { persistAsked: number }).persistAsked++; kept = grant; return grant; };
  }, grant);
}
const asked = (page: Page) => page.evaluate(() => (window as unknown as { persistAsked: number }).persistAsked);

test('asks only once there are weigh-ins, and Profile says the data is kept', async ({ page }) => {
  await fakeStorage(page, true);
  await page.goto('/#profile');
  await expect(page.locator('#view')).toContainText('may clear your data');
  expect(await asked(page)).toBe(0);

  await createProfile(page, 'Sam', true);
  await page.locator('#logBtn').click();
  await page.locator('#eW').fill('80');
  await page.locator('#entryForm button[type=submit]').click();
  await expect.poll(() => asked(page)).toBe(1);
  await page.goto('/#profile');
  await expect(page.locator('#view')).toContainText("won't clear your data");
});

test('says so when the browser says no, and asks only once per visit', async ({ page }) => {
  await fakeStorage(page, false);
  await page.goto('/');
  await createProfile(page, 'Sam');
  for (const [date, kg] of [['2026-10-01', '80'], ['2026-10-02', '79.8']]) {
    await page.locator('#logBtn').click();
    await page.locator('#eDate').fill(date);
    await page.locator('#eW').fill(kg);
    await page.locator('#entryForm button[type=submit]').click();
    await expect(page.locator('#entryDlg')).toBeHidden();
  }
  await page.goto('/#profile');
  await expect(page.locator('#view')).toContainText('may clear your data');
  expect(await asked(page)).toBe(1);
});
