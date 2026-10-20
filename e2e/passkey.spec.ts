import { expect, test, type Page } from './fixtures';

// Unlocking with Face ID or a fingerprint (a passkey with the PRF extension).
// Chrome's virtual authenticator stands in for the device's biometric sensor
// and always verifies the person.

// Each PIN step runs the deliberately slow key derivation; with many browsers
// testing at once that can take longer than the default 5 seconds.
const slow = { timeout: 20_000 };

async function withAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true,
  } });
}

async function setPin(page: Page, pin: string) {
  await page.goto('/#profile');
  await page.locator('[data-pin=set]').click();
  await page.locator('#pinNew').fill(pin);
  await page.locator('#pinRepeat').fill(pin);
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('[data-pin=remove]')).toBeVisible(slow);
}

// The virtual authenticator is a Chrome DevTools feature. On a real iPhone this needs testing by hand (#15).
test.skip(({ browserName }) => browserName !== 'chromium', "needs Chrome's virtual authenticator");

test.beforeEach(async ({ page }) => { await withAuthenticator(page); });

test('Face ID or fingerprint unlocks instead of the PIN', async ({ page }) => {
  await setPin(page, '2580');
  await page.reload(); // support is checked at start
  await page.locator('#keypad').waitFor();
  for (const d of '2580') await page.locator(`#keypad [data-key="${d}"]`).click();
  await expect(page.locator('#lock')).toBeHidden(slow);
  await page.goto('/#profile');
  await page.locator('[data-pin=passkey]').click();
  await page.locator('#pinCur').fill('2580');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('#toast')).toContainText('Face ID or fingerprint unlock is on', slow);
  await expect(page.locator('.passkey-row')).toContainText('is on for this device');
  // The PIN isn't stored in plain text.
  expect(await page.evaluate(() => localStorage.getItem('tare.passkey'))).not.toContain('2580');

  await page.reload();
  const button = page.locator('#passkeyUnlock');
  await expect(button).toBeVisible();
  await expect(button).toBeFocused();
  await button.click();
  await expect(page.locator('#lock')).toBeHidden(slow);
  await expect(page.locator('#view .card').first()).toBeVisible();
});

test('a wrong PIN is refused when turning it on, and changing the PIN turns it off', async ({ page }) => {
  await setPin(page, '2580');
  await page.reload();
  for (const d of '2580') await page.locator(`#keypad [data-key="${d}"]`).click();
  await expect(page.locator('#lock')).toBeHidden(slow);
  await page.goto('/#profile');
  await page.locator('[data-pin=passkey]').click();
  await page.locator('#pinCur').fill('1111');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('#pinErr')).toBeVisible(slow);
  await page.locator('#pinCur').fill('2580');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('.passkey-row')).toContainText('is on for this device', slow);

  await page.locator('[data-pin=change]').click();
  await page.locator('#pinCur').fill('2580');
  await page.locator('#pinNew').fill('1357');
  await page.locator('#pinRepeat').fill('1357');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('[data-pin=passkey]')).toBeVisible(slow);
  expect(await page.evaluate(() => localStorage.getItem('tare.passkey'))).toBeNull();
});
