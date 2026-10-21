import { expect, test } from './fixtures';

// Goal steps: smaller goals on the way to the goal.

test('the example shows its steps on the ruler, the next one, and a step milestone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero .ruler-step')).toHaveCount(2);
  await expect(page.locator('.hero .ruler-step.done')).toHaveCount(1);
  await expect(page.locator('.hero .step-line')).toContainText(/Next step: 82\.0\skg, \d\.\d\skg to go · by \w+ \d+, \d\.\d\skg a week/);
  await page.goto('/#history');
  await expect(page.locator('.ms-list').first()).toContainText('Step reached: 85.0 kg');
});

test('steps can be suggested, edited and removed on Profile & goal', async ({ page }) => {
  await page.goto('/#profile');
  await page.locator('#suggestStepsBtn').click();
  // Every 5 kg between the first weigh-in (92.4 kg) and the 80 kg goal.
  await expect(page.locator('#stepRows .step-kg')).toHaveCount(2);
  expect(await page.locator('#stepRows .step-kg').evaluateAll(els => els.map(e => (e as HTMLInputElement).value))).toEqual(['90.0', '85.0']);
  await page.locator('#addStep').click();
  await page.locator('#stepRows .step-row').last().locator('.step-kg').fill('82');
  await page.locator('#stepRows .step-row').last().locator('.step-date').fill('2027-01-15');
  // Remove the 90 kg one.
  await page.locator('#stepRows .step-row').first().locator('.step-remove').click();
  await page.locator('#profForm button[type=submit]').click();
  await expect(page.locator('#toast')).toContainText('Profile saved');

  await page.reload();
  expect(await page.locator('#stepRows .step-kg').evaluateAll(els => els.map(e => (e as HTMLInputElement).value))).toEqual(['85.0', '82.0']);
  await page.goto('/#overview');
  await expect(page.locator('.hero .ruler-step')).toHaveCount(2);
  await expect(page.locator('.hero .step-line')).toContainText('by Jan 15');
});
