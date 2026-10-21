import { app, commit, profile, unit } from '../../app';
import type { Profile, Sex } from '../../data/schema';
import { t, type Key } from '../../i18n';
import { calc } from '../../lib/calc';
import { ACTIVITY, PACES, calorieFloor, caloriePlan, roundKcal, weeksToGoal, type Formula } from '../../lib/calories';
import { addDays, fmtDate, todayISO } from '../../lib/dates';
import { fmtInt } from '../../lib/format';
import { CM_IN, disp, fmtPace, fmtW, fromDisp, isMetric } from '../../lib/units';
import { $, esc } from '../dom';
import { activityKey, profileLink } from './overview';

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
let filledIn: Key[] = [];

const nearestPace = (wk: number): number => PACES.reduce((a, b) => (Math.abs(b - wk) < Math.abs(a - wk) ? b : a), 0);

function defaults(p: Profile): Inputs {
  const r = calc(p);
  filledIn = [];
  if (!r.age) filledIn.push('calc.field.age');
  if (!p.heightCm) filledIn.push('calc.field.height');
  if (r.cur == null) filledIn.push('calc.field.weight');
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
    .map(x => `<option value="${x}" ${x === i.weeklyKg ? 'selected' : ''}>${t('calc.perWeek', { pace: fmtPace(x, u) })}</option>`).join('');
  const name = esc(p.name);

  return `<div class="grid-2 calc-grid">
  <section class="card">
    <div class="card-head"><h2>${t('calc.title')}</h2><button type="button" class="btn small-btn btn-wrap" id="calcReset">${t('calc.reset', { name })}</button></div>
    ${filledIn.length ? `<p class="note flush callout">${t('calc.filledIn', { name, fields: filledIn.map(k => t(k)).join(', '), link: profileLink() })}</p>` : ''}
    <form id="calcForm" class="form" novalidate>
      <fieldset class="fs"><legend>${t('common.sex')}</legend><div class="opts row-opts">${radio('cSex', 'f', i.sex === 'f', t('common.female'))}${radio('cSex', 'm', i.sex === 'm', t('common.male'))}</div></fieldset>
      <div class="fields three">
        <label class="f">${t('common.age')}<input id="cAge" type="number" inputmode="numeric" min="15" max="100" value="${i.age}"></label>
        ${isMetric(u)
          ? `<label class="f">${t('common.heightCm')}<input id="cCm" type="number" inputmode="decimal" min="120" max="230" step="0.5" value="${+i.heightCm.toFixed(1)}"></label>`
          : `<div class="f"><span>${t('common.height')}</span><div class="inline-in"><input id="cFt" type="number" min="3" max="8" aria-label="${esc(t('common.feet'))}" value="${Math.floor(hIn / 12)}"><span>ft</span><input id="cIn" type="number" min="0" max="11.9" step="0.1" aria-label="${esc(t('common.inches'))}" value="${(hIn % 12).toFixed(1)}"><span>in</span></div></div>`}
        <label class="f">${t('common.weightUnit', { unit: u === 'kg' ? 'kg' : 'lb' })}<input id="cKg" type="number" inputmode="decimal" min="30" step="0.1" value="${wDisp.toFixed(1)}"></label>
      </div>
      <fieldset class="fs"><legend>${t('calc.active')}</legend><div class="opts">
        ${ACTIVITY.map(([v]) => radio('cAct', v, v === i.activity, t(activityKey(v)), t(activityKey(v, '.d')))).join('')}
      </div>
      <button type="button" class="btn ghost small-btn btn-wrap" id="calcSaveAct" ${i.activity === p.activity ? 'hidden' : ''}>${t('calc.saveAct', { name })}</button></fieldset>
      <fieldset class="fs"><legend>${t('common.goal')}</legend>
        <div class="opts row-opts">${radio('cGoal', 'lose', goalDir === 'lose', t('calc.lose'))}${radio('cGoal', 'maintain', goalDir === 'maintain', t('calc.maintain'))}${radio('cGoal', 'gain', goalDir === 'gain', t('calc.gain'))}</div>
        <label class="f" id="cPaceLoseWrap" ${goalDir === 'lose' ? '' : 'hidden'}>${t('calc.pace')}<select id="cPaceLose">${paceOpts('lose')}</select></label>
        <label class="f" id="cPaceGainWrap" ${goalDir === 'gain' ? '' : 'hidden'}>${t('calc.pace')}<select id="cPaceGain">${paceOpts('gain')}</select></label>
      </fieldset>
      <fieldset class="fs"><legend>${t('calc.formula')}</legend><div class="opts">
        ${radio('cFormula', 'mifflin', i.formula === 'mifflin', t('calc.standard'), t('calc.standard.d'))}
        ${radio('cFormula', 'katch', i.formula === 'katch', t('calc.lean'), t('calc.lean.d'))}
      </div>
      <label class="f" id="cBfWrap" ${i.formula === 'katch' ? '' : 'hidden'}>${t('calc.bodyFat')}<input id="cBf" type="number" inputmode="decimal" min="3" max="60" step="0.1" value="${i.bodyFatPct ?? ''}"></label>
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
    box.innerHTML = `<p class="eyebrow">${t('calc.eatAbout')}</p><div class="kcal faint">––––</div>
      <p class="note">${t(inputs?.formula === 'katch' ? 'calc.invalidBf' : 'calc.invalid')}</p>`;
    paces.innerHTML = '';
    return;
  }
  const plan = caloriePlan(i);
  const target = roundKcal(plan.target), tdee = roundKcal(plan.tdee), bmr = roundKcal(plan.bmr);
  const goalLabel = i.weeklyKg < 0 ? t('calc.toLose', { pace: fmtPace(i.weeklyKg, u) })
    : i.weeklyKg > 0 ? t('calc.toGain', { pace: fmtPace(i.weeklyKg, u) }) : t('calc.toHold');
  const m = plan.macros;
  const mk = { p: m.proteinG * 4, f: m.fatG * 9, c: m.carbsG * 4 };
  const mTotal = mk.p + mk.f + mk.c || 1;
  const pct = (x: number) => Math.round((x / mTotal) * 100);
  const scale = Math.max(tdee, target) * 1.04;
  const w = (x: number) => ((x / scale) * 100).toFixed(2) + '%';
  const change = roundKcal(plan.dailyChange);

  box.innerHTML = `
    <p class="eyebrow">${t('calc.eatAbout')}</p>
    <div class="kcal"><span>${fmtInt(target)}</span><small>${t('calc.kcalDay')}</small></div>
    <p class="result-sub">${goalLabel}</p>
    ${plan.floored ? `<p class="warnbox">${t('calc.floored', { floor: fmtInt(calorieFloor(i.sex)) })}</p>` : ''}
    ${plan.tooFast && !plan.floored ? `<p class="warnbox">${t('calc.tooFast')}</p>` : ''}
    <div class="energy" aria-hidden="true">
      <div class="energy-bar"><span class="seg-bmr" style="width:${w(bmr)}"></span><span class="seg-act" style="width:${w(tdee - bmr)}"></span></div>
      <div class="energy-target" style="left:${w(target)}"></div>
      <span class="energy-label ${target / scale > 0.6 ? 'flip' : ''}" style="left:${w(target)}">${t('calc.target')}</span>
    </div>
    <dl class="ledger">
      <dt><i class="sw seg-bmr"></i>${t('calc.bmr')}</dt><dd>${fmtInt(bmr)}</dd>
      <dt><i class="sw seg-act"></i>${t('calc.activity')}</dt><dd>+ ${fmtInt(tdee - bmr)}</dd>
      <dt class="sum">${t('calc.maintenance')}</dt><dd class="sum">${fmtInt(tdee)}</dd>
      ${change ? `<dt>${t(change < 0 ? 'calc.deficit' : 'calc.surplus')}</dt><dd>${change < 0 ? '−' : '+'} ${fmtInt(Math.abs(change))}</dd>` : ''}
      ${plan.floored ? `<dt>${t('calc.raised')}</dt><dd>+ ${fmtInt(target - roundKcal(plan.raw))}</dd>` : ''}
      <dt class="sum">${t('calc.yourTarget')}</dt><dd class="sum"><b>${fmtInt(target)} kcal</b></dd>
    </dl>
    <h3 class="sub-h">${t('calc.macros')}</h3>
    <div class="macro-bar" aria-hidden="true"><span class="m-p" style="flex:${mk.p}"></span><span class="m-f" style="flex:${mk.f}"></span><span class="m-c" style="flex:${mk.c}"></span></div>
    <div class="macros">
      <div><i class="sw m-p"></i><span class="k">${t('calc.protein')}</span><b>${m.proteinG} g</b><small>${t('calc.perMeal', { pct: pct(mk.p), g: Math.round(m.proteinG / 3) })}</small></div>
      <div><i class="sw m-f"></i><span class="k">${t('calc.fat')}</span><b>${m.fatG} g</b><small>${t('calc.ofCalories', { pct: pct(mk.f) })}</small></div>
      <div><i class="sw m-c"></i><span class="k">${t('calc.carbs')}</span><b>${m.carbsG} g</b><small>${t('calc.ofCalories', { pct: pct(mk.c) })}</small></div>
    </div>
    <p class="note">${t('calc.note', { formula: plan.formula === 'katch' ? 'Katch–McArdle' : 'Mifflin–St Jeor' })}</p>`;

  const goalKg = p.goalKg;
  const rows = PACES.map(x => {
    const pl = caloriePlan({ ...i, weeklyKg: x });
    const weeks = goalKg != null ? weeksToGoal(i.kg, goalKg, x) : null;
    const when = goalKg == null ? '' : weeks == null ? '—' : weeks === 0 ? t('calc.already') : fmtDate(addDays(todayISO(), weeks * 7), { day: 'numeric', month: 'short', year: 'numeric' });
    const label = x === 0 ? t('calc.maintain') : t('calc.perWeek', { pace: fmtPace(x, u, true) });
    return `<tr class="${x === i.weeklyKg ? 'on' : ''}" data-pace="${x}" tabindex="0">
      <td>${label}${pl.tooFast ? ` <span class="tag warn">${t('calc.fast')}</span>` : ''}</td>
      <td class="num">${fmtInt(roundKcal(pl.target))}${pl.floored ? ` <span class="tag">${t('calc.min')}</span>` : ''}</td>
      ${goalKg != null ? `<td class="num">${when}</td>` : ''}</tr>`;
  }).join('');
  paces.innerHTML = `<div class="card-head"><h2>${t('calc.compare')}</h2>${goalKg != null ? `<span class="muted small">${t('calc.goalW', { w: fmtW(goalKg, u) })}</span>` : ''}</div>
    <div class="table-wrap"><table class="pace-table">
      <thead><tr><th>${t('calc.colChange')}</th><th class="num">${t('calc.colKcal')}</th>${goalKg != null ? `<th class="num">${t('calc.colReach')}</th>` : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="note">${t('calc.tableNote')}</p>`;
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
    commit(t('calc.actSaved'));
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
