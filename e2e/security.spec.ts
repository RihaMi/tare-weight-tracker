import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';

// Hardening: encrypted downloads with a PIN, and data saved with the old, weaker PIN key is
// saved again with the stronger one. Framing is tested in framing.spec.ts.

// Each PIN step derives the key with 600 000 rounds on purpose; give it time.
const slow = { timeout: 30_000 };

async function setPin(page: Page, pin: string) {
  await page.goto('/#profile');
  await page.locator('[data-pin=set]').click();
  await page.locator('#pinNew').fill(pin);
  await page.locator('#pinRepeat').fill(pin);
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('[data-pin=remove]')).toBeVisible(slow);
}

test('with a PIN, a downloaded backup is encrypted', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  await setPin(page, '2580');
  const download = page.waitForEvent('download');
  await page.locator('#bkDownload').click();
  const text = readFileSync((await (await download).path())!, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ tare: 'encrypted', iterations: 600_000 });
  expect(text).not.toContain('Alex');
  await expect(page.locator('#toast')).toContainText('encrypted with your PIN');
});

/** Saved data, as stored. */
const stored = (page: Page) => page.evaluate(() => new Promise<Record<string, unknown>>((resolve, reject) => {
  const rq = indexedDB.open('tare', 1);
  rq.onerror = () => reject(rq.error);
  rq.onsuccess = () => {
    const get = rq.result.transaction('app', 'readonly').objectStore('app').get('state');
    get.onsuccess = () => { resolve(get.result); rq.result.close(); };
    get.onerror = () => reject(get.error);
  };
}));

test('data saved with the old 150 000-round key is saved again with the stronger key after unlocking', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  await setPin(page, '2580');
  // Re-save the stored data the way the previous version did: the same PIN, 150 000 rounds.
  await page.evaluate(async pin => {
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const key = async (salt: Uint8Array, iterations: number) => crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']),
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('tare', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const env = await new Promise<Record<string, string | number>>(res => { const g = db.transaction('app').objectStore('app').get('state'); g.onsuccess = () => res(g.result); });
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv as string) }, await key(unb64(env.salt as string), env.iterations as number), unb64(env.data as string));
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(salt, 150_000), plain));
    const old = { ...env, salt: b64(salt), iterations: 150_000, iv: b64(iv), data: b64(data) };
    await new Promise<void>(res => { const tx = db.transaction('app', 'readwrite'); tx.objectStore('app').put(old, 'state'); tx.oncomplete = () => res(); });
    db.close();
  }, '2580');
  expect((await stored(page)).iterations).toBe(150_000);

  await page.reload();
  for (const d of '2580') await page.locator(`#keypad [data-key="${d}"]`).click();
  await expect(page.locator('#lock')).toBeHidden(slow);
  await expect.poll(async () => (await stored(page)).iterations, slow).toBe(600_000);
});
