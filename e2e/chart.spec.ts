import { expect, test } from './fixtures';

// The weight chart without a mouse: arrow keys, read-out text, and a table.

test('the chart can be explored with the arrow keys', async ({ page }) => {
  await page.goto('/');
  const chart = page.locator('#chartBox');
  // Keys pressed before the chart is drawn would be lost, so wait for it first.
  await expect(chart.locator('svg')).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /arrow keys/);
  await chart.focus();
  await page.keyboard.press('End');
  const tip = chart.locator('.tip');
  await expect(tip).toBeVisible();
  const last = await tip.innerText();
  await page.keyboard.press('ArrowLeft');
  await expect(tip).not.toHaveText(last);
  // Each step is read out in full for screen readers.
  // …followed by any event going on that day (the example profile's morning runs).
  await expect(chart.locator('[aria-live]')).toHaveText(/^\w+day, \w+ \d+: \d+\.\d kg, trend \d+\.\d kg\. Morning runs$/);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft'); // stays on the first one
  await expect(chart.locator('[aria-live]')).toContainText(/\d+\.\d kg/);
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('"Show as table" lists the weigh-ins in the chosen range, and stays open', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chart-table summary').click();
  const rows = page.locator('#chartTable tbody tr');
  await page.locator('[data-range="30"]').click();
  const month = await rows.count();
  expect(month).toBeGreaterThan(5);
  await page.locator('[data-range="0"]').click();
  await expect(page.locator('.chart-table')).toHaveAttribute('open', '');
  expect(await rows.count()).toBeGreaterThan(month);
  await expect(rows.first().locator('td').nth(1)).toHaveText(/^\d+\.\d kg$/);
});
