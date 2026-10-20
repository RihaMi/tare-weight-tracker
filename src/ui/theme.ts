import type { Theme } from '../data/schema';

// Light / dark appearance. 'auto' leaves it to the device (prefers-color-scheme);
// 'light' and 'dark' set data-theme on <html>, which the stylesheet checks.

/** Also read by public/theme.js, so the right theme shows before the app loads. */
export const THEME_KEY = 'tare.theme';
const PAGE_BG = { light: '#EDF0EF', dark: '#0B100F' } as const;

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  // The browser's own bars (address bar, phone status bar) match the page.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => {
    const scheme = m.media.includes('dark') ? 'dark' : 'light';
    m.content = PAGE_BG[theme === 'auto' ? scheme : theme];
  });
  try {
    if (theme === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch { /* the saved setting still applies once the app has loaded */ }
}
