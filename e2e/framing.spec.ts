import { expect, test } from './fixtures';

// Tare never runs inside another site's frame (clickjacking): public/theme.js hides the page
// when framed, since GitHub Pages can't send a header that forbids framing.

// Chrome blocks one local address framing another (local network access checks); a real site
// framing the published app wouldn't meet that, so it's switched off here. Chrome-only flag.
test.skip(({ browserName }) => browserName !== 'chromium', "the flag below is Chrome's");
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

test("the app hides itself inside another site's frame", async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  // "Another site": a page on 127.0.0.1, a different origin from the app on localhost.
  await page.route('http://127.0.0.1:4173/framer', r => r.fulfill({ contentType: 'text/html', body: '<iframe src="http://localhost:4173/" width="600" height="400"></iframe>' }));
  await page.goto('http://127.0.0.1:4173/framer');
  await expect.poll(() => page.frames().map(f => f.url())).toContain('http://localhost:4173/');
  const app = page.frames().find(f => f.url() === 'http://localhost:4173/')!;
  await expect.poll(() => app.evaluate(() => getComputedStyle(document.documentElement).display)).toBe('none');
});

test('on its own, the app shows as usual', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  await page.goto('/');
  await expect(page.locator('#view .hero')).toBeVisible();
});
