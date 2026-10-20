import type { Profile, Unit } from '../data/schema';
import { calc } from '../lib/calc';
import { goalDateRange } from '../lib/forecast';
import { DAY, addDays, fmtDate, iso, toD, todayISO } from '../lib/dates';
import { disp, fmtDelta, fmtW } from '../lib/units';
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


/** The weigh-ins in the chart's range as a table, newest first: the chart's data for screen readers, or for anyone. */
function tableHTML(E: Array<{ date: string; kg: number }>, trendByDate: Map<string, number>, u: Unit): string {
  const year = todayISO().slice(0, 4); // the year only where it isn't this one, to keep the table narrow
  const rows = E.map((e, i) => ({ e, prev: E[i - 1] })).reverse().map(({ e, prev }) =>
    `<tr><td>${fmtDate(e.date, e.date.startsWith(year) ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="num">${fmtW(e.kg, u)}</td>
      <td class="num">${prev ? fmtDelta(e.kg - prev.kg, u) : '—'}</td><td class="num">${fmtW(trendByDate.get(e.date)!, u)}</td></tr>`).join('');
  return `<table class="week-table"><thead><tr><th>${t('entry.date')}</th><th class="num">${t('chart.colWeight')}</th><th class="num">${t('weekly.change')}</th><th class="num">${t('chart.colTrend')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Draws the weight chart into `box`, and the same weigh-ins as a table into
 * `table` if given. The chart can be explored with the pointer, or with the
 * arrow keys once it has focus; each weigh-in is then read out.
 */
export function drawChart(box: HTMLElement, p: Profile, u: Unit, range: number, table?: HTMLElement | null): void {
  const r = calc(p);
  let E = r.E;
  if (range && E.length) { const cut = addDays(E[E.length - 1].date, -range); E = E.filter(e => e.date >= cut); }
  if (E.length < 2) {
    box.innerHTML = `<p class="note chart-empty">${t('chart.needTwo')}</p>`;
    box.removeAttribute('tabindex'); box.removeAttribute('role'); box.removeAttribute('aria-label');
    if (table) table.closest('details')!.hidden = true;
    return;
  }

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

  box.tabIndex = 0;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', t('chart.keys', { from: fmtDate(E[0].date), to: fmtDate(E[E.length - 1].date) }));
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    ${g}<path class="area" d="${area}"/>${goalLine}${coneSvg}${dots}<path class="trend" d="${tl}"/>
    <circle class="end" cx="${x(le.date)}" cy="${y(disp(le.kg, u))}" r="5.5"/>
    <line class="hov" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
  </svg><div class="tip" hidden></div><p class="sr-only" aria-live="polite"></p>`;

  const svg = $<SVGSVGElement>('svg', box), hit = $('.hit', box), hov = $('.hov', box), tip = $('.tip', box), live = $('.sr-only', box);
  const trendByDate = new Map(trendAll.map(t => [t.date, t.kg]));
  let shown = -1;
  /** Marks weigh-in `i` with the line and tooltip; `announce` also reads it out (keyboard). */
  const show = (i: number, announce = false) => {
    shown = i;
    const e = E[i], cx = x(e.date), rect = svg.getBoundingClientRect();
    hov.setAttribute('x1', String(cx)); hov.setAttribute('x2', String(cx)); hov.setAttribute('visibility', 'visible');
    const day = fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' }), trendW = t('chart.tipTrend', { w: fmtW(trendByDate.get(e.date)!, u) });
    tip.hidden = false;
    tip.innerHTML = `${day}<br><b>${fmtW(e.kg, u)}</b> · ${trendW}`;
    const sx = (cx * rect.width) / W, sy = (y(disp(e.kg, u)) * rect.height) / H;
    tip.style.left = Math.min(rect.width - 80, Math.max(80, sx)) + 'px';
    tip.style.top = Math.max(50, sy - 8) + 'px';
    if (announce) live.textContent = `${fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${fmtW(e.kg, u)}, ${trendW}`;
  };
  const hide = () => { hov.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const move = (ev: PointerEvent) => {
    const rect = svg.getBoundingClientRect(), px = (ev.clientX - rect.left) * (W / rect.width);
    let best = 0, bd = Infinity;
    E.forEach((e, i) => { const dd = Math.abs(x(e.date) - px); if (dd < bd) { bd = dd; best = i; } });
    show(best);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { if (document.activeElement !== box) hide(); });
  box.onkeydown = ev => {
    const last = E.length - 1, at = shown < 0 ? last + 1 : shown;
    const to = ({ ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: last } as Record<string, number>)[ev.key];
    if (ev.key === 'Escape') { hide(); return; }
    if (to == null) return;
    ev.preventDefault();
    show(Math.max(0, Math.min(last, to)), true);
  };
  box.onblur = hide;
  if (table) {
    table.innerHTML = tableHTML(E, trendByDate, u);
    table.closest('details')!.hidden = false;
  }
}
