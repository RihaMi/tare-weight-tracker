import { expect, test } from './fixtures';

// The app manifest: its identity, and the install dialog's screenshots, which must exist at the sizes it states.

test('the manifest has an id and categories, and its screenshots match their sizes', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  await page.goto('/');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url());
  const m = await (await request.get(manifestUrl.href)).json();
  expect(m).toMatchObject({ id: './', lang: 'en', categories: expect.arrayContaining(['health']) });
  expect(m.screenshots.map((s: { form_factor: string }) => s.form_factor)).toEqual(expect.arrayContaining(['narrow', 'wide']));
  for (const s of m.screenshots) {
    const res = await request.get(new URL(s.src, manifestUrl).href);
    expect(res.ok(), s.src).toBe(true);
    const png = await res.body();
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, s.src).toBe(s.sizes);
  }
});
