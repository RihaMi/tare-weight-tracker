import { app, profile, unit } from '../../app';
import type { Profile } from '../../data/schema';
import { t, tn, type Key } from '../../i18n';
import { BMI_CATS, bmiCategory, calc, paceState, type Stats } from '../../lib/calc';
import { roundKcal } from '../../lib/calories';
import { fmtDate, todayISO } from '../../lib/dates';
import { goalDateRange } from '../../lib/forecast';
import { fmtInt, fmtNum } from '../../lib/format';
import { deltaUnit, disp, fmtDelta, fmtW, splitStone } from '../../lib/units';
import { esc } from '../dom';
import { thisWeekCard } from './insights';

const RANGES: ReadonlyArray<readonly [number, Key]> = [[30, 'chart.1m'], [90, 'chart.3m'], [180, 'chart.6m'], [365, 'chart.1y'], [0, 'chart.all']];

export const profileLink = (): string => `<a href="#profile">${esc(t('link.profileGoal'))}</a>`;
export const activityKey = (v: number, suffix: '' | '.d' | '.s' = ''): Key => `act.${v}${suffix}` as Key;

function readingHTML(kg: number): string {
  const u = unit();
  if (u === 'st') { const { st, lb } = splitStone(kg); return `${st}<small>st</small>${fmtNum(lb)}<small>lb</small>`; }
  return `${fmtNum(disp(kg, u))}<small>${deltaUnit(u)}</small>`;
}

function hero(p: Profile, r: Stats): string {
  const u = unit(), pace = paceState(r), last = r.last!;
  const goalTxt = r.hasGoal
    ? (r.reached ? t('overview.goalReached', { w: fmtW(p.goalKg, u) }) : t('overview.toGo', { w: fmtW(Math.abs(r.remaining!), u) }))
    : t('overview.noGoal');
  const pct = r.hasGoal ? Math.round(r.progress! * 100) : 0;
  return `<section class="card hero">
    <div class="hero-top"><span class="eyebrow">${t('overview.latest', { date: fmtDate(last.date, { weekday: 'short', day: 'numeric', month: 'short' }) })}</span>${pace ? `<span class="pill ${pace.cls}">${t(`pace.${pace.code}` as Key)}</span>` : ''}</div>
    <div class="reading" aria-label="${esc(t('overview.currentWeight', { w: fmtW(r.cur, u) }))}">${readingHTML(r.cur!)}</div>
    <div class="hero-sub">${t('overview.since', { delta: fmtDelta(r.change!, u), date: fmtDate(r.first!.date, { day: 'numeric', month: 'short', year: 'numeric' }) })} · ${goalTxt}</div>
    ${r.hasGoal ? `<div class="ruler" aria-label="${esc(t('overview.progressAria', { pct }))}">
      <div class="ruler-track"><div class="ruler-ticks"></div><div class="ruler-bar"></div><div class="ruler-fill" style="width:${pct}%"></div><div class="ruler-mark" style="left:${pct}%"></div></div>
      <div class="ruler-labels"><span>${t('overview.start')} <b>${fmtW(r.start, u)}</b></span><span>${t('overview.there', { pct })}</span><span>${t('common.goal')} <b>${fmtW(p.goalKg, u)}</b></span></div>
    </div>` : `<p class="note">${t('overview.setGoal', { link: profileLink() })}</p>`}
    ${r.E.length > 1 ? `<div class="actions start hero-share"><button type="button" class="btn small-btn" data-act="share">${t('share.button')}</button></div>` : ''}
  </section>`;
}

/** Whether "Show as table" is open, kept while the Overview redraws. */
let chartTableOpen = false;
export const rememberChartTable = (open: boolean): void => { chartTableOpen = open; };

function chartCard(r: Stats): string {
  return `<section class="card">
    <div class="card-head"><h2>${t('chart.title')}</h2>
      <div class="seg" role="group" aria-label="${esc(t('chart.range'))}">${RANGES.map(([d, l]) => `<button type="button" data-range="${d}" aria-pressed="${app.chartRange === d}">${t(l)}</button>`).join('')}</div></div>
    <div class="chart-box" id="chartBox"></div>
    <div class="legend"><span><i></i>${t('chart.trend')}</span><span><i class="dot"></i>${t('chart.daily')}</span>${r.hasGoal ? `<span><i class="dash"></i>${t('common.goal')}</span>` : ''}</div>
    <details class="chart-table" ${chartTableOpen ? 'open' : ''}><summary>${t('chart.table')}</summary><div class="table-wrap" id="chartTable"></div></details>
  </section>`;
}

/** "10 Dec – 20 Jan", with years only when it isn't all this year. */
function dateRange(from: string, to: string): string {
  const year = todayISO().slice(0, 4);
  const o: Intl.DateTimeFormatOptions = from.startsWith(year) && to.startsWith(year) ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return `${fmtDate(from, o)} – ${fmtDate(to, o)}`;
}

