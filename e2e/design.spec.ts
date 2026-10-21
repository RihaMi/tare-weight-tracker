import { expect, test, type Page } from './fixtures';

// Layout choices the screenshots only check on Linux: what comes first on a phone, and
// figures with only their digits in the monospaced font.

const top = (page: Page, sel: string) => page.locator(sel).first().evaluate(el => el.getBoundingClientRect().top);

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'one browser is enough; the width is set here'));

  test('Calories shows the answer before the form, and the paces after it', async ({ page }) => {
    await page.goto('/#calories');
    await expect(page.locator('#calcResult .kcal')).toBeVisible();
    expect(await top(page, '#calcResult')).toBeLessThan(await top(page, '#calcForm'));
    expect(await top(page, '#calcPaces')).toBeGreaterThan(await top(page, '#calcForm'));
  });

  test('Overview keeps the calorie card last once the columns stack', async ({ page }) => {
    await page.goto('/#overview');
    await expect(page.locator('.last-when-stacked .card')).toContainText('kcal');
    const calories = await top(page, '.last-when-stacked .card');
    const others = await page.locator('#view .grid-2 .card').evaluateAll(cs => cs.filter(c => !c.closest('.last-when-stacked')).map(c => c.getBoundingClientRect().top));
    expect(calories).toBeGreaterThan(Math.max(...others));
  });
});

test('figures keep words and units out of the monospaced font', async ({ page }) => {
  await page.goto('/#overview');
  const reading = page.locator('.reading');
  await expect(reading.locator('.sep')).toHaveCount(1);              // the decimal point, drawn narrower
  await expect(reading.locator('.in-words')).toHaveText('kg');
  await expect(page.locator('.stat .v .in-words').first()).toBeVisible();
  const font = await page.locator('.stat .v .in-words').first().evaluate(el => getComputedStyle(el).fontFamily);
  expect(font).toContain('Figtree');
});
