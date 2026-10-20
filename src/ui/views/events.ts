import { unit } from '../../app';
import type { Profile, WeightEvent } from '../../data/schema';
import { t, type Key } from '../../i18n';
import type { Stats } from '../../lib/calc';
import { fmtDate } from '../../lib/dates';
import { eventEffect } from '../../lib/events';
import { fmtDelta } from '../../lib/units';
import { esc } from '../dom';

// The Events card on History: what happened when, and how the trend moved since.

const day = (s: string) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' });

export const eventKindLabel = (ev: Pick<WeightEvent, 'kind'>): string => t(`event.kind.${ev.kind}` as Key);

function when(ev: WeightEvent): string {
  if (!ev.end) return t('events.since', { date: day(ev.start) });
  return ev.end === ev.start ? day(ev.start) : t('events.range', { from: day(ev.start), to: day(ev.end) });
}

export function eventsCard(p: Profile, r: Stats): string {
  if (!r.E.length && !p.events.length) return '';
  const u = unit();
  const items = [...p.events].reverse().map(ev => {
    const fx = eventEffect(r.E, ev);
    const effect = fx ? `<span class="muted small">${t(ev.end ? 'events.effectDuring' : 'events.effectSince', {
      after: fmtDelta(fx.afterPerWeek, u, 2), before: fmtDelta(fx.beforePerWeek, u, 2) })}</span>` : '';
    return `<li><span class="ev-dot k-${ev.kind}" aria-hidden="true"></span>
      <span class="ev-text"><b>${esc(ev.label)}</b><span class="muted small">${eventKindLabel(ev)} · ${when(ev)}</span>${effect}</span>
      <button type="button" class="btn ghost small-btn" data-event="${esc(ev.id)}" aria-label="${esc(t('events.editLabel', { label: ev.label }))}">${t('events.edit')}</button></li>`;
  }).join('');
  return `<section class="card" id="eventsCard"><div class="card-head"><h2>${t('events.title')}</h2>
      <button type="button" class="btn small-btn" data-act="addEvent">${t('events.add')}</button></div>
    ${items ? `<ul class="ev-list">${items}</ul>` : `<p class="note flush">${t('events.empty')}</p>`}
  </section>`;
}
