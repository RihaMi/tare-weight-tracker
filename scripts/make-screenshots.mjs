// Takes the screenshots shown in the install dialog (the manifest's `screenshots`), from the
// example data on a fixed day. Run `npm run build` first, then `npm run screenshots`;
// output goes to public/screenshots/. Retake them when the screens change noticeably.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4174;
const OUT = 'public/screenshots';
const SHOTS = [
  { name: 'phone-overview', tab: 'overview', viewport: { width: 412, height: 839 }, isMobile: true },
  { name: 'phone-history', tab: 'history', viewport: { width: 412, height: 839 }, isMobile: true },
  { name: 'wide-overview', tab: 'overview', viewport: { width: 1280, height: 800 }, isMobile: false },
];

mkdirSync(OUT, { recursive: true });
const server = spawn(`npx vite preview --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' });
try {
  await waitFor(`http://localhost:${PORT}`);
  const browser = await chromium.launch();
  for (const s of SHOTS) {
    const page = await browser.newPage({ viewport: s.viewport, isMobile: s.isMobile, hasTouch: s.isMobile, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'light', bypassCSP: true });
    await page.addInitScript(() => localStorage.setItem('tare.setupSeen', '1'));
    await page.clock.setFixedTime(new Date('2026-10-20T09:00:00'));
    await page.goto(`http://localhost:${PORT}/#${s.tab}`);
    await page.locator('#view .card').first().waitFor();
    await page.addStyleTag({ content: '#view > .banner { display: none !important; }' }); // the "example data" banner
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('show'), null, { timeout: 8000 });
    await page.screenshot({ path: `${OUT}/${s.name}.png`, animations: 'disabled', caret: 'hide' });
    console.log(`${OUT}/${s.name}.png`);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
process.exit(0);

async function waitFor(url) {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`${url} didn't start; run npm run build first`);
}
