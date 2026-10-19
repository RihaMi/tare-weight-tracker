import { profile, unit } from '../../app';
import { MEASURES } from '../../data/schema';
import { t, type Key } from '../../i18n';
import { calc } from '../../lib/calc';
import { fmtDate } from '../../lib/dates';
import { fmtNum } from '../../lib/format';
import { fmtLen, lenDelta } from '../../lib/units';
import { sparkline } from '../dom';

export const measureLabel = (k: string): string => t(`measure.${k}` as Key);

export function bodyView(): string {
  const p = profile(), r = calc(p), u = unit();
  const withM = r.E.filter(e => e.measures);
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
  return `<section class="card">
    <div class="card-head"><h2>${t('body.title')}</h2><button class="btn" data-act="logMeas">${t('body.add')}</button></div>
    <div class="meas">${cards}</div>
    ${whtr || r.navyBF ? `<dl class="kv narrow">
      ${whtr ? `<dt>${t('body.whtr')}</dt><dd>${fmtNum(whtr, 2)} <span class="muted">${t(whtr < 0.5 ? 'body.whtrGood' : 'body.whtrAim')}</span></dd>` : ''}
      ${r.navyBF ? `<dt>${t('body.navy')}</dt><dd>${fmtNum(r.navyBF)} %</dd>` : ''}
    </dl>` : ''}
    <p class="note">${t(p.sex === 'm' ? 'body.howTo.m' : 'body.howTo.f')}</p>
  </section>`;
}
