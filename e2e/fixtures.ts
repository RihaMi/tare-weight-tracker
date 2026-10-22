import { test as base } from '@playwright/test';

// Shared setup for the browser tests. A real first visit opens the short setup;
// most tests are about the app itself, so they start as if the setup had been
// seen, on the example profile. Tests of the setup turn it back on with
// test.use({ firstVisitSetup: true }).
//
// Every test also starts on the same day, so a run on the 1st of a month or in January
// (when Overview adds the month recap or the year in review) behaves like any other.
// Time then runs on as normal; a test can still set its own day or fast-forward.

/** The day every test starts on, and the moment, in the browser's time zone. */
export const TODAY = '2026-10-20';
export const NOW = new Date(`${TODAY}T09:00:00`);

/** TODAY plus `days` (minus, for earlier), as YYYY-MM-DD. */
export function dayFromToday(days: number): string {
  const [y, m, d] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const test = base.extend<{ firstVisitSetup: boolean }>({
  firstVisitSetup: [false, { option: true }],
  page: async ({ page, firstVisitSetup }, use) => {
    await page.clock.install({ time: NOW });
    if (!firstVisitSetup) await page.addInitScript(() => { try { localStorage.setItem('tare.setupSeen', '1'); } catch { /* fine */ } });
    await use(page);
  },
});

export { expect, type Page } from '@playwright/test';

/** Creates a profile through the setup: a name, the other steps skipped. From the example's banner, or with `fromMenu` the header's profile menu. */
export async function createProfile(page: import('@playwright/test').Page, name: string, fromMenu = false): Promise<void> {
  if (fromMenu) await page.locator('#profileSel').selectOption('__new');
  else await page.locator('[data-act=newProfile]').first().click();
  const dlg = page.locator('#setupDlg');
  await dlg.locator('#suName').fill(name);
  await dlg.locator('button[type=submit]').click();   // Next
  await dlg.locator('#suSkip').click();               // About you
  await dlg.locator('#suSkip').click();               // Weight and goal
  await dlg.locator('button[type=submit]').click();   // Start fresh
  await page.locator('#setupDlg').waitFor({ state: 'hidden' });
}
