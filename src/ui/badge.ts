import { app, profile } from '../app';
import { calc } from '../lib/calc';
import { todayISO } from '../lib/dates';
import { disp } from '../lib/units';

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export const badgeSupported = (): boolean => typeof (navigator as BadgeNavigator).setAppBadge === 'function';

/**
 * Updates the installed app's icon badge: the weight left to the goal (whole
 * kg or lb, as the original app did), or a dot until today's weigh-in.
 */
export function updateBadge(): void {
  const nav = navigator as BadgeNavigator;
  if (!badgeSupported()) return;
  const mode = app.data.settings.badge;
  const clear = () => void nav.clearAppBadge?.().catch(() => {});
  if (mode === 'off' || app.data.settings.pin) { clear(); return; } // a locked app shouldn't hint at its data
  const p = profile(), r = calc(p);
  if (mode === 'remaining') {
    if (!r.hasGoal || r.reached || r.remaining == null) { clear(); return; }
    const n = Math.round(Math.abs(disp(r.remaining, app.data.unit)));
    if (n > 0) void nav.setAppBadge!(n).catch(() => {}); else clear();
    return;
  }
  if (p.entries.some(e => e.date === todayISO())) clear();
  else void nav.setAppBadge!().catch(() => {});
}
