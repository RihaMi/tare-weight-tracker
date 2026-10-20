import { profile, unit } from '../../app';
import { MEASURES } from '../../data/schema';
import { t, type Key } from '../../i18n';
import { calc } from '../../lib/calc';
import { fmtDate } from '../../lib/dates';
import { fmtNum } from '../../lib/format';
import { fmtLen, lenDelta } from '../../lib/units';
import { sparkline } from '../dom';
import { compositionSummary, type CompositionSeries } from '../../lib/composition';
import { fmtDelta, fmtW } from '../../lib/units';
import type { Entry } from '../../data/schema';

export const measureLabel = (k: string): string => t(`measure.${k}` as Key);

/** Body fat, muscle and water from a smart scale: smoothed, with how much of the weight change was fat. */
function compositionCard(entries: Entry[]): string {
  const s = compositionSummary(entries);
  if (!s.fat && !s.muscle && !s.water) return '';
  const u = unit();
  const pctCard = (label: string, c: CompositionSeries) => `<div class="mcard"><span class="eyebrow">${label}</span><span class="v">${fmtNum(c.latest)} %</span>
    <span class="note flush">${c.values.length > 1 ? t('comp.since', { delta: (c.change > 0 ? '+' : c.change < 0 ? '−' : '±') + fmtNum(Math.abs(c.change)) + ' %', date: fmtDate(c.first.date) }) : t('body.measured', { date: fmtDate(c.first.date) })}</span>${sparkline(c.values)}</div>`;
  const muscleCard = (c: CompositionSeries) => `<div class="mcard"><span class="eyebrow">${t('comp.muscle')}</span><span class="v">${fmtW(c.latest, u)}</span>
    <span class="note flush">${c.values.length > 1 ? t('comp.since', { delta: fmtDelta(c.change, u), date: fmtDate(c.first.date) }) : t('body.measured', { date: fmtDate(c.first.date) })}</span>${sparkline(c.values)}</div>`;
  const sp = s.split;
  const split = sp && Math.abs(sp.weightChange) >= 0.5
    ? `<p class="note">${t(sp.weightChange < 0 ? 'comp.splitLoss' : 'comp.splitGain', { w: fmtW(Math.abs(sp.weightChange), u), fat: fmtW(Math.abs(sp.fatChange), u), lean: fmtW(Math.abs(sp.leanChange), u), date: fmtDate(sp.since) })}</p>`
    : '';
  return `<section class="card" id="compositionCard">
    <div class="card-head"><h2>${t('comp.title')}</h2><span class="muted small">${t('comp.sub')}</span></div>
    <div class="meas">${s.fat ? pctCard(t('comp.fat'), s.fat) : ''}${s.muscle ? muscleCard(s.muscle) : ''}${s.water ? pctCard(t('comp.water'), s.water) : ''}</div>
    ${split}
    <p class="note">${t('comp.noisy')}</p>
  </section>`;
}

export function bodyView(): string {
  const p = profile(), r = calc(p), u = unit();
  const withM = r.E.filter(e => e.measures);
  const howToText = t(p.sex === 'm' ? 'body.howTo.m' : 'body.howTo.f');
  const comp = compositionCard(r.E);
  if (!withM.length) {
    return comp + `<section class="card empty">
      <h2>${t('body.emptyTitle')}</h2>
      <p class="muted measure">${t('body.emptyText')}</p>
      <button type="button" class="btn primary" data-act="logMeas">${t('body.add')}</button>
      <p class="note measure">${howToText}</p>
    </section>`;
  }
  const cards = MEASURES.map(([k]) => {
    const label = measureLabel(k);
    const series = withM.filter(e => e.measures![k] != null);
    if (!series.length) return `<div class="mcard"><span class="eyebrow">${label}</span><span class="v muted">—</span><span class="note flush">${t('body.notYet')}</span></div>`;
    const last = series[series.length - 1].measures![k]!, first = series[0].measures![k]!;
    return `<div class="mcard"><span class="eyebrow">${label}</span><span class="v">${fmtLen(last, u)}</span>
      <span class="note flush">${series.length > 1 ? t('body.since', { delta: lenDelta(last - first, u), date: fmtDate(series[0].date) }) : t('body.measured', { date: fmtDate(series[0].date) })}</span>${sparkline(series.map(e => e.measures![k]!))}</div>`;
  }).join('');
  const lastWaist = withM[withM.length - 1]?.measures?.waist;
  const whtr = lastWaist && p.heightCm ? lastWaist / p.heightCm : null;
  return comp + `<section class="card">
    <div class="card-head"><h2>${t('body.title')}</h2><button class="btn" data-act="logMeas">${t('body.add')}</button></div>
    <div class="meas">${cards}</div>
    ${whtr || r.navyBF ? `<dl class="kv narrow">
      ${whtr ? `<dt>${t('body.whtr')}</dt><dd>${fmtNum(whtr, 2)} <span class="muted">${t(whtr < 0.5 ? 'body.whtrGood' : 'body.whtrAim')}</span></dd>` : ''}
      ${r.navyBF ? `<dt>${t('body.navy')}</dt><dd>${fmtNum(r.navyBF)} %</dd>` : ''}
    </dl>` : ''}
    <p class="note">${howToText}</p>
  </section>`;
}
