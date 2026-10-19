import { app, commit, profile, unit } from '../../app';
import type { Profile, Sex } from '../../data/schema';
import { calc } from '../../lib/calc';
import { ACTIVITY, PACES, calorieFloor, caloriePlan, roundKcal, weeksToGoal, type Formula } from '../../lib/calories';
import { addDays, fmtDate, todayISO } from '../../lib/dates';
import { CM_IN, disp, fmtPace, fmtW, fromDisp, isMetric } from '../../lib/units';
import { $, esc } from '../dom';

// A what-if calculator. It starts from the active profile and latest weigh-in,
// and every field can be changed without touching saved data. Only the
// activity level can be saved back to the profile.

interface Inputs {
  sex: Sex;
  age: number;
  heightCm: number;
  kg: number;
  activity: number;
  weeklyKg: number;
  formula: Formula;
  bodyFatPct: number | null;
}

let inputs: Inputs | null = null;
let inputsFor = '';
let filledIn: string[] = [];

const nearestPace = (wk: number): number => PACES.reduce((a, b) => (Math.abs(b - wk) < Math.abs(a - wk) ? b : a), 0);

function defaults(p: Profile): Inputs {
  const r = calc(p);
  filledIn = [];
  if (!r.age) filledIn.push('age');
  if (!p.heightCm) filledIn.push('height');
  if (r.cur == null) filledIn.push('weight');
  let wk = 0;
  if (r.hasGoal && !r.reached) wk = nearestPace(Math.min(0.5, Math.max(-1, r.needPerDay != null ? r.needPerDay * 7 : r.dir * 0.5)));
  const bf = r.navyBF ?? r.bodyFat ?? null;
  return {
    sex: p.sex,
    age: r.age ?? 30,
    heightCm: p.heightCm ?? (p.sex === 'm' ? 178 : 165),
    kg: r.cur ?? (p.sex === 'm' ? 80 : 65),
    activity: p.activity,
    weeklyKg: wk,
    formula: 'mifflin',
    bodyFatPct: bf != null ? Math.round(bf * 10) / 10 : null,
  };
}

function current(): Inputs {
  const p = profile();
  if (!inputs || inputsFor !== p.id) { inputs = defaults(p); inputsFor = p.id; }
  return inputs;
}

