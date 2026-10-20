import { expect, test } from './fixtures';

// Printing a screen (or saving it as a PDF): light colours even in dark mode, no controls,
// and the same layout check as on screen. A4 is about 794 px wide.

test.use({ colorScheme: 'dark', viewport: { width: 794, height: 1123 }, bypassCSP: true });

for (const tab of ['overview', 'history']) {
  test(`${tab} prints in light colours, without the controls`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one run is enough');
    await page.goto(`/#${tab}`);
    await expect(page.locator('.card').first()).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    for (const hidden of ['#logBtn', '.tabs', '#unitSeg']) await expect(page.locator(hidden)).toBeHidden();
    await expect(page.locator('#profileSel')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('.card').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');

    await page.addScriptTag({ path: new URL('../scripts/visual-audit.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
    const found = await page.evaluate(() => (window as unknown as { tareAudit: (o: object) => Promise<Record<string, string[]>> }).tareAudit({ tabs: ['current'] }));
    expect(found.current).toEqual([]);
  });
}
