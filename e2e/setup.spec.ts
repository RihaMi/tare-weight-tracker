import { expect, test } from './fixtures';

// The short setup on a first visit.

test.use({ firstVisitSetup: true });

test('a first visit offers the setup; "Just look around first" keeps the example', async ({ page }) => {
  await page.goto('/');
  const dlg = page.locator('#setupDlg');
  await expect(dlg.locator('#setupTitle')).toHaveText('Welcome to Tare');
  await dlg.getByRole('button', { name: 'Just look around first' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#profileSel')).toContainText('example');
  await page.reload();
  await expect(page.locator('#view .card').first()).toBeVisible();
  await expect(page.locator('#setupDlg')).toBeHidden(); // only offered once
});

test('the whole setup in pounds, with a suggested goal, replaces the example', async ({ page }) => {
  await page.goto('/');
  const dlg = page.locator('#setupDlg');
  await dlg.locator('#suName').fill('Petra');
  await dlg.locator('[data-su-unit=lb]').click();
  await dlg.locator('button[type=submit]').click();
  await expect(dlg.locator('#setupTitle')).toHaveText('About you');
  await dlg.locator('#suYear').fill('1990');
  await dlg.locator('#suFt').fill('5');
  await dlg.locator('#suIn').fill('6');
  await dlg.locator('button[type=submit]').click();
  await expect(dlg.locator('#setupTitle')).toHaveText('Your weight and goal');
  await dlg.locator('#suW').fill('165');
  await dlg.locator('#suSuggest').click();
  await expect(dlg.locator('#suSuggestNote')).toContainText('weeks');
  const goal = Number(await dlg.locator('#suGoal').inputValue());
  expect(goal).toBeGreaterThan(110);
  expect(goal).toBeLessThan(165);
  // Back keeps what was typed.
  await dlg.locator('#suBack').click();
  await expect(dlg.locator('#suYear')).toHaveValue('1990');
  await dlg.locator('button[type=submit]').click();
  await expect(dlg.locator('#suW')).toHaveValue('165.0');
  await dlg.locator('button[type=submit]').click();
  await expect(dlg.locator('#setupTitle')).toHaveText('Bring your history?');
  await dlg.getByRole('button', { name: 'Start fresh' }).click();

  await expect(dlg).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Welcome, Petra');
  await expect(page.locator('#profileSel option:not([value=__new])')).toHaveText(['Petra']);
  await expect(page.locator('#unitSeg [data-unit=lb]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.hero .reading')).toContainText('165.0');
  await expect(page.locator('.hero')).toContainText('Goal');
});

test('the language can be chosen in the first step', async ({ page }) => {
  await page.goto('/');
  const dlg = page.locator('#setupDlg');
  await dlg.locator('#suLang').selectOption('cs');
  await expect(dlg.locator('#setupTitle')).toHaveText('Vítejte v aplikaci Tare');
  await expect(page.locator('.tabs [data-tab=overview]')).toHaveText('Přehled');
});

test('importing from the last step opens the file picker', async ({ page }) => {
  await page.goto('/');
  const dlg = page.locator('#setupDlg');
  await dlg.locator('button[type=submit]').click();
  await dlg.locator('#suSkip').click();
  await dlg.locator('#suSkip').click();
  const chooser = page.waitForEvent('filechooser');
  await dlg.locator('#suImport').click();
  await chooser;
  await expect(page).toHaveURL(/#profile$/);
});
