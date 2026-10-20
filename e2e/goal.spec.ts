import { expect, test } from '@playwright/test';

// The likely goal date: a range in the Stats card and a cone on the chart.

test('shows the likely goal date as a range, and on the chart', async ({ page }) => {
  await page.goto('/');
  const stat = page.locator('.stat', { has: page.locator('.k', { hasText: 'Likely goal date' }) });
  await expect(stat.locator('.v')).toHaveText(/^\w{3} \d{1,2}(, \d{4})? – \w{3} \d{1,2}(, \d{4})?$/);
  await page.locator('[data-range="0"]').click();
  await expect(page.locator('#chartBox .cone')).toHaveCount(1);
  await expect(page.locator('#chartBox .cone-t')).toHaveText('likely goal date');
  // On a short range the weigh-ins keep the space, and the cone is left out.
  await page.locator('[data-range="30"]').click();
  await expect(page.locator('#chartBox .cone')).toHaveCount(0);
});

test('falls back to a single date or nothing without a steady trend toward the goal', async ({ page }) => {
  await page.goto('/#profile');
  // A goal above the current weight while the example profile is losing: no range.
  await page.locator('#pGoal').fill('95');
  await page.locator('#profForm button[type=submit]').click();
  await page.goto('/#overview');
  await expect(page.locator('.stat .k', { hasText: 'Likely goal date' })).toHaveCount(0);
  await expect(page.locator('.stat .k', { hasText: 'Projected goal date' })).toHaveCount(1);
  await expect(page.locator('#chartBox .cone')).toHaveCount(0);
});
