import { profile, unit } from '../../app';
import type { Entry } from '../../data/schema';
import { calc, quality, type Quality } from '../../lib/calc';
import { fmtDate } from '../../lib/dates';
import { fmtDelta, fmtW } from '../../lib/units';
import { esc } from '../dom';
import { t, type Key } from '../../i18n';
import { milestonesCard, weeklyCard } from './insights';

let showAllWeeks = false;
export const toggleWeeks = (): void => { showAllWeeks = !showAllWeeks; };

const QUALITY_KEY: Record<Quality, Key> = { good: 'history.good', warn: 'history.warn', bad: 'history.bad', '': 'history.first' };
const qText = (q: Quality): string => t(QUALITY_KEY[q]);

export function historyView(): string {
  const r = calc(profile()), u = unit();
  if (!r.E.length) return `<section class="card empty"><h2>${t('history.empty')}</h2><button class="btn primary" data-act="log">${t('overview.logFirst')}</button></section>`;

  const rows = r.E.map((e, i) => ({ e, prev: r.E[i - 1] as Entry | undefined, q: quality(r.E[i - 1], e, r.planPerDay) })).reverse();
  const months: Array<{ key: string; items: typeof rows }> = [];
  for (const x of rows) {
    const key = x.e.date.slice(0, 7);
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, items: [] });
    months[months.length - 1].items.push(x);
  }

  const insights = weeklyCard(r, showAllWeeks) + milestonesCard(profile(), r);
  return `${insights ? `<div class="grid-2 even">${insights}</div>` : ''}<section class="card">
    <div class="card-head"><h2>${t('history.title')}</h2>
      <div class="key"><span><i class="dot good"></i>${qText('good')}</span><span><i class="dot warn"></i>${qText('warn')}</span><span><i class="dot bad"></i>${qText('bad')}</span></div></div>
    ${months.map(m => {
      const change = m.items[0].e.kg - m.items[m.items.length - 1].e.kg;
      return `<div class="month"><h3><span>${fmtDate(m.key + '-01', { month: 'long', year: 'numeric' })}</span><span class="mono">${m.items.length > 1 ? fmtDelta(change, u) : ''}</span></h3><div class="rows">
      ${m.items.map(({ e, prev, q }) => `<button type="button" class="row" data-edit="${e.date}">
        <span class="dot ${q}" title="${qText(q)}"></span>
        <span class="d">${fmtDate(e.date, { day: 'numeric', month: 'short' })}<small>${fmtDate(e.date, { weekday: 'long' })}</small></span>
        <span class="n">${e.note ? esc(e.note) : e.measures ? t('history.measuresLogged') : ''}</span>
        <span class="w">${fmtW(e.kg, u)}</span>
        <span class="c">${prev ? fmtDelta(e.kg - prev.kg, u) : t('history.start')}</span>
      </button>`).join('')}</div></div>`;
    }).join('')}
  </section>`;
}
