import { expect, test, type Page } from './fixtures';

// A new goal weight keeps the one it replaces; History lists them under "Your goals".

async function saveGoal(page: Page, kg: string | null, date?: string) {
  await page.goto('/#profile');
  if (kg != null) await page.locator('#pGoal').fill(kg);
  if (date) await page.locator('#pGoalDate').fill(date);
  await page.locator('#profForm button[type=submit]').click();
  await expect(page.locator('#toast')).toBeVisible();
}

test('changing the goal weight keeps the old one in History; moving only the date does not', async ({ page }) => {
  await page.goto('/#history');
  await expect(page.locator('#goalsCard')).toHaveCount(0);      // nothing replaced yet

  await saveGoal(page, '78');
  await saveGoal(page, null, '2027-06-30');                   // only the date
  await page.goto('/#history');
  const card = page.locator('#goalsCard');
  await expect(card.locator('h2')).toHaveText('Your goals');
  await expect(card.locator('li')).toHaveCount(2);
  await expect(card.locator('li').first()).toContainText(/→\s*78\.0\skg/);
  await expect(card.locator('li').first()).toContainText('Current goal');
  await expect(card.locator('li').nth(1)).toContainText(/92\.4\skg\s*→\s*80\.0\skg/);
  await expect(card.locator('li').nth(1)).toContainText(/\d+% of the way, then changed/);
});

test('the goal history survives a reload', async ({ page }) => {
  await saveGoal(page, '78');
  await page.reload();
  await page.goto('/#history');
  await expect(page.locator('#goalsCard li')).toHaveCount(2);
});
