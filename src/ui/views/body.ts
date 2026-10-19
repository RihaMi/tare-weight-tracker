import { profile, unit } from '../../app';
import { MEASURES } from '../../data/schema';
import { calc } from '../../lib/calc';
import { fmtDate } from '../../lib/dates';
import { fmtLen, lenDelta } from '../../lib/units';
import { sparkline } from '../dom';

export function bodyView(): string {
  const p = profile(), r = calc(p), u = unit();
  const withM = r.E.filter(e => e.measures);
  const cards = MEASURES.map(([k, label]) => {
    const series = withM.filter(e => e.measures![k] != null);
    if (!series.length) return `<div class="mcard"><span class="eyebrow">${label}</span><span class="v muted">—</span><span class="note flush">Not measured yet</span></div>`;
    const last = series[series.length - 1].measures![k]!, first = series[0].measures![k]!;
    return `<div class="mcard"><span class="eyebrow">${label}</span><span class="v">${fmtLen(last, u)}</span>
      <span class="note flush">${series.length > 1 ? `${lenDelta(last - first, u)} since ${fmtDate(series[0].date)}` : `Measured ${fmtDate(series[0].date)}`}</span>${sparkline(series.map(e => e.measures![k]!))}</div>`;
  }).join('');
  const lastWaist = withM[withM.length - 1]?.measures?.waist;
  const whtr = lastWaist && p.heightCm ? lastWaist / p.heightCm : null;
  return `<section class="card">
    <div class="card-head"><h2>Body measurements</h2><button class="btn" data-act="logMeas">+ Add measurements</button></div>
    <div class="meas">${cards}</div>
    ${whtr || r.navyBF ? `<dl class="kv narrow">
      ${whtr ? `<dt>Waist-to-height ratio</dt><dd>${whtr.toFixed(2)} <span class="muted">${whtr < 0.5 ? '(below 0.5, healthy)' : '(aim for under 0.5)'}</span></dd>` : ''}
      ${r.navyBF ? `<dt>Body fat, US Navy tape method</dt><dd>${r.navyBF.toFixed(1)} %</dd>` : ''}
    </dl>` : ''}
    <p class="note">Measure at the same spot each time: waist at the navel, hips at the widest point, neck just below the larynx. The tape-measure body fat estimate needs waist, neck${p.sex === 'm' ? '' : ' and hips'} plus your height.</p>
  </section>`;
}
