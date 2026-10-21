import { expect, test, type Page } from './fixtures';

// The year in review: in the first two weeks of January, Overview sums up the year before,
// with a picture of that year to share. The example profile is generated up to "today", so
// on 5 January 2027 it covers the autumn of 2026.

const at = async (page: Page, iso: string) => { await page.clock.setFixedTime(new Date(iso + 'T09:00:00')); };

test('in early January, Overview sums up last year, shares it, and can be closed', async ({ page }) => {
  await at(page, '2027-01-05');
  await page.goto('/');
  const card = page.locator('.year');
  await expect(card.locator('h2')).toHaveText('2026 in review');
  await expect(card).toContainText('Trend change over the year');
  await expect(card).toContainText(/Best month: \w+/);
  await expect(card).toContainText(/\d+ days?\s*Longest streak/);

  // The picture covers 2026 only.
  await card.locator('[data-act=shareYear]').click();
  await expect(page.locator('#shareImg')).toBeVisible();
  await page.locator('#shareClose').click();

  await card.locator('[data-act=closeYear]').click();
  await expect(page.locator('.year')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#view .hero')).toBeVisible();
  await expect(page.locator('.year')).toHaveCount(0);
});

test('later in January, there is no year in review', async ({ page }) => {
  await at(page, '2027-01-20');
  await page.goto('/');
  await expect(page.locator('#view .hero')).toBeVisible();
  await expect(page.locator('.year')).toHaveCount(0);
});

test.describe('in Czech, dark, at 320 px', () => {
  test.use({ locale: 'cs-CZ', colorScheme: 'dark', viewport: { width: 320, height: 800 }, bypassCSP: true });
  test('the year in review passes the layout check', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one run is enough');
    await at(page, '2027-01-05');
    await page.goto('/');
    await expect(page.locator('.year h2')).toHaveText('Rok 2026 v kostce');
    await page.addScriptTag({ path: new URL('../scripts/visual-audit.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
    const found = await page.evaluate(() => (window as unknown as { tareAudit: (o: object) => Promise<Record<string, string[]>> }).tareAudit({ tabs: ['current'] }));
    expect(found.current).toEqual([]);
  });
});
