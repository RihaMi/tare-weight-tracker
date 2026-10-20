import { createProfile, expect, test, type Page } from './fixtures';

// Deletes can be undone for a few seconds, with the Undo button or Ctrl+Z.

const toast = (page: Page) => page.locator('#toast');

async function ready(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(toast(page)).not.toHaveClass(/show/, { timeout: 6000 });
}

async function deleteFirstWeighIn(page: Page): Promise<string> {
  const row = page.locator('.row').first();
  const date = (await row.getAttribute('data-edit'))!;
  await row.click();
  await page.locator('#eDelete').click();
  await page.locator('#eDelete').click(); // the second click confirms
  await expect(toast(page)).toContainText('Weigh-in deleted');
  await expect(page.locator(`.row[data-edit="${date}"]`)).toHaveCount(0);
  return date;
}

test('a deleted weigh-in comes back with Undo', async ({ page }) => {
  await ready(page, '/#history');
  const date = await deleteFirstWeighIn(page);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toast(page)).toContainText('Restored');
  await expect(page.locator(`.row[data-edit="${date}"]`)).toHaveCount(1);
  await page.reload();
  await expect(page.locator(`.row[data-edit="${date}"]`)).toHaveCount(1);
});

test('Ctrl+Z undoes too, but only while the message shows', async ({ page }) => {
  await ready(page, '/#history');
  const first = await deleteFirstWeighIn(page);
  await page.keyboard.press('Control+z');
  await expect(page.locator(`.row[data-edit="${first}"]`)).toHaveCount(1);
  await expect(toast(page)).toContainText('Restored');
  await expect(toast(page)).not.toHaveClass(/show/, { timeout: 6000 });

  const second = await deleteFirstWeighIn(page);
  await expect(toast(page)).not.toHaveClass(/show/, { timeout: 8000 });
  await page.keyboard.press('Control+z');
  await expect(page.locator(`.row[data-edit="${second}"]`)).toHaveCount(0);
});

test('removing the example profile can be undone', async ({ page }) => {
  await ready(page, '/');
  await page.locator('[data-act=clearSample]').click();
  await expect(page.locator('#profileSel option:not([value=__new])')).toHaveCount(1);
  await expect(page.locator('#profileSel')).not.toContainText('example');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#profileSel option:checked')).toContainText('example');
  // The empty profile made to replace it is gone again.
  await expect(page.locator('#profileSel option:not([value=__new])')).toHaveCount(1);
});

test('a deleted profile comes back with Undo, and is selected again', async ({ page }) => {
  await ready(page, '/');
  await createProfile(page, 'First');            // replaces the example
  await createProfile(page, 'Second', true);
  await page.goto('/#profile');
  await expect(page.locator('#profileSel option:not([value=__new])')).toHaveCount(2);
  await page.locator('#delProfile').click();
  await page.locator('#delProfile').click();
  await expect(page.locator('#profileSel option:not([value=__new])')).toHaveCount(1);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#profileSel option:not([value=__new])')).toHaveCount(2);
  await expect(page.locator('#profileSel option:checked')).toHaveText('Second');
});
