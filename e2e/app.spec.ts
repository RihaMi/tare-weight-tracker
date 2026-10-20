import { expect, test, type Page } from '@playwright/test';

// The main things a person does in Tare, in a real browser.

const toast = (page: Page) => page.locator('#toast');

/** Opens a screen once the app is ready offline, so the "works offline" message can't replace the one a test checks. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(toast(page)).not.toHaveClass(/show/, { timeout: 6000 });
}

async function logWeight(page: Page, value: string) {
  await page.locator('#logBtn').click();
  await expect(page.locator('#entryDlg')).toBeVisible();
  await page.locator('#eW').fill(value);
  await page.locator('#entryForm button[type=submit]').click();
  await expect(page.locator('#entryDlg')).toBeHidden();
}

test('opens with the example profile, logs a weight and keeps it after a reload', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('#profileSel')).toContainText('example');
  await logWeight(page, '88.8');
  await expect(toast(page)).toContainText('88.8');
  await page.goto('/#history');
  await expect(page.locator('.row .w').first()).toHaveText('88.8 kg');
  await page.reload();
  await expect(page.locator('.row .w').first()).toHaveText('88.8 kg');
});

test('switches units', async ({ page }) => {
  await page.goto('/#history');
  await page.locator('#unitSeg [data-unit=lb]').click();
  await expect(page.locator('.row .w').first()).toContainText('lb');
  await page.locator('#unitSeg [data-unit=st]').click();
  await expect(page.locator('.row .w').first()).toContainText('st');
});

test('a PIN locks the app until it is entered', async ({ page }) => {
  await page.goto('/#profile');
  await page.locator('[data-pin=set]').click();
  await page.locator('#pinNew').fill('2580');
  await page.locator('#pinRepeat').fill('2580');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('[data-pin=remove]')).toBeVisible();

  await page.reload();
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#view')).not.toContainText('Alex');
  await page.keyboard.type('1111');
  await expect(page.locator('#lockMsg')).toHaveText(/wrong/i);
  for (const d of '2580') await page.locator(`#keypad [data-key="${d}"]`).click();
  await expect(page.locator('#lock')).toBeHidden();
  await expect(page.locator('#view')).toBeVisible();
});

test('imports weigh-ins from a CSV file', async ({ page }) => {
  await open(page, '/#profile');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#csvImport').click();
  await (await chooser).setFiles({
    name: 'weights.csv', mimeType: 'text/csv',
    buffer: Buffer.from('date,weight_kg,note\n2020-01-01,90.5,first\n2020-01-02,90.1,\n'),
  });
  await expect(toast(page)).toContainText('Imported 2 new');
  await page.goto('/#history');
  await expect(page.locator('.month h3').last()).toContainText('January 2020');
});

test.describe('in Czech', () => {
  test.use({ locale: 'cs-CZ' });
  test('follows the browser language', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.locator('.tabs [data-tab=overview]')).toHaveText('Přehled');
  });
});

test('keeps working offline once loaded', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // the service worker now controls the page
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#logBtn')).toBeVisible();
  await expect(page.locator('#view .card').first()).toBeVisible();
});
