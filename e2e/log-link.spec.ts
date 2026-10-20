import { expect, test } from '@playwright/test';

// Logging a weight from a link (?log=84.2), as iOS Shortcuts or an NFC tag would open it.

test('a link fills in the form, and one tap on Save logs it', async ({ page }) => {
  await page.goto('/?log=88.8&note=from+a+link');
  await expect(page.locator('#entryDlg')).toBeVisible();
  await expect(page.locator('#entryTitle')).toHaveText('Save this weigh-in?');
  await expect(page.locator('#eW')).toHaveValue('88.8');
  await expect(page.locator('#eNote')).toHaveValue('from a link');
  await expect(page.locator('#entryForm button[type=submit]')).toBeFocused();
  // Nothing is saved until Save is pressed, and the link is gone from the address bar.
  expect(page.url()).not.toContain('log=');
  await page.keyboard.press('Enter');
  await expect(page.locator('#entryDlg')).toBeHidden();
  await page.goto('/#history');
  await expect(page.locator('.row', { hasText: 'from a link' }).locator('.w')).toHaveText('88.8 kg');
  await page.reload();
  await expect(page.locator('#entryDlg')).toBeHidden();
});

test('converts the unit given in the link', async ({ page }) => {
  await page.goto('/?log=185.6&unit=lb&date=2026-01-15');
  await expect(page.locator('#eW')).toHaveValue('84.2');
  await expect(page.locator('#eDate')).toHaveValue('2026-01-15');
});

test('says so when the link can not be read, and opens an empty form', async ({ page }) => {
  await page.goto('/?log=heavy');
  await expect(page.locator('#toast')).toContainText("couldn't be read");
  await expect(page.locator('#entryTitle')).toHaveText('Log weight');
});

test('with a PIN set, asks for it first, then fills in the form', async ({ page }) => {
  await page.goto('/#profile');
  await page.locator('[data-pin=set]').click();
  await page.locator('#pinNew').fill('2580');
  await page.locator('#pinRepeat').fill('2580');
  await page.locator('#pinForm button[type=submit]').click();
  await expect(page.locator('[data-pin=remove]')).toBeVisible();
  await page.goto('/?log=88.8');
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#entryDlg')).toBeHidden();
  for (const d of '2580') await page.locator(`#keypad [data-key="${d}"]`).click();
  await expect(page.locator('#entryDlg')).toBeVisible();
  await expect(page.locator('#eW')).toHaveValue('88.8');
});
