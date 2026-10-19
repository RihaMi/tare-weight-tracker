import { app, profile, unit } from '../../app';
import type { Profile } from '../../data/schema';
import { BMI_CATS, bmiCategory, calc, paceState, type Stats } from '../../lib/calc';
import { ACTIVITY, roundKcal } from '../../lib/calories';
import { fmtDate } from '../../lib/dates';
import { deltaUnit, fmtDelta, fmtW, splitStone, disp } from '../../lib/units';
import { esc } from '../dom';

const RANGES: ReadonlyArray<readonly [number, string]> = [[30, '1M'], [90, '3M'], [180, '6M'], [365, '1Y'], [0, 'All']];

function readingHTML(kg: number): string {
  const u = unit();
  if (u === 'st') { const { st, lb } = splitStone(kg); return `${st}<small>st</small>${lb.toFixed(1)}<small>lb</small>`; }
  return `${disp(kg, u).toFixed(1)}<small>${deltaUnit(u)}</small>`;
}

function hero(p: Profile, r: Stats): string {
  const u = unit(), pace = paceState(r), last = r.last!;
  const goalTxt = r.hasGoal ? (r.reached ? `goal of <b>${fmtW(p.goalKg, u)}</b> reached` : `<b>${fmtW(Math.abs(r.remaining!), u)}</b> to go`) : 'no goal set';
  const pct = r.hasGoal ? Math.round(r.progress! * 100) : 0;
  return `<section class="card hero">
    <div class="hero-top"><span class="eyebrow">Latest weigh-in · ${fmtDate(last.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>${pace ? `<span class="pill ${pace.cls}">${pace.text}</span>` : ''}</div>
    <div class="reading" aria-label="Current weight ${fmtW(r.cur, u)}">${readingHTML(r.cur!)}</div>
    <div class="hero-sub"><b>${fmtDelta(r.change!, u)}</b> since ${fmtDate(r.first!.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${goalTxt}</div>
    ${r.hasGoal ? `<div class="ruler" aria-label="Progress ${pct}% toward goal">
      <div class="ruler-track"><div class="ruler-ticks"></div><div class="ruler-bar"></div><div class="ruler-fill" style="width:${pct}%"></div><div class="ruler-mark" style="left:${pct}%"></div></div>
      <div class="ruler-labels"><span>Start <b>${fmtW(r.start, u)}</b></span><span><b>${pct}%</b> there</span><span>Goal <b>${fmtW(p.goalKg, u)}</b></span></div>
    </div>` : `<p class="note">Set a goal weight under <a href="#profile">Profile &amp; goal</a> to see your progress ruler.</p>`}
  </section>`;
}

function chartCard(r: Stats): string {
  return `<section class="card">
    <div class="card-head"><h2>Weight over time</h2>
      <div class="seg" role="group" aria-label="Chart range">${RANGES.map(([d, l]) => `<button type="button" data-range="${d}" aria-pressed="${app.chartRange === d}">${l}</button>`).join('')}</div></div>
    <div class="chart-box" id="chartBox"></div>
    <div class="legend"><span><i></i>Trend (smoothed)</span><span><i class="dot"></i>Daily weigh-in</span>${r.hasGoal ? '<span><i class="dash"></i>Goal</span>' : ''}</div>
  </section>`;
}

function statsCard(p: Profile, r: Stats): string {
  const u = unit(), wk = r.perDay! * 7;
  const toward = (v: number) => (r.dir * v > 0.0005 ? 'good' : r.dir * v < -0.0005 ? 'bad' : '');
  const longDate = (s: string) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' });
  const stats: Array<[string, string, string]> = [
    ['Total change', fmtDelta(r.change!, u), toward(r.change!)],
    ['Left to goal', r.hasGoal ? (r.reached ? 'Done' : fmtW(Math.abs(r.remaining!), u)) : '—', ''],
    ['Average per day', fmtDelta(r.perDay!, u, 2), toward(r.perDay!)],
    ['Average per week', fmtDelta(wk, u), toward(wk)],
    ['Projected goal date', r.reached ? 'Reached' : r.eta ? longDate(r.eta) : '—', ''],
    ['Needed per week', r.needPerDay != null ? fmtDelta(r.needPerDay * 7, u) : '—', ''],
    ['Weigh-ins', `${r.E.length} in ${r.days} days`, ''],
    ['Days to goal date', r.daysLeft != null ? (r.daysLeft >= 0 ? String(r.daysLeft) : 'Passed') : '—', ''],
  ];
  return `<section class="card"><div class="card-head"><h2>Progress</h2>${r.hasGoal && p.goalDate ? `<span class="muted small">Target ${longDate(p.goalDate)}</span>` : ''}</div>
    <div class="stats">${stats.map(([k, v, c]) => `<div class="stat"><span class="v ${c}">${esc(v)}</span><span class="k">${k}</span></div>`).join('')}</div></section>`;
}

