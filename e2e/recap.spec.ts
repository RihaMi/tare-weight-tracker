import { expect, test, type Page } from './fixtures';

// The month recap: in the first week of a month, Overview sums up the month before.
// The example profile is generated up to "today", so with the clock on 3 November it
// has the whole of October.

const at = async (page: Page, iso: string) => { await page.clock.setFixedTime(new Date(iso + 'T09:00:00')); };

test('in the first week of November, Overview sums up October, until closed', async ({ page }) => {
  await at(page, '2026-11-03');
  await page.goto('/');
  const card = page.locator('.recap');
  await expect(card.locator('h2')).toHaveText('October in review');
  await expect(card).toContainText('Trend change');
  await expect(card).toContainText(/\d+ of 31/);
  await expect(card).toContainText(/Best week, from Oct \d+/);

  await card.locator('[data-act=closeRecap]').click();
  await expect(page.locator('.recap')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#view .hero')).toBeVisible();
  await expect(page.locator('.recap')).toHaveCount(0);
});

test('after the first week, there is no recap', async ({ page }) => {
  await at(page, '2026-11-10');
  await page.goto('/');
  await expect(page.locator('#view .hero')).toBeVisible();
  await expect(page.locator('.recap')).toHaveCount(0);
});

test.describe('in Czech, dark, at 320 px', () => {
  test.use({ locale: 'cs-CZ', colorScheme: 'dark', viewport: { width: 320, height: 800 }, bypassCSP: true });
  test('the recap passes the layout check', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one run is enough');
    await at(page, '2026-11-03');
    await page.goto('/');
    await expect(page.locator('.recap h2')).toHaveText('Shrnutí: říjen');
    await page.addScriptTag({ path: new URL('../scripts/visual-audit.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
    const found = await page.evaluate(() => (window as unknown as { tareAudit: (o: object) => Promise<Record<string, string[]>> }).tareAudit({ tabs: ['current'] }));
    expect(found.current).toEqual([]);
  });
});
