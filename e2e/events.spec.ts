import { expect, test, type Page } from './fixtures';

// Events (medication, a holiday…) marked on the chart and listed on History.

async function ready(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 6000 });
}

test('the example profile shows its events on the chart and in History', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-range="0"]').click();
  await expect(page.locator('#chartBox .ev')).toHaveCount(2);
  await expect(page.locator('#chartBox .ev-t')).toHaveText(['Weekend away', 'Morning runs']);
  await page.goto('/#history');
  await expect(page.locator('#eventsCard li b')).toHaveText(['Morning runs', 'Weekend away']);
  await expect(page.locator('#eventsCard li').first()).toContainText(/Trend since: [−+±]\d\.\d\d kg a week/);
});

test('an event can be added, edited, and deleted with Undo', async ({ page }) => {
  await ready(page, '/');
  await page.locator('#view [data-act=addEvent]').first().click();
  const dlg = page.locator('#eventDlg');
  // A description is needed.
  await dlg.locator('button[type=submit]').click();
  await expect(dlg.locator('#evError')).toBeVisible();
  await dlg.locator('#evKind').selectOption('medication');
  await dlg.locator('#evLabel').fill('Started medication');
  const start = await page.evaluate(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  await dlg.locator('#evStart').fill(start);
  await dlg.locator('button[type=submit]').click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Event saved');
  await page.locator('[data-range="0"]').click();
  await expect(page.locator('#chartBox .ev')).toHaveCount(3);

  await page.goto('/#history');
  const item = page.locator('#eventsCard li', { hasText: 'Started medication' });
  await expect(item).toContainText('Medication · since');
  await item.getByRole('button', { name: 'Edit Started medication' }).click();
  await dlg.locator('#evLabel').fill('Started Wegovy');
  await dlg.locator('button[type=submit]').click();
  await expect(page.locator('#eventsCard li b').first()).toHaveText('Started Wegovy');

  await page.reload();
  await expect(page.locator('#eventsCard li b').first()).toHaveText('Started Wegovy');
  await page.locator('#eventsCard').getByRole('button', { name: 'Edit Started Wegovy' }).click();
  await dlg.locator('#evDelete').click();
  await dlg.locator('#evDelete').click(); // the second click confirms
  await expect(page.locator('#eventsCard li', { hasText: 'Started Wegovy' })).toHaveCount(0);
  await page.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#eventsCard li', { hasText: 'Started Wegovy' })).toHaveCount(1);
});

test('an end before the start is refused', async ({ page }) => {
  await ready(page, '/#history');
  await page.locator('#eventsCard [data-act=addEvent]').click();
  const dlg = page.locator('#eventDlg');
  await dlg.locator('#evLabel').fill('Holiday');
  await dlg.locator('#evStart').fill('2026-08-10');
  await dlg.locator('#evEnd').fill('2026-08-01');
  await dlg.locator('button[type=submit]').click();
  await expect(dlg.locator('#evError')).toContainText("can't be before the start");
});
