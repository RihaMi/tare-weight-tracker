import { expect, test, type Page } from '@playwright/test';

// What Tare shows when something is wrong or there's nothing to show yet.

/** Reads or replaces what's saved in the browser's database. */
const stored = (page: Page) => page.evaluate(() => new Promise<unknown>((resolve, reject) => {
  const rq = indexedDB.open('tare', 1);
  rq.onerror = () => reject(rq.error);
  rq.onsuccess = () => {
    const get = rq.result.transaction('app', 'readonly').objectStore('app').get('state');
    get.onsuccess = () => { resolve(get.result); rq.result.close(); };
  };
}));
const store = (page: Page, value: unknown) => page.evaluate(v => new Promise<void>((resolve, reject) => {
  const rq = indexedDB.open('tare', 1);
  rq.onerror = () => reject(rq.error);
  rq.onsuccess = () => {
    const tx = rq.result.transaction('app', 'readwrite');
    tx.objectStore('app').put(v, 'state');
    tx.oncomplete = () => { rq.result.close(); resolve(); };
  };
}), value);

async function started(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#view .card').first()).toBeVisible();
  await expect.poll(() => stored(page)).toBeTruthy(); // the first run has saved the example
  // Let the first-run "works offline" message pass, so it can't replace one a test checks.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 6000 });
}

test.describe('saved data that can not be used', () => {
  test('damaged data is never overwritten, and can be downloaded or erased', async ({ page }) => {
    await started(page);
    const damaged = { hello: 'not Tare data' };
    await store(page, damaged);
    await page.reload();
    await expect(page.locator('.card.problem h2')).toHaveText("Tare couldn't read your saved data");
    await expect(page.locator('#logBtn')).toBeHidden();
    await page.waitForTimeout(500);
    expect(await stored(page)).toEqual(damaged);

    const download = page.waitForEvent('download');
    await page.locator('#spDownload').click();
    expect((await download).suggestedFilename()).toMatch(/^tare-saved-data-.*\.json$/);

    await page.locator('#spErase').click();
    await page.locator('#spErase').click(); // the second click confirms
    await expect(page.locator('#profileSel')).toContainText('example');
  });

  test('data from a newer version asks to reload, and is left alone', async ({ page }) => {
    await started(page);
    const newer = { ...(await stored(page) as object), version: 99 };
    await store(page, newer);
    await page.reload();
    await expect(page.locator('.card.problem h2')).toHaveText('This data is from a newer version of Tare');
    await page.waitForTimeout(500);
    expect(await stored(page)).toEqual(newer);
  });

  test('an error while starting shows a screen instead of "Loading…" forever', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'BroadcastChannel', { configurable: true, get() { throw new Error('test: no BroadcastChannel'); } }));
    await page.goto('/');
    await expect(page.locator('.card.problem h2')).toHaveText("Tare couldn't start");
    await expect(page.locator('.card.problem code')).toContainText('test: no BroadcastChannel');
  });
});

test('a failed save shows a banner until saving works again', async ({ page }) => {
  await started(page);
  // Make the browser's database refuse to save.
  await page.evaluate(() => {
    const w = window as unknown as { realPut: typeof IDBObjectStore.prototype.put };
    w.realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('test: disk full', 'QuotaExceededError'); };
  });
  await page.locator('#logBtn').click();
  await page.locator('#eW').fill('88.8');
  await page.locator('#entryForm button[type=submit]').click();
  const banner = page.locator('.banner[role=alert]', { hasText: "couldn't be saved" });
  await expect(banner).toBeVisible();
  await page.goto('/#history');
  await expect(banner).toBeVisible(); // on every screen

  await page.evaluate(() => { IDBObjectStore.prototype.put = (window as unknown as { realPut: typeof IDBObjectStore.prototype.put }).realPut; });
  await banner.getByRole('button', { name: 'Try again' }).click();
  await expect(banner).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Saved');
});

test('an unexpected error shows a bar with Reload', async ({ page }) => {
  await started(page);
  await page.evaluate(() => { setTimeout(() => { throw new Error('test: something broke'); }); });
  await expect(page.locator('#errorBar')).toBeVisible();
  await page.locator('#errorClose').click();
  await expect(page.locator('#errorBar')).toBeHidden();
});

test.describe('empty states', () => {
  test('Body without measurements shows one prompt', async ({ page }) => {
    await started(page);
    await page.locator('[data-act=newProfile]').click();
    await page.goto('/#body');
    await expect(page.locator('.card.empty h2')).toHaveText('No measurements yet');
    await expect(page.locator('.mcard')).toHaveCount(0);
    await page.locator('.card.empty [data-act=logMeas]').click();
    await expect(page.locator('#eMeasDetails')).toHaveAttribute('open', '');
  });

  test('History says when weekly averages will appear', async ({ page }) => {
    await started(page);
    await page.locator('[data-act=newProfile]').click();
    await page.locator('#logBtn').click();
    await page.locator('#eW').fill('80');
    await page.locator('#entryForm button[type=submit]').click();
    await page.goto('/#history');
    await expect(page.locator('#view')).toContainText('Weekly averages appear once you have weigh-ins in two different weeks');
  });

  test('a file that can not be imported says why, in the import panel', async ({ page }) => {
    await started(page, '/#profile');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#csvImport').click();
    await (await chooser).setFiles({ name: 'shopping.txt', mimeType: 'text/plain', buffer: Buffer.from('milk,eggs\nbread,butter\n') });
    await expect(page.locator('#importConfirm .warnbox')).toContainText("shopping.txt: Tare couldn't find a date column");
  });
});
