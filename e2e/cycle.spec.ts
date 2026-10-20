import { createProfile, expect, test, type Page } from './fixtures';

// Cycle-aware weigh-ins: off by default, offered for female profiles.

async function log(page: Page, date: string, kg: string, periodStarted = false) {
  await page.locator('#logBtn').click();
  await page.locator('#eDate').fill(date);
  await page.locator('#eW').fill(kg);
  if (periodStarted) await page.locator('#ePeriod').check();
  await page.locator('#entryForm button[type=submit]').click();
  await expect(page.locator('#entryDlg')).toBeHidden();
}

test('is not offered for the (male) example profile, and the entry form has no period box', async ({ page }) => {
  await page.goto('/#profile');
  await expect(page.locator('#pCycle')).toHaveCount(0);
  await page.locator('#logBtn').click();
  await expect(page.locator('#ePeriodWrap')).toBeHidden();
});

test('marks days around a period on the chart and in History, and leaves them out of patterns', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'Eva'); // the setup's default is female
  await page.goto('/#profile');
  await expect(page.locator('#pCycle')).not.toBeChecked();
  await page.locator('#pCycle').check();
  await page.locator('#profForm button[type=submit]').click();
  await expect(page.locator('.cycle-edit')).toContainText('No period start logged yet.');

  await log(page, '2026-09-01', '64.0');
  await log(page, '2026-09-05', '63.8');
  await log(page, '2026-09-10', '65.1', true);
  await log(page, '2026-09-15', '63.5');

  await page.goto('/#overview');
  await page.locator('[data-range="0"]').click();
  await expect(page.locator('#chartBox rect.cycle')).not.toHaveCount(0);
  await page.goto('/#history');
  await expect(page.locator('.row[data-edit="2026-09-10"] .n')).toHaveText('Around your period');
  await expect(page.locator('.row[data-edit="2026-09-15"] .n')).toHaveText('');
  await expect(page.locator('#view')).toContainText('Days around your period are left out');
  // Editing that weigh-in shows the box ticked.
  await page.locator('.row[data-edit="2026-09-10"]').click();
  await expect(page.locator('#ePeriod')).toBeChecked();
  await page.locator('#entryClose').click();
  await page.goto('/#profile');
  await expect(page.locator('.cycle-edit')).toContainText('1 period start logged.');
});
