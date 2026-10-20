import type { AppData, Profile, Unit } from './data/schema';
import type { Store } from './data/storage';
import type { SampleText } from './data/sample';
import type { KeyInfo } from './lib/crypto';
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
  /** Applies the language setting to text, numbers and dates. */
  applyLanguage: () => void;
  /** Name and notes for the example profile, in the current language. */
  sampleText: () => SampleText;
  /** Encryption key from the PIN while unlocked; saves are encrypted with it. Null without a PIN. */
  key: KeyInfo | null;
  /** True after a save failed, until one works again; shows a banner. */
  saveFailed: boolean;
}

// Filled in by main.ts during start-up, before anything renders.
export const app = {} as AppState;

export const profile = (): Profile => app.data.profiles.find(p => p.id === app.data.activeId) ?? app.data.profiles[0];
/** The active profile's unit. */
export const unit = (): Unit => profile().unit;

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
