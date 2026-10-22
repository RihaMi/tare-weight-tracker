import { readFileSync } from 'node:fs';
import { createProfile, expect, test, type Page } from './fixtures';

// Weighing in weekly: quick log and the reminder only ask on the chosen day, the calendar
// file repeats weekly, and This week shows the next weigh-in instead of a daily streak.
// Every test starts on Tuesday 20 October 2026 (fixtures.ts).

async function weeklyOn(page: Page, day: string) {
  await page.goto('/#profile');
  await page.locator('#rhythm').selectOption(day);
  await expect(page.locator('#toast')).toContainText('Weigh-in rhythm saved');
}

/** A profile of one's own (quick log skips the example) with a weigh-in yesterday, not today. */
async function ownProfile(page: Page) {
  await page.goto('/');
  await createProfile(page, 'Sam');
  await page.locator('#logBtn').click();
  await page.locator('#eDate').fill('2026-10-19');
  await page.locator('#eW').fill('80');
  await page.locator('#entryForm button[type=submit]').click();
  await expect(page.locator('#entryDlg')).toBeHidden();
}

test('weekly on another day: no quick log and no reminder today, and This week shows the next weigh-in', async ({ page }) => {
  await ownProfile(page);
  await weeklyOn(page, '4');                                 // Fridays
  await page.locator('#remOn').check();
  await page.locator('#remTime').fill('00:00');              // past already, so a due weigh-in would show the reminder
  await page.locator('#remTime').dispatchEvent('change');
  await page.goto('/#overview');
  await page.reload();
  await expect(page.locator('#view .hero')).toBeVisible();
  await expect(page.locator('#entryDlg')).toBeHidden();      // no quick log on a Tuesday
  await expect(page.locator('.banner.remind')).toHaveCount(0);
  await expect(page.locator('#view')).toContainText(/Fri, Oct 23\s*Next weigh-in/);
});

test('weekly on today: quick log opens and the reminder shows, as they would daily', async ({ page }) => {
  await ownProfile(page);
  await weeklyOn(page, '1');                                 // Tuesdays: today
  await page.locator('#remOn').check();
  await page.locator('#remTime').fill('00:00');
  await page.locator('#remTime').dispatchEvent('change');
  await page.evaluate(() => localStorage.removeItem('tare.quickLogDay'));
  await page.goto('/#overview');
  await page.reload();
  await expect(page.locator('#entryDlg')).toBeVisible();
  await page.locator('#entryCancel').click();
  await expect(page.locator('.banner.remind')).toBeVisible();
  await expect(page.locator('#view')).toContainText(/Today\s*Next weigh-in/);
});

test('the calendar file repeats weekly on the chosen day', async ({ page }) => {
  await weeklyOn(page, '6');                                 // Sundays
  const download = page.waitForEvent('download');
  await page.locator('#remIcs').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('tare-weekly-reminder.ics');
  const ics = readFileSync((await file.path())!, 'utf8');
  expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU');
  expect(ics).toMatch(/DTSTART:20261025T/);                  // the first Sunday from today
});
