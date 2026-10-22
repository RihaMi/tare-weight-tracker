import { expect, test } from './fixtures';

// Pressing N opens the log form; History's notes can be searched.

test('N opens the log form, but not while typing, with a modifier, or with a dialog open', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'a keyboard shortcut');
  await page.goto('/');
  await expect(page.locator('#logBtn')).toHaveAttribute('aria-keyshortcuts', 'N');
  await page.keyboard.press('Control+n').catch(() => {}); // the browser may take it; the app must not
  await expect(page.locator('#entryDlg')).toBeHidden();

  await page.keyboard.press('n');
  await expect(page.locator('#entryDlg')).toBeVisible();
  // Typing an "n" in the note is just text.
  await page.locator('#eNote').fill('');
  await page.locator('#eNote').press('n');
  await expect(page.locator('#eNote')).toHaveValue('n');
  await page.locator('#entryCancel').click();
  await expect(page.locator('#entryDlg')).toBeHidden();
});

test('History finds weigh-ins by their note, and says when none match', async ({ page }) => {
  await page.goto('/#history');
  const search = page.locator('#noteSearch');
  const shown = page.locator('#allWeighIns .row:visible');
  const all = await shown.count();

  await search.fill('jeans');
  await expect(shown).toHaveCount(1);
  await expect(shown.first()).toContainText('Jeans fit loose now');
  await expect(page.locator('#allWeighIns .month:visible')).toHaveCount(1);

  await search.fill('quinoa');
  await expect(shown).toHaveCount(0);
  await expect(page.locator('#noteNone')).toHaveText('No weigh-ins with “quinoa” in the note.');

  await search.fill('');
  await expect(shown).toHaveCount(all);
  await expect(page.locator('#noteNone')).toBeHidden();
});

test.describe('in Czech', () => {
  test.use({ locale: 'cs-CZ' });
  test('the search ignores accents and case', async ({ page }) => {
    await page.goto('/#history');
    await page.locator('#noteSearch').fill('NAROZENINOVA');
    await expect(page.locator('#allWeighIns .row:visible')).toHaveCount(1);
    await expect(page.locator('#allWeighIns .row:visible')).toContainText('Narozeninová večeře');
  });
});