const radio = (name: string, value: string | number, checked: boolean, label: string, sub = '') =>
  `<label class="opt"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;

export function caloriesView(): string {
  const i = current(), u = unit(), p = profile();
  const wDisp = disp(i.kg, u === 'st' ? 'lb' : u);
  const hIn = i.heightCm / CM_IN;
  const goalDir = i.weeklyKg < 0 ? 'lose' : i.weeklyKg > 0 ? 'gain' : 'maintain';
  const paceOpts = (dir: 'lose' | 'gain') => PACES.filter(x => (dir === 'lose' ? x < 0 : x > 0))
    .map(x => `<option value="${x}" ${x === i.weeklyKg ? 'selected' : ''}>${fmtPace(x, u)} a week</option>`).join('');

  return `<div class="grid-2 calc-grid">
  <section class="card">
    <div class="card-head"><h2>Calorie calculator</h2><button type="button" class="btn small-btn" id="calcReset">Reset to ${esc(p.name)}</button></div>
    ${filledIn.length ? `<p class="note flush callout">Some details aren't in ${esc(p.name)}'s profile yet (${filledIn.join(', ')}), so typical values are filled in. Change them below or add them under <a href="#profile">Profile &amp; goal</a>.</p>` : ''}
    <form id="calcForm" class="form" novalidate>
      <fieldset class="fs"><legend>Sex</legend><div class="opts row-opts">${radio('cSex', 'f', i.sex === 'f', 'Female')}${radio('cSex', 'm', i.sex === 'm', 'Male')}</div></fieldset>
      <div class="fields three">
        <label class="f">Age<input id="cAge" type="number" inputmode="numeric" min="15" max="100" value="${i.age}"></label>
        ${isMetric(u)
          ? `<label class="f">Height (cm)<input id="cCm" type="number" inputmode="decimal" min="120" max="230" step="0.5" value="${+i.heightCm.toFixed(1)}"></label>`
          : `<div class="f"><span>Height</span><div class="inline-in"><input id="cFt" type="number" min="3" max="8" aria-label="Feet" value="${Math.floor(hIn / 12)}"><span>ft</span><input id="cIn" type="number" min="0" max="11.9" step="0.1" aria-label="Inches" value="${(hIn % 12).toFixed(1)}"><span>in</span></div></div>`}
        <label class="f">Weight (${u === 'kg' ? 'kg' : 'lb'})<input id="cKg" type="number" inputmode="decimal" min="30" step="0.1" value="${wDisp.toFixed(1)}"></label>
      </div>
      <fieldset class="fs"><legend>How active are you?</legend><div class="opts">
        ${ACTIVITY.map(([v, l, s]) => radio('cAct', v, v === i.activity, l, s)).join('')}
      </div>
      <button type="button" class="btn ghost small-btn" id="calcSaveAct" ${i.activity === p.activity ? 'hidden' : ''}>Save this activity level to ${esc(p.name)}'s profile</button></fieldset>
      <fieldset class="fs"><legend>Goal</legend>
        <div class="opts row-opts">${radio('cGoal', 'lose', goalDir === 'lose', 'Lose weight')}${radio('cGoal', 'maintain', goalDir === 'maintain', 'Maintain')}${radio('cGoal', 'gain', goalDir === 'gain', 'Gain weight')}</div>
        <label class="f" id="cPaceLoseWrap" ${goalDir === 'lose' ? '' : 'hidden'}>Pace<select id="cPaceLose">${paceOpts('lose')}</select></label>
        <label class="f" id="cPaceGainWrap" ${goalDir === 'gain' ? '' : 'hidden'}>Pace<select id="cPaceGain">${paceOpts('gain')}</select></label>
      </fieldset>
      <fieldset class="fs"><legend>Formula</legend><div class="opts">
        ${radio('cFormula', 'mifflin', i.formula === 'mifflin', 'Standard', 'Mifflin–St Jeor. Uses age, sex, height and weight.')}
        ${radio('cFormula', 'katch', i.formula === 'katch', 'Lean mass', 'Katch–McArdle. Better if you know your body fat.')}
      </div>
      <label class="f" id="cBfWrap" ${i.formula === 'katch' ? '' : 'hidden'}>Body fat (%)<input id="cBf" type="number" inputmode="decimal" min="3" max="60" step="0.1" value="${i.bodyFatPct ?? ''}"></label>
      </fieldset>
    </form>
  </section>
  <div class="col">
    <section class="card result" id="calcResult" aria-live="polite"></section>
    <section class="card" id="calcPaces"></section>
  </div>
