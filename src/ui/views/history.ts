import { profile, unit } from '../../app';
import type { Entry } from '../../data/schema';
import { calc, quality, type Quality } from '../../lib/calc';
import { fmtDate } from '../../lib/dates';
import { fmtDelta, fmtW } from '../../lib/units';
import { $, esc } from '../dom';
import { t, type Key } from '../../i18n';
import { goalsCard, milestonesCard, patternsCard, weeklyCard } from './insights';
import { eventsCard } from './events';

let showAllWeeks = false;
export const toggleWeeks = (): void => { showAllWeeks = !showAllWeeks; };

const QUALITY_KEY: Record<Quality, Key> = { good: 'history.good', warn: 'history.warn', bad: 'history.bad', '': 'history.first' };
const qText = (q: Quality): string => t(QUALITY_KEY[q]);

/** The notes search, kept while History redraws. */
let noteQuery = '';
/** Lower case without accents, so "kolo" finds "Kolo" and "zima" finds "Zíma". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

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

  const insights = weeklyCard(r, showAllWeeks) + '<div class="col">' + milestonesCard(profile(), r) + goalsCard(profile(), r) + eventsCard(profile(), r) + patternsCard(r) + '</div>';
  const hasNotes = r.E.some(e => e.note);
  return `${insights ? `<div class="grid-2 even">${insights}</div>` : ''}<section class="card" id="allWeighIns">
    <div class="card-head"><h2>${t('history.title')}</h2>
      <div class="key"><span><i class="dot good"></i>${qText('good')}</span><span><i class="dot warn"></i>${qText('warn')}</span><span><i class="dot bad"></i>${qText('bad')}</span></div></div>
    ${hasNotes ? `<input type="search" id="noteSearch" class="note-search" placeholder="${esc(t('history.searchNotes'))}" aria-label="${esc(t('history.searchNotes'))}" value="${esc(noteQuery)}"><p class="note" id="noteNone" role="status" hidden></p>` : ''}
    ${months.map(m => {
      const change = m.items[0].e.kg - m.items[m.items.length - 1].e.kg;
      return `<div class="month"><h3><span>${fmtDate(m.key + '-01', { month: 'long', year: 'numeric' })}</span><span class="mono">${m.items.length > 1 ? fmtDelta(change, u) : ''}</span></h3><div class="rows">
      ${m.items.map(({ e, prev, q }) => `<button type="button" class="row" data-edit="${e.date}" data-note="${esc(fold(e.note ?? ''))}">
        <span class="dot ${q}" title="${qText(q)}"></span>
        <span class="d">${fmtDate(e.date, { day: 'numeric', month: 'short' })}<small>${fmtDate(e.date, { weekday: 'long' })}</small></span>
        <span class="n">${e.note ? esc(e.note) : r.aroundPeriod.has(e.date) ? t('cycle.around') : e.measures ? t('history.measuresLogged') : ''}</span>
        <span class="w">${fmtW(e.kg, u)}</span>
        <span class="c">${prev ? fmtDelta(e.kg - prev.kg, u) : t('history.start')}</span>
      </button>`).join('')}</div></div>`;
    }).join('')}
  </section>`;
}

/** Filters the weigh-ins to those whose note contains the search, as it's typed. */
export function bindHistory(): void {
  const input = document.querySelector<HTMLInputElement>('#noteSearch');
  if (!input) return;
  const apply = () => {
    noteQuery = input.value;
    const q = fold(noteQuery.trim());
    let shown = 0;
    document.querySelectorAll<HTMLElement>('#allWeighIns .month').forEach(month => {
      let any = false;
      month.querySelectorAll<HTMLElement>('.row').forEach(row => {
        const hit = !q || (row.dataset.note ?? '').includes(q);
        row.hidden = !hit;
        any ||= hit;
      });
      month.hidden = !any;
      if (any) shown++;
    });
    const none = $('#noteNone');
    none.hidden = !q || shown > 0;
    none.textContent = t('history.noNotes', { q: noteQuery.trim() });
  };
  input.addEventListener('input', apply);
  apply();
}
