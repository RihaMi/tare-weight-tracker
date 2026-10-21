import { expect, test } from './fixtures';

// History's weekly averages on small phones: the table fits its card in every unit, without
// scrolling sideways (the layout check allows a table that scrolls, so it's checked here),
// and the month headings keep the unit in lower case.

for (const width of [320, 375]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });
    test('the weekly averages fit in kg, lb and st', async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'one browser is enough; the width is set here');
      await page.goto('/#history');
      for (const u of ['kg', 'lb', 'st']) {
        await page.locator(`#unitSeg [data-unit=${u}]`).click();
        const table = page.locator('.week-table');
        await expect(table).toBeVisible();
        const [table_, wrap] = await table.evaluate(t => [t.scrollWidth, t.parentElement!.clientWidth]);
        expect(table_, `${u}: table ${table_} px in ${wrap} px`).toBeLessThanOrEqual(wrap);
      }
    });
  });
}

test('month headings show the unit as written, not in capitals', async ({ page }) => {
  await page.goto('/#history');
  const change = page.locator('.month h3 .mono').first();
  await expect(change).toHaveText(/kg$/);
  expect(await change.evaluate(el => (el as HTMLElement).innerText)).toMatch(/kg$/);
});