</div>`;
}

function readForm(): Inputs | null {
  const u = unit();
  const f = $<HTMLFormElement>('#calcForm');
  const val = (id: string) => parseFloat($<HTMLInputElement>('#' + id)?.value ?? '');
  const pick = (name: string) => (f.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value ?? '';
  const goal = pick('cGoal');
  const formula = pick('cFormula') as Formula;
  $('#cPaceLoseWrap').hidden = goal !== 'lose';
  $('#cPaceGainWrap').hidden = goal !== 'gain';
  $('#cBfWrap').hidden = formula !== 'katch';
  const heightCm = isMetric(u) ? val('cCm') : ((val('cFt') || 0) * 12 + (val('cIn') || 0)) * CM_IN;
  const kg = fromDisp(val('cKg'), u === 'kg' ? 'kg' : 'lb');
  const weeklyKg = goal === 'lose' ? +$<HTMLSelectElement>('#cPaceLose').value : goal === 'gain' ? +$<HTMLSelectElement>('#cPaceGain').value : 0;
  const bf = val('cBf');
  const next: Inputs = {
    sex: pick('cSex') === 'm' ? 'm' : 'f', age: val('cAge'), heightCm, kg, activity: +pick('cAct'), weeklyKg, formula,
    bodyFatPct: isFinite(bf) ? bf : null,
  };
  inputs = next;
  $('#calcSaveAct').hidden = next.activity === profile().activity;
  const ok = next.age >= 15 && next.age <= 100 && heightCm >= 120 && heightCm <= 230 && kg >= 30 && kg <= 300 && (formula !== 'katch' || (bf >= 3 && bf <= 60));
  return ok ? next : null;
}

export function updateCalories(): void {
  const box = $('#calcResult'), paces = $('#calcPaces');
  if (!box) return;
  const i = readForm(), u = unit(), p = profile();
  if (!i) {
    box.innerHTML = `<p class="eyebrow">Eat about</p><div class="kcal faint">––––</div>
      <p class="note">Enter an age between 15 and 100, a height and a weight${inputs?.formula === 'katch' ? ', and a body fat percentage' : ''} to see your number.</p>`;
    paces.innerHTML = '';
    return;
  }
  const plan = caloriePlan(i);
  const target = roundKcal(plan.target), tdee = roundKcal(plan.tdee), bmr = roundKcal(plan.bmr);
  const goalLabel = i.weeklyKg < 0 ? `to lose ${fmtPace(i.weeklyKg, u)} a week` : i.weeklyKg > 0 ? `to gain ${fmtPace(i.weeklyKg, u)} a week` : 'to keep your weight steady';
  const m = plan.macros;
  const mk = { p: m.proteinG * 4, f: m.fatG * 9, c: m.carbsG * 4 };
  const mTotal = mk.p + mk.f + mk.c || 1;
  const pct = (x: number) => Math.round((x / mTotal) * 100);
  const scale = Math.max(tdee, target) * 1.04;
  const w = (x: number) => ((x / scale) * 100).toFixed(2) + '%';
  const change = roundKcal(plan.dailyChange);

  box.innerHTML = `
    <p class="eyebrow">Eat about</p>
    <div class="kcal">${target.toLocaleString()}<small>kcal a day</small></div>
    <p class="result-sub">${goalLabel}</p>
    ${plan.floored ? `<p class="warnbox">The pace you picked would put you below ${calorieFloor(i.sex).toLocaleString()} kcal a day. That is the lowest this app suggests without a doctor's supervision, so the number above is raised to it. Expect slower progress, or choose a gentler pace.</p>` : ''}
    ${plan.tooFast && !plan.floored ? `<p class="warnbox">Losing more than 1% of your body weight a week is hard to sustain and can cost muscle. A slower pace usually lasts longer.</p>` : ''}
    <div class="energy" aria-hidden="true">
      <div class="energy-bar"><span class="seg-bmr" style="width:${w(bmr)}"></span><span class="seg-act" style="width:${w(tdee - bmr)}"></span></div>
      <div class="energy-target" style="left:${w(target)}"><span>Target</span></div>
    </div>
    <dl class="ledger">
      <dt><i class="sw seg-bmr"></i>Resting metabolism</dt><dd>${bmr.toLocaleString()}</dd>
      <dt><i class="sw seg-act"></i>Daily activity</dt><dd>+ ${(tdee - bmr).toLocaleString()}</dd>
      <dt class="sum">Maintenance</dt><dd class="sum">${tdee.toLocaleString()}</dd>
      ${change ? `<dt>${change < 0 ? 'Deficit' : 'Surplus'} for your pace</dt><dd>${change < 0 ? '−' : '+'} ${Math.abs(change).toLocaleString()}</dd>` : ''}
      ${plan.floored ? `<dt>Raised to the safe minimum</dt><dd>+ ${(target - roundKcal(plan.raw)).toLocaleString()}</dd>` : ''}
      <dt class="sum">Your target</dt><dd class="sum"><b>${target.toLocaleString()} kcal</b></dd>
    </dl>
    <h3 class="sub-h">Suggested macros</h3>
    <div class="macro-bar" aria-hidden="true"><span class="m-p" style="flex:${mk.p}"></span><span class="m-f" style="flex:${mk.f}"></span><span class="m-c" style="flex:${mk.c}"></span></div>
    <div class="macros">
      <div><i class="sw m-p"></i><span class="k">Protein</span><b>${m.proteinG} g</b><small>${pct(mk.p)}% · about ${Math.round(m.proteinG / 3)} g per meal</small></div>
      <div><i class="sw m-f"></i><span class="k">Fat</span><b>${m.fatG} g</b><small>${pct(mk.f)}% of calories</small></div>
      <div><i class="sw m-c"></i><span class="k">Carbs</span><b>${m.carbsG} g</b><small>${pct(mk.c)}% of calories</small></div>
    </div>
    <p class="note">${plan.formula === 'katch' ? 'Katch–McArdle' : 'Mifflin–St Jeor'} estimate. Everyone burns energy a little differently, so treat it as a starting point: if the scale trend doesn't move as expected after two or three weeks, adjust by 100–200 kcal. Higher protein helps keep muscle while losing weight.</p>`;

  const goalKg = p.goalKg;
  const rows = PACES.map(x => {
    const pl = caloriePlan({ ...i, weeklyKg: x });
    const weeks = goalKg != null ? weeksToGoal(i.kg, goalKg, x) : null;
    const when = goalKg == null ? '' : weeks == null ? '—' : weeks === 0 ? 'Already there' : fmtDate(addDays(todayISO(), weeks * 7), { day: 'numeric', month: 'short', year: 'numeric' });
    const label = x === 0 ? 'Maintain' : `${fmtPace(x, u, true)} a week`;
    return `<tr class="${x === i.weeklyKg ? 'on' : ''}" data-pace="${x}" tabindex="0">
      <td>${label}${pl.tooFast ? ' <span class="tag warn">fast</span>' : ''}</td>
      <td class="num">${roundKcal(pl.target).toLocaleString()}${pl.floored ? ' <span class="tag">min</span>' : ''}</td>
      ${goalKg != null ? `<td class="num">${when}</td>` : ''}</tr>`;
  }).join('');
  paces.innerHTML = `<div class="card-head"><h2>Compare paces</h2>${goalKg != null ? `<span class="muted small">Goal ${fmtW(goalKg, u)}</span>` : ''}</div>
    <div class="table-wrap"><table class="pace-table">
      <thead><tr><th>Weekly change</th><th class="num">kcal a day</th>${goalKg != null ? '<th class="num">Reach goal</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="note">Select a row to use that pace. "min" means the number was raised to the safe minimum.</p>`;
}

