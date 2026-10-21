import { expect, test, type Page } from './fixtures';

// A weight far from the trend is asked about once before it's saved ("94.1" for "84.1").
// The example profile's trend is about 84 kg.

async function open(page: Page) {
  await page.goto('/');
  await page.locator('#logBtn').click();
  await expect(page.locator('#entryDlg')).toBeVisible();
}
const save = (page: Page) => page.locator('#eSave').click();

test('a weight far from the trend is questioned, and can be corrected', async ({ page }) => {
  await open(page);
  await page.locator('#eW').fill('94.1');
  await save(page);
  const check = page.locator('#eCheck');
  await expect(check).toBeVisible();
  await expect(check).toContainText(/94\.1\skg is \d+\.\d\skg above your trend of 8\d\.\d\skg/);
  await expect(page.locator('#eSave')).toHaveText('Save anyway');
  await expect(page.locator('#entryDlg')).toBeVisible();     // nothing saved yet

  // Correcting the weight clears the question, and a likely weight saves at once.
  await page.locator('#eW').fill('84.1');
  await expect(check).toBeHidden();
  await expect(page.locator('#eSave')).toHaveText('Save');
  await save(page);
  await expect(page.locator('#entryDlg')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('84.1');
});

test('"Save anyway" keeps an unusual weight', async ({ page }) => {
  await open(page);
  await page.locator('#eW').fill('79.0');
  await save(page);
  await expect(page.locator('#eCheck')).toContainText('below your trend');
  await save(page);
  await expect(page.locator('#entryDlg')).toBeHidden();
  await page.goto('/#history');
  await expect(page.locator('.row .w').first()).toHaveText(/79\.0\skg/);
});

test('a normal day-to-day swing is saved without a question', async ({ page }) => {
  await open(page);
  await page.locator('#eW').fill('85.9');
  await save(page);
  await expect(page.locator('#entryDlg')).toBeHidden();
  await expect(page.locator('#eCheck')).toBeHidden();
});
