import { expect, test, type Page } from '@playwright/test';

// The main things a person does in Tare, in a real browser.

const toast = (page: Page) => page.locator('#toast');

// Every test runs with the app's security policy on; anything it blocks fails the test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { cspBlocked: string[] }).cspBlocked = [];
    document.addEventListener('securitypolicyviolation', e =>
      (window as unknown as { cspBlocked: string[] }).cspBlocked.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
});
test.afterEach(async ({ page }) => {
  if (page.isClosed() || page.url() === 'about:blank') return;
  const blocked = await page.evaluate(() => (window as unknown as { cspBlocked?: string[] }).cspBlocked ?? []).catch(() => []);
  expect(blocked, 'blocked by the security policy').toEqual([]);
});

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

async function pickImport(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#csvImport').click();
  await (await chooser).setFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
  await expect(page.locator('#importConfirm .importbox')).toBeVisible();
}

test('imports weigh-ins from a CSV file after a preview, into a new profile', async ({ page }) => {
  await open(page, '/#profile');
  await pickImport(page, 'weights.csv', 'date,weight_kg,note\n2020-01-01,90.5,first\n2020-01-02,90.1,\n');
  await expect(page.locator('#importConfirm')).toContainText('2 weigh-ins from Jan 1, 2020 to Jan 2, 2020');
  await expect(page.locator('#importConfirm')).toContainText('new profile');
  await page.locator('#importGo').click();
  await expect(toast(page)).toContainText('Imported 2 new');
  await expect(page.locator('#profileSel option:checked')).not.toContainText('example');
  await page.goto('/#history');
  await expect(page.locator('.month h3').last()).toContainText('January 2020');
});

test('asks for the unit when an imported file does not say', async ({ page }) => {
  await open(page, '/#profile');
  await pickImport(page, 'other-app.csv', 'Date,Weight,BMI\n03/04/2026,181.2,27.5\n03/05/2026,180.6,27.4\n');
  // Weights this high are suggested as pounds; switching to kg shows them as kg.
  await expect(page.locator('[data-import-unit=lb]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#importConfirm')).toContainText('Mar 4, 2026 to Mar 5, 2026');
  await page.locator('[data-import-unit=kg]').click();
  await expect(page.locator('#importConfirm')).toContainText('180.6 kg and 181.2 kg');
  await page.locator('#importCancel').click();
  await expect(page.locator('#importConfirm')).toBeHidden();
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

test('makes a progress picture to download, without weights unless asked', async ({ page }) => {
  await open(page, '/');
  await page.locator('[data-act=share]').click();
  const img = page.locator('#shareImg');
  // Checked in the page itself: the picture arrives as a blob: URL set on the image.
  const src = () => page.waitForFunction(() => document.querySelector<HTMLImageElement>('#shareImg')?.src || null);
  const pictureOtherThan = (old: string) =>
    page.waitForFunction(o => { const s = document.querySelector<HTMLImageElement>('#shareImg')?.src ?? ''; return s.startsWith('blob:') && s !== o; }, old);
  await pictureOtherThan('');
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(1080);
  const before = await (await src()).jsonValue() as string;
  await page.locator('#shareWeights').check();
  await pictureOtherThan(before);
  const download = page.waitForEvent('download');
  await page.locator('#shareDownload').click();
  expect((await download).suggestedFilename()).toMatch(/^tare-progress-\d{4}-\d{2}-\d{2}\.png$/);
});

/** What's saved in the browser's database, exactly as stored. */
const stored = (page: Page) => page.evaluate(() => new Promise<unknown>((resolve, reject) => {
  const rq = indexedDB.open('tare', 1);
  rq.onerror = () => reject(rq.error);
  rq.onsuccess = () => {
    const get = rq.result.transaction('app', 'readonly').objectStore('app').get('state');
    get.onsuccess = () => { resolve(get.result); rq.result.close(); };
    get.onerror = () => reject(get.error);
  };
}));

test('with a PIN, saved data is encrypted; turning it off saves it readable again', async ({ page }) => {
  await open(page, '/');
  await page.locator('#logBtn').click();
  await page.locator('#eW').fill('88.8');
  await page.locator('#eNote').fill('private note 7391');
  await page.locator('#entryForm button[type=submit]').click();
  await expect.poll(async () => JSON.stringify(await stored(page))).toContain('private note 7391');

  await page.goto('/#profile');
  await page.locator('[data-pin=set]').click();
  await page.locator('#pinNew').fill('2580');
  await page.locator('#pinRepeat').fill('2580');
  await page.locator('#pinForm button[type=submit]').click();
  await expect.poll(async () => (await stored(page) as { tare?: string })?.tare).toBe('encrypted');
  const sealed = JSON.stringify(await stored(page));
  for (const plain of ['private note 7391', 'Alex', '88.8', 'entries']) expect(sealed).not.toContain(plain);

  // The note is still there after unlocking.
  await page.reload();
  for (const d of '2580') await page.locator(`#keypad [data-key="${d}"]`).click();
  await expect(page.locator('#lock')).toBeHidden();
  await page.goto('/#history');
  await expect(page.locator('#view')).toContainText('private note 7391');

  await page.goto('/#profile');
  await page.locator('[data-pin=remove]').click();
  await page.locator('#pinCur').fill('2580');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('[data-pin=set]')).toBeVisible();
  await expect.poll(async () => JSON.stringify(await stored(page))).toContain('private note 7391');
});
