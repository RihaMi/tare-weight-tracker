import { createProfile, expect, test } from './fixtures';

// Each profile has its own unit.

test('switching units changes only the active profile, and a new profile starts with the last one used', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'Petra');          // replaces the example
  await page.locator('#unitSeg [data-unit=lb]').click();
  await createProfile(page, 'Tom', true);      // starts in lb, the unit used last
  await expect(page.locator('#unitSeg [data-unit=lb]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#unitSeg [data-unit=st]').click();

  await page.locator('#profileSel').selectOption({ label: 'Petra' });
  await expect(page.locator('#unitSeg [data-unit=lb]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#profileSel').selectOption({ label: 'Tom' });
  await expect(page.locator('#unitSeg [data-unit=st]')).toHaveAttribute('aria-pressed', 'true');

  // Logging uses the active profile's unit: stones and pounds for Tom.
  await page.locator('#logBtn').click();
  await expect(page.locator('#eSt')).toBeVisible();
  await page.locator('#entryClose').click();
  await page.reload();
  await expect(page.locator('#unitSeg [data-unit=st]')).toHaveAttribute('aria-pressed', 'true');
});
