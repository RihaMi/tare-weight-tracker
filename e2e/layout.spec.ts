import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Runs scripts/visual-audit.js on every screen: text cut off, covered or
// low-contrast, elements off the screen, sideways scrolling.

const audit = fileURLToPath(new URL('../scripts/visual-audit.js', import.meta.url));
const widths = [320, 414, 768, 1440];

for (const colorScheme of ['light', 'dark'] as const) {
  for (const locale of ['en-US', 'cs-CZ']) {
    test.describe(`${colorScheme}, ${locale}`, () => {
      test.use({ colorScheme, locale });
      for (const width of widths) {
        test(`${width}px wide`, async ({ page }, info) => {
          test.skip(info.project.name !== 'desktop', 'sizes are set per test; one browser is enough');
          await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
          await page.goto('/');
          await expect(page.locator('#view .card').first()).toBeVisible();
          await page.addScriptTag({ path: audit });
          const found = await page.evaluate(() => (window as unknown as { tareAudit: () => Promise<Record<string, string[]>> }).tareAudit());
          const problems = Object.entries(found).flatMap(([tab, list]) => list.map(i => `${tab}: ${i}`));
          expect(problems, problems.join('\n')).toEqual([]);
        });
      }
    });
  }
}

test('the audit catches a real problem (the BMI value hidden under its bar)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser is enough');
  await page.goto('/#overview');
  await expect(page.locator('.bmi-wrap')).toBeVisible();
  await page.addStyleTag({ content: '.bmi-wrap { padding-top: 0 !important }' });
  await page.addScriptTag({ path: audit });
  const found = await page.evaluate(() => (window as unknown as { tareAudit: (o: object) => Promise<Record<string, string[]>> }).tareAudit({ tabs: ['current'] }));
  expect(found.current.join('\n')).toMatch(/bmi/i);
});
