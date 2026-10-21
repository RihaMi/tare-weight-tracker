import { expect, test, type Page } from './fixtures';

// Behind the goal date: Overview shows the pace keeping the date now takes, and offers a
// realistic new date, which one tap sets (with Undo). "Not now" hides it for two weeks.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromToday = (n: number) => { const t = new Date(); return iso(new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate() + n))); };

/** 80 days of daily weigh-ins ending today, losing 0.25 kg a week from 90 kg; goal 80 kg in ten weeks. */
async function behindPace(page: Page) {
  const rows = Array.from({ length: 80 }, (_, i) => `${daysFromToday(i - 79)},${(90 - (0.25 / 7) * i).toFixed(2)}`);
  await page.goto('/#profile');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#csvImport').click();
  await (await chooser).setFiles({ name: 'slow.csv', mimeType: 'text/csv', buffer: Buffer.from('date,weight_kg\n' + rows.join('\n') + '\n') });
  await page.locator('#importGo').click();
  await page.goto('/#profile');
  await page.locator('#pGoal').fill('80');
  await page.locator('#pGoalDate').fill(daysFromToday(70));
  await page.locator('#profForm button[type=submit]').click();
  await page.goto('/#overview');
}

test('behind pace, the goal date can be moved to a realistic one, and back with Undo', async ({ page }) => {
  await behindPace(page);
  await expect(page.locator('.hero .pill')).toHaveText('Behind pace');
  const box = page.locator('.replan');
  await expect(box).toContainText(/Keeping that date now takes losing 0\.\d+\skg a week\./);
  await expect(box).toContainText(/At your recent pace of 0\.2\d?\skg a week, you would get there around/);

  await box.locator('[data-act=replan]').click();
  await expect(page.locator('#toast')).toContainText('Goal date moved to');
  await expect(page.locator('.replan')).toHaveCount(0);
  await expect(page.locator('.hero .pill')).not.toHaveText('Behind pace');

  await page.keyboard.press('Control+z');
  await expect(page.locator('.replan')).toBeVisible();
});

test('"Not now" hides it, and it stays hidden after a reload', async ({ page }) => {
  await behindPace(page);
  await page.locator('.replan [data-act=replanLater]').click();
  await expect(page.locator('.replan')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.hero .pill')).toHaveText('Behind pace');
  await expect(page.locator('.replan')).toHaveCount(0);
});

test('the example profile, on pace, shows no re-plan', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero .pill')).toBeVisible();
  await expect(page.locator('.replan')).toHaveCount(0);
});