function selectPace(x: number): void {
  const goal = x < 0 ? 'lose' : x > 0 ? 'gain' : 'maintain';
  (document.querySelector(`input[name="cGoal"][value="${goal}"]`) as HTMLInputElement).checked = true;
  if (x < 0) $<HTMLSelectElement>('#cPaceLose').value = String(x);
  if (x > 0) $<HTMLSelectElement>('#cPaceGain').value = String(x);
  updateCalories();
}

export function bindCalories(): void {
  const form = $('#calcForm');
  form.addEventListener('input', updateCalories);
  form.addEventListener('change', updateCalories);
  $('#calcReset').addEventListener('click', () => { inputs = null; app.render(); });
  $('#calcSaveAct').addEventListener('click', () => {
    const p = profile();
    p.activity = inputs!.activity; p.updatedAt = Date.now();
    commit('Activity level saved');
  });
  $('#calcPaces').addEventListener('click', ev => {
    const tr = (ev.target as Element).closest<HTMLElement>('[data-pace]');
    if (tr) selectPace(+tr.dataset.pace!);
  });
  $('#calcPaces').addEventListener('keydown', ev => {
    const tr = (ev.target as Element).closest<HTMLElement>('[data-pace]');
    if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); selectPace(+tr.dataset.pace!); }
  });
  updateCalories();
}

/** Forget what-if edits, e.g. after the profile changes. */
export const resetCalories = (): void => { inputs = null; };
