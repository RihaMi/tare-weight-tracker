import { expect, test, type Page } from './fixtures';

// After the goal: staying in the range around it.

/** A CSV of daily weigh-ins ending today: down from 90 to 80 kg, then `after` for the remaining days. */
function history(total: number, after: (daysAfter: number) => number): string {
  const today = new Date();
  const rows = Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - (total - 1 - i)));
    const kg = i <= 50 ? 90 - i * 0.2 : after(i - 50);
    return `${d.toISOString().slice(0, 10)},${kg.toFixed(1)}`;
  });
  return 'date,weight_kg\n' + rows.join('\n') + '\n';
}

async function importWithGoal(page: Page, csv: string) {
  await page.goto('/#profile');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#csvImport').click();
  await (await chooser).setFiles({ name: 'journey.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.locator('#importGo').click();
  await page.goto('/#profile');
  await page.locator('#pGoal').fill('80');
  await page.locator('#profForm button[type=submit]').click();
  await page.goto('/#overview');
}

test('staying at the goal shows the range, the days in it, and time-at-goal milestones', async ({ page }) => {
  await importWithGoal(page, history(110, () => 80.2));
  await expect(page.locator('.hero .pill')).toHaveText('Maintaining');
  await expect(page.locator('.hero')).toContainText('staying at your goal of 80.0 kg');
  await expect(page.locator('.maint-range')).toContainText(/in your range for \d+ days/);
  await page.goto('/#history');
  await expect(page.locator('.ms-list').first()).toContainText('4 weeks at your goal');
});

test('drifting above the range is pointed out calmly', async ({ page }) => {
  await importWithGoal(page, history(110, d => (d < 40 ? 80 : 83.5)));
  await expect(page.locator('.hero .pill')).toHaveText('Outside your range');
  await expect(page.locator('.maint-range')).toContainText(/above your range\. A few steady weeks usually bring it back/);
});