function bmiCard(p: Profile, r: Stats): string {
  if (!r.bmi) return '';
  const u = unit(), lo = 15, hi = 42;
  const pos = Math.min(1, Math.max(0, (r.bmi - lo) / (hi - lo))) * 100;
  const cat = bmiCategory(r.bmi), h2 = (p.heightCm! / 100) ** 2;
  let next: string;
  if (r.bmi >= 25) {
    const below = [...BMI_CATS].reverse().find(c => c.max <= r.bmi!)!;
    next = `${fmtW(r.cur! - below.max * h2 + 0.05, u)} to reach <b>${below.name}</b>`;
  } else if (r.bmi < 18.5) next = `${fmtW(18.5 * h2 - r.cur!, u)} to reach <b>Normal</b>`;
  else next = 'Inside the healthy range';
  const segs: Array<[number, number]> = [[lo, 18.5], [18.5, 25], [25, 30], [30, 35], [35, 40], [40, hi]];
  return `<section class="card"><div class="card-head"><h2>Body mass index</h2><span class="pill ${cat.tone}">${cat.name}</span></div>
    <div class="bmi-wrap"><div class="bmi-pin" style="left:${pos}%">${r.bmi.toFixed(1)}</div>
    <div class="bmi-bar">${segs.map(([a, b], i) => `<span class="tone-${BMI_CATS[i].tone}" style="flex:${b - a};opacity:${BMI_CATS[i] === cat ? 1 : 0.35}"></span>`).join('')}</div></div>
    <div class="bmi-scale"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>35</span><span>40</span></div>
    <p class="note">${next}</p>
    <dl class="kv">
      ${r.healthyLo ? `<dt>Healthy weight range</dt><dd>${fmtW(r.healthyLo, u, false)}–${fmtW(r.healthyHi, u)}</dd>` : ''}
      ${r.ideal ? `<dt>Ideal weight (${p.frame} frame)</dt><dd>${fmtW(r.ideal, u)}</dd>` : ''}
      ${r.bodyFat ? `<dt>Body fat, BMI estimate</dt><dd>${r.bodyFat.toFixed(1)} %</dd>` : ''}
      ${r.navyBF ? `<dt>Body fat, tape measure</dt><dd>${r.navyBF.toFixed(1)} %</dd>` : ''}
    </dl></section>`;
}

function calorieCard(p: Profile, r: Stats): string {
  const u = unit();
  if (!r.tdee) {
    return `<section class="card"><div class="card-head"><h2>Daily calories</h2></div>
      <p class="note flush">Add your birth year and height under <a href="#profile">Profile &amp; goal</a> to see how much to eat.</p></section>`;
  }
  const wk = r.weeklyPlan ?? 0;
  const label = wk < 0 ? 'To lose' : wk > 0 ? 'To gain' : 'To stay at';
  const act = ACTIVITY.find(a => a[0] === p.activity)?.[1].toLowerCase() ?? 'lightly active';
  return `<section class="card"><div class="card-head"><h2>Daily calories</h2><a class="btn small-btn" href="#calories">Open calculator</a></div>
    <dl class="kv flush">
      <dt>To maintain ${fmtW(r.cur, u)}</dt><dd>${roundKcal(r.tdee).toLocaleString()} kcal</dd>
      <dt>${label} ${wk ? fmtW(Math.abs(wk), u) + ' a week' : 'your weight'}</dt><dd><b>${roundKcal(r.target!).toLocaleString()} kcal</b></dd>
    </dl>
    <p class="note">Estimate for a ${r.age}-year-old ${p.sex === 'm' ? 'man' : 'woman'}, ${act}.</p></section>`;
}

export function overviewView(): string {
  const p = profile(), r = calc(p), u = unit();
  if (!r.E.length) {
    return `<section class="card empty"><div class="reading faint">--.-<small>${u === 'st' ? 'st' : deltaUnit(u)}</small></div>
      <h2>No weigh-ins for ${esc(p.name)} yet</h2>
      <p class="muted measure">Step on the scale, ideally at the same time each morning, and log the number. Your trend, BMI and goal pace appear here after the first entry.</p>
      <button class="btn primary" data-act="log">Log first weight</button></section>`;
  }
  return `<div class="grid-2"><div class="col">${hero(p, r)}${chartCard(r)}</div><div class="col">${statsCard(p, r)}${bmiCard(p, r)}${calorieCard(p, r)}</div></div>`;
}
