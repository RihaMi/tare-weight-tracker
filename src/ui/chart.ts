import type { Profile, Unit } from '../data/schema';
import { calc } from '../lib/calc';
import { goalDateRange } from '../lib/forecast';
import { DAY, addDays, fmtDate, iso, toD } from '../lib/dates';
import { disp, fmtW } from '../lib/units';
import { $ } from './dom';
import { trendSeries } from '../lib/insights';
import { t } from '../i18n';
import { fmtNum } from '../lib/format';

/** Step size giving roughly `target` ticks across `span`. */
export function niceStep(span: number, target = 5): number {
  const raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}


export function drawChart(box: HTMLElement, p: Profile, u: Unit, range: number): void {
  const r = calc(p);
  let E = r.E;
  if (range && E.length) { const cut = addDays(E[E.length - 1].date, -range); E = E.filter(e => e.date >= cut); }
  if (E.length < 2) { box.innerHTML = `<p class="note chart-empty">${t('chart.needTwo')}</p>`; return; }

  const trendAll = trendSeries(r.E);
  const trend = trendAll.filter(x => x.date >= E[0].date);
  const W = Math.max(280, box.clientWidth), H = 280, L = 46, R = 14, T = 14, B = 28;
  const vals = E.map(e => disp(e.kg, u));
  const goalV = r.hasGoal ? disp(p.goalKg!, u) : null;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  // Show the goal line only when it's near enough not to flatten the data.
  const showGoal = goalV != null && goalV >= lo - (hi - lo) * 0.8 - 2 && goalV <= hi + (hi - lo) * 0.8 + 2;
  if (showGoal) { lo = Math.min(lo, goalV!); hi = Math.max(hi, goalV!); }
  const padV = Math.max(0.5, (hi - lo) * 0.08); lo -= padV; hi += padV;
  const step = niceStep(hi - lo, 5);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

  const d0 = toD(E[0].date).getTime(), dLast = toD(E[E.length - 1].date).getTime();
  // Where the goal is likely to be reached. Drawn only when it fits without squeezing
  // the weigh-ins into less than half the width.
  const likely = showGoal && !r.reached ? goalDateRange(r.E, p.goalKg!) : null;
  const cone = likely && toD(likely.to).getTime() - dLast <= Math.max(DAY, dLast - d0) ? likely : null;
  const d1 = cone ? toD(cone.to).getTime() : dLast;
  const x = (s: string) => L + ((toD(s).getTime() - d0) / Math.max(DAY, d1 - d0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

  let g = '';
  const dec = step < 1 ? 1 : 0;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 3.5}" text-anchor="end">${fmtNum(v, dec)}</text>`;
  }
  const nT = Math.max(2, Math.min(6, Math.floor((W - L - R) / 90)));
  const longSpan = (d1 - d0) / DAY > 300;
  for (let i = 0; i < nT; i++) {
    const s = iso(new Date(d0 + ((d1 - d0) * i) / (nT - 1)));
    const anchor = i === 0 ? 'start' : i === nT - 1 ? 'end' : 'middle';
    g += `<text class="ax" x="${x(s)}" y="${H - 8}" text-anchor="${anchor}">${fmtDate(s, longSpan ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' })}</text>`;
  }
  const tl = trend.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.date).toFixed(1)},${y(disp(pt.kg, u)).toFixed(1)}`).join('');
  const area = `${tl}L${x(trend[trend.length - 1].date).toFixed(1)},${H - B}L${x(trend[0].date).toFixed(1)},${H - B}Z`;
  const dots = E.length <= 160 ? E.map(e => `<circle class="raw" cx="${x(e.date).toFixed(1)}" cy="${y(disp(e.kg, u)).toFixed(1)}" r="2.6"/>`).join('') : '';
  // With a cone at the right end, the goal's label moves to the left so they don't overlap.
  const goalLine = showGoal
    ? `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goalV!)}" y2="${y(goalV!)}"/><text class="goal-t" x="${cone ? L + 4 : W - R}" y="${y(goalV!) - 6}" text-anchor="${cone ? 'start' : 'end'}">${t('chart.goal', { v: fmtNum(goalV!) })}</text>`
    : '';
  const le = trend[trend.length - 1];
  let coneSvg = '';
  if (cone) {
    const gy = y(goalV!), ex = x(le.date), ey = y(disp(le.kg, u));
    // The label goes on the far side of the goal line from the cone.
    const ly = ey < gy ? gy + 16 : gy - 9;
    coneSvg = `<path class="cone" d="M${ex.toFixed(1)},${ey.toFixed(1)}L${x(cone.from).toFixed(1)},${gy.toFixed(1)}L${x(cone.to).toFixed(1)},${gy.toFixed(1)}Z"/>`
      + `<line class="cone-band" x1="${x(cone.from).toFixed(1)}" x2="${x(cone.to).toFixed(1)}" y1="${gy}" y2="${gy}"/>`
      + `<circle class="cone-mid" cx="${x(cone.mid).toFixed(1)}" cy="${gy}" r="3.5"/>`
      + `<text class="cone-t" x="${x(cone.to).toFixed(1)}" y="${ly}" text-anchor="end">${t('chart.likely')}</text>`;
  }

  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('chart.aria', { from: fmtDate(E[0].date), to: fmtDate(E[E.length - 1].date) })}">
    ${g}<path class="area" d="${area}"/>${goalLine}${coneSvg}${dots}<path class="trend" d="${tl}"/>
    <circle class="end" cx="${x(le.date)}" cy="${y(disp(le.kg, u))}" r="5.5"/>
    <line class="hov" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
  </svg><div class="tip" hidden></div>`;

  const svg = $<SVGSVGElement>('svg', box), hit = $('.hit', box), hov = $('.hov', box), tip = $('.tip', box);
  const trendByDate = new Map(trendAll.map(t => [t.date, t.kg]));
  const move = (ev: PointerEvent) => {
    const rect = svg.getBoundingClientRect(), px = (ev.clientX - rect.left) * (W / rect.width);
    let best = 0, bd = Infinity;
    E.forEach((e, i) => { const dd = Math.abs(x(e.date) - px); if (dd < bd) { bd = dd; best = i; } });
    const e = E[best], cx = x(e.date);
    hov.setAttribute('x1', String(cx)); hov.setAttribute('x2', String(cx)); hov.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `${fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}<br><b>${fmtW(e.kg, u)}</b> · ${t('chart.tipTrend', { w: fmtW(trendByDate.get(e.date)!, u) })}`;
    const sx = (cx * rect.width) / W, sy = (y(disp(e.kg, u)) * rect.height) / H;
    tip.style.left = Math.min(rect.width - 80, Math.max(80, sx)) + 'px';
    tip.style.top = Math.max(50, sy - 8) + 'px';
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { hov.setAttribute('visibility', 'hidden'); tip.hidden = true; });
}
