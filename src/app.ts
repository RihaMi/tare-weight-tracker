import type { AppData, Profile, Unit } from './data/schema';
import type { Store } from './data/storage';
import { toast } from './ui/dom';

export const TABS = ['overview', 'history', 'body', 'calories', 'profile'] as const;
export type Tab = (typeof TABS)[number];
export const isTab = (s: string): s is Tab => (TABS as readonly string[]).includes(s);

interface AppState {
  data: AppData;
  store: Store;
  tab: Tab;
  chartRange: number; // days; 0 = all
  persist: (d: AppData) => Promise<void>;
  render: () => void;
}

// Filled in by main.ts during start-up, before anything renders.
export const app = {} as AppState;

export const profile = (): Profile => app.data.profiles.find(p => p.id === app.data.activeId) ?? app.data.profiles[0];
export const unit = (): Unit => app.data.unit;

/** Saves, re-renders, and optionally confirms with a toast. Call after every change to app.data. */
export function commit(message?: string): void {
  void app.persist(app.data);
  app.render();
  if (message) toast(message);
}

export function go(tab: Tab): void {
  if (location.hash.slice(1) !== tab) history.pushState(null, '', '#' + tab);
  app.tab = tab;
  app.render();
  window.scrollTo(0, 0);
}
