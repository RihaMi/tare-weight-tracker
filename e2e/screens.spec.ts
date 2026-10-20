import { expect, test, type Page } from '@playwright/test';

// Screenshot comparison of each screen, to catch visual changes the layout
// check can't (a colour, spacing or chart change). Fonts render differently on
// each operating system, so the reference images are made on Linux by the
// "Update screenshots" workflow and compared only there (see README).

test.skip(process.platform !== 'linux', 'reference screenshots are made and compared on Linux');

// Same day every run, so the example data, dates and "today" look the same.
const FIXED_NOW = new Date('2026-10-20T09:00:00');

async function show(page: Page, path: string) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 6000 });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#view .card').first()).toBeVisible();
}

const shot = { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.005 } as const;
/** Whole page on desktop. On the phone, the visible screen: a full-page shot would draw the fixed tab bar in the middle of the page. */
const opts = (project: string) => ({ ...shot, fullPage: project !== 'phone' });

for (const tab of ['overview', 'history', 'body', 'calories', 'profile']) {
  test(`${tab}`, async ({ page }, info) => {
    test.skip(info.project.name === 'phone' && !['overview', 'history'].includes(tab), 'phone: the two main screens are enough');
    await show(page, '/#' + tab);
    await expect(page).toHaveScreenshot(`${tab}.png`, opts(info.project.name));
  });
}

test.describe('dark', () => {
  test.use({ colorScheme: 'dark' });
  test('overview', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one size is enough for dark');
    await show(page, '/#overview');
    await expect(page).toHaveScreenshot('overview-dark.png', opts(info.project.name));
  });
});
