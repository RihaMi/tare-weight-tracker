import type { Lang } from '../data/schema';
import { setFormatLocale } from '../lib/format';
import { cs } from './cs';
import { en, type Key, type Plural } from './en';

export type { Key };
export type Resolved = 'en' | 'cs';

const DICTS: Record<Resolved, Record<Key, string | Plural>> = { en, cs };

let current: Resolved = 'en';

/** The language the browser prefers, if we have it; otherwise English. */
export function detectLang(langs: readonly string[] = navigator.languages ?? [navigator.language]): Resolved {
  for (const l of langs) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'cs' || base === 'sk') return 'cs'; // Slovak readers understand Czech better than English
    if (base === 'en') return 'en';
  }
  return 'en';
}

export const resolveLang = (setting: Lang): Resolved => (setting === 'auto' ? detectLang() : setting);

/** Switches language, number and date formats. */
export function setLang(lang: Resolved): void {
  current = lang;
  const enLocale = (navigator.languages ?? []).find(l => l.toLowerCase().startsWith('en')) ?? 'en-GB';
  setFormatLocale(lang === 'cs' ? 'cs-CZ' : enLocale);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
export const lang = (): Resolved => current;

type Params = Record<string, string | number>;
const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m)) : s);

/** Translated text for `key`, with {placeholders} filled in. */
export function t(key: Key, params?: Params): string {
  const m = DICTS[current][key] ?? en[key];
  return fill(typeof m === 'string' ? m : m.other, params);
}

const rules = new Map<string, Intl.PluralRules>();
/** Translated text that depends on a count, e.g. "1 day" / "2 days" / Czech "2 dny" / "5 dní". */
export function tn(key: Key, n: number, params?: Params): string {
  const m = DICTS[current][key] ?? en[key];
  if (typeof m === 'string') return fill(m, { n, ...params });
  let r = rules.get(current);
  if (!r) { r = new Intl.PluralRules(current); rules.set(current, r); }
  const cat = r.select(n) as keyof Plural;
  return fill(m[cat] ?? m.other, { n, ...params });
}

/** Fills elements marked with data-i18n (text) and data-i18n-attr ("attr:key; attr:key") in static HTML. */
export function translateStatic(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach(el => {
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (attr && key) el.setAttribute(attr, t(key as Key));
    }
  });
  document.title = t('app.title');
}