function statsCard(p: Profile, r: Stats): string {
  const u = unit(), wk = r.perDay! * 7;
  const likely = r.hasGoal && !r.reached ? goalDateRange(r.E, p.goalKg!) : null;
  const toward = (v: number) => (r.dir * v > 0.0005 ? 'good' : r.dir * v < -0.0005 ? 'bad' : '');
  const longDate = (s: string) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' });
  const stats: Array<[Key, string, string]> = [
    ['stats.total', fmtDelta(r.change!, u), toward(r.change!)],
    ['stats.left', r.hasGoal ? (r.reached ? t('stats.done') : fmtW(Math.abs(r.remaining!), u)) : '—', ''],
    ['stats.perDay', fmtDelta(r.perDay!, u, 2), toward(r.perDay!)],
    ['stats.perWeek', fmtDelta(wk, u), toward(wk)],
    likely ? ['stats.etaRange', dateRange(likely.from, likely.to), ''] : ['stats.eta', r.reached ? t('stats.reached') : r.eta ? longDate(r.eta) : '—', ''],
    ['stats.need', r.needPerDay != null ? fmtDelta(r.needPerDay * 7, u) : '—', ''],
    ['stats.count', tn('stats.countValue', r.days!, { n: r.E.length, d: r.days! }), ''],
    ['stats.daysLeft', r.daysLeft != null ? (r.daysLeft >= 0 ? String(r.daysLeft) : t('stats.passed')) : '—', ''],
  ];
  return `<section class="card"><div class="card-head"><h2>${t('stats.title')}</h2>${r.hasGoal && p.goalDate ? `<span class="muted small">${t('stats.target', { date: longDate(p.goalDate) })}</span>` : ''}</div>
    <div class="stats">${stats.map(([k, v, c]) => `<div class="stat"><span class="v ${c}">${esc(v)}</span><span class="k">${t(k)}</span></div>`).join('')}</div></section>`;
}

function bmiCard(p: Profile, r: Stats): string {
  if (!r.bmi) return '';
  const u = unit(), lo = 15, hi = 42;
  // Kept away from the very ends so the value above the marker stays inside the card.
  const pos = Math.min(0.96, Math.max(0.04, (r.bmi - lo) / (hi - lo))) * 100;
  const cat = bmiCategory(r.bmi), h2 = (p.heightCm! / 100) ** 2;
  const catName = (id: string) => t(`bmi.${id}` as Key);
  let next: string;
  if (r.bmi >= 25) {
    const below = [...BMI_CATS].reverse().find(c => c.max <= r.bmi!)!;
    next = t('bmi.toReach', { w: fmtW(r.cur! - below.max * h2 + 0.05, u), cat: catName(below.id) });
  } else if (r.bmi < 18.5) next = t('bmi.toReach', { w: fmtW(18.5 * h2 - r.cur!, u), cat: catName('normal') });
  else next = t('bmi.inside');
  const segs: Array<[number, number]> = [[lo, 18.5], [18.5, 25], [25, 30], [30, 35], [35, 40], [40, hi]];
  return `<section class="card"><div class="card-head"><h2>${t('bmi.title')}</h2><span class="pill ${cat.tone}">${catName(cat.id)}</span></div>
    <div class="bmi-wrap"><div class="bmi-pin" style="left:${pos}%">${fmtNum(r.bmi)}</div>
    <div class="bmi-bar">${segs.map(([a, b], i) => `<span class="tone-${BMI_CATS[i].tone}" style="flex:${b - a};opacity:${BMI_CATS[i] === cat ? 1 : 0.35}"></span>`).join('')}</div></div>
    <div class="bmi-scale">${[15, 18.5, 25, 30, 35, 40].map(v => `<span>${fmtNum(v, v % 1 ? 1 : 0)}</span>`).join('')}</div>
    <p class="note">${next}</p>
    <dl class="kv">
      ${r.healthyLo ? `<dt>${t('bmi.healthyRange')}</dt><dd>${fmtW(r.healthyLo, u, false)}–${fmtW(r.healthyHi, u)}</dd>` : ''}
      ${r.ideal ? `<dt>${t('bmi.ideal', { frame: t(`frame.${p.frame}` as Key) })}</dt><dd>${fmtW(r.ideal, u)}</dd>` : ''}
      ${r.bodyFat ? `<dt>${t('bmi.bfBmi')}</dt><dd>${fmtNum(r.bodyFat)} %</dd>` : ''}
      ${r.navyBF ? `<dt>${t('bmi.bfTape')}</dt><dd>${fmtNum(r.navyBF)} %</dd>` : ''}
    </dl></section>`;
}

function calorieCard(p: Profile, r: Stats): string {
  const u = unit();
  if (!r.tdee) {
    return `<section class="card"><div class="card-head"><h2>${t('cal.card')}</h2></div>
      <p class="note flush">${t('cal.needProfile', { link: profileLink() })}</p></section>`;
  }
  const wk = r.weeklyPlan ?? 0;
  const label = wk < 0 ? t('cal.lose', { w: fmtW(-wk, u) }) : wk > 0 ? t('cal.gain', { w: fmtW(wk, u) }) : t('cal.hold');
  return `<section class="card"><div class="card-head"><h2>${t('cal.card')}</h2><a class="btn small-btn" href="#calories">${t('cal.open')}</a></div>
    <dl class="kv flush">
      <dt>${t('cal.maintain', { w: fmtW(r.cur, u) })}</dt><dd>${fmtInt(roundKcal(r.tdee))} kcal</dd>
      <dt>${label}</dt><dd><b>${fmtInt(roundKcal(r.target!))} kcal</b></dd>
    </dl>
    <p class="note">${t(p.sex === 'm' ? 'cal.estimate.m' : 'cal.estimate.f', { age: r.age!, activity: t(activityKey(p.activity, '.s')) })}</p></section>`;
}

export function overviewView(): string {
  const p = profile(), r = calc(p), u = unit();
  if (!r.E.length) {
    return `<section class="card empty"><div class="reading faint">--.-<small>${u === 'st' ? 'st' : deltaUnit(u)}</small></div>
      <h2>${t('overview.empty.title', { name: esc(p.name) })}</h2>
      <p class="muted measure">${t('overview.empty.text')}</p>
      <button class="btn primary" data-act="log">${t('overview.logFirst')}</button></section>`;
  }
  return `<div class="grid-2"><div class="col">${hero(p, r)}${chartCard(r)}</div><div class="col">${thisWeekCard(p, r)}${statsCard(p, r)}${bmiCard(p, r)}${calorieCard(p, r)}</div></div>`;
}
