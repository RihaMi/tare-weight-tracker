import { readFileSync } from 'node:fs';
import { createProfile, expect, test } from './fixtures';

// Body fat, muscle and water from a smart scale.

test('the example shows body composition on Body and measured body fat on the BMI card', async ({ page }) => {
  await page.goto('/#body');
  const card = page.locator('#compositionCard');
  await expect(card.locator('.mcard .eyebrow')).toHaveText(['Body fat', 'Muscle', 'Body water']);
  await expect(card).toContainText(/Of the \d+\.\d\skg lost since \w+ \d+, about \d+\.\d\skg was fat/);
  await page.goto('/#overview');
  await expect(page.locator('.kv dt', { hasText: 'Body fat, from your scale' })).toHaveCount(1);
});

test('smart-scale values are logged with a weigh-in, kept when editing, and exported', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'Sam');
  for (const [date, kg, fat, muscle] of [['2026-10-01', '82', '26', '58'], ['2026-10-08', '81', '25.2', '58.1']]) {
    await page.locator('#logBtn').click();
    await page.locator('#eDate').fill(date);
    await page.locator('#eW').fill(kg);
    await page.locator('#eCompDetails summary').click();
    await page.locator('#cFat').fill(fat);
    await page.locator('#cMuscle').fill(muscle);
    await page.locator('#entryForm button[type=submit]').click();
    await expect(page.locator('#entryDlg')).toBeHidden();
  }
  await page.goto('/#body');
  await expect(page.locator('#compositionCard .mcard').first()).toContainText('since');
  // No measurements yet, so the measurements prompt is still there below.
  await expect(page.locator('.card.empty h2')).toHaveText('No measurements yet');

  await page.goto('/#history');
  await page.locator('.row[data-edit="2026-10-08"]').click();
  await expect(page.locator('#eCompDetails')).toHaveAttribute('open', '');
  await expect(page.locator('#cFat')).toHaveValue('25.2');
  await page.locator('#entryClose').click();

  await page.goto('/#profile');
  const download = page.waitForEvent('download');
  await page.locator('#csvDownload').click();
  const csv = readFileSync((await (await download).path())!, 'utf8');
  expect(csv.split('\n')[0]).toContain('body_fat_pct,muscle_kg,water_pct');
  expect(csv).toContain('2026-10-08,81,,,,,,,,25.2,58.1,');
});
