import { app, commit, go, unit as profileUnit } from '../app';
import { blankProfile, newId, type Lang, type Sex, type Unit } from '../data/schema';
import { t, type Key } from '../i18n';
import { addDays, fmtDate, todayISO } from '../lib/dates';
import { suggestGoal } from '../lib/health';
import { CM_IN, deltaUnit, disp, fromDisp, isMetric, splitStone } from '../lib/units';
import { $, esc } from './dom';
import { resetCalories } from './views/calories';

// A short setup for a new profile: shown on the first visit, and from
// "Create my profile". Every step can be skipped; on the first visit,
// "Just look around first" keeps the example profile instead.

/** Set once the setup has been offered in this browser, so it shows only on the very first visit. */
export const SETUP_SEEN_KEY = 'tare.setupSeen';

interface Draft {
  name: string; unit: Unit; sex: Sex; birthYear: number | null; heightCm: number | null;
  weightKg: number | null; goalKg: number | null; goalDate: string | null;
}

let draft: Draft;
let step = 1;
let firstRun = false;
const STEPS = 4;

const num = (id: string): number | null => {
  const el = document.querySelector<HTMLInputElement>('#' + id);
  if (!el || el.value.trim() === '') return null;
  const v = parseFloat(el.value.replace(',', '.'));
  return isFinite(v) ? v : null;
};

function dialog(): HTMLDialogElement {
  let d = document.querySelector<HTMLDialogElement>('#setupDlg');
  if (d) return d;
  d = document.createElement('dialog');
  d.id = 'setupDlg';
  d.className = 'setup-dlg';
  d.setAttribute('aria-labelledby', 'setupTitle');
  document.body.append(d);
  // Escape on the first visit means "just look around", like the button.
  d.addEventListener('cancel', () => { if (firstRun) markSeen(); });
  return d;
}

function markSeen(): void {
  try { localStorage.setItem(SETUP_SEEN_KEY, '1'); } catch { /* shows again next first visit; harmless */ }
}

/** Whether to offer the setup now: a first visit in a browser that hasn't seen it. */
export function shouldOfferSetup(): boolean {
  try { return localStorage.getItem(SETUP_SEEN_KEY) !== '1'; } catch { return false; }
}

export function openSetup(opts: { firstRun: boolean }): void {
  firstRun = opts.firstRun;
  step = 1;
  draft = { name: '', unit: profileUnit(), sex: 'f', birthYear: null, heightCm: null, weightKg: null, goalKg: null, goalDate: null };
  if (firstRun) markSeen();
  draw();
  dialog().showModal();
}

/** Reads the current step's fields into the draft. */
function read(): void {
  const u = draft.unit;
  if (step === 1) {
    draft.name = $<HTMLInputElement>('#suName').value.trim();
  } else if (step === 2) {
    draft.sex = $<HTMLSelectElement>('#suSex').value === 'm' ? 'm' : 'f';
    const y = num('suYear');
    draft.birthYear = y && y >= 1900 && y <= new Date().getFullYear() ? Math.round(y) : null;
    if (isMetric(u)) draft.heightCm = num('suCm');
    else { const ft = num('suFt'), inch = num('suIn') ?? 0; draft.heightCm = ft != null ? +((ft * 12 + inch) * CM_IN).toFixed(1) : null; }
    if (draft.heightCm != null && (draft.heightCm < 90 || draft.heightCm > 250)) draft.heightCm = null;
  } else if (step === 3) {
    let kg: number | null;
    if (u === 'st') { const st = num('suSt'), lb = num('suLb') ?? 0; kg = st != null ? fromDisp(st * 14 + lb, 'lb') : null; }
    else { const w = num('suW'); kg = w != null ? fromDisp(w, u) : null; }
    draft.weightKg = kg != null && kg >= 20 && kg <= 400 ? Math.round(kg * 100) / 100 : null;
    const g = num('suGoal');
    const gKg = g != null ? fromDisp(g, u) : null; // stones show single weights in pounds
    draft.goalKg = gKg != null && gKg >= 20 && gKg <= 400 ? +gKg.toFixed(2) : null;
    draft.goalDate = $<HTMLInputElement>('#suGoalDate').value || null;
  }
}

function weightField(): string {
  const u = draft.unit, kg = draft.weightKg;
  if (u === 'st') {
    const s = kg != null ? splitStone(kg) : null;
    return `<div class="fields"><label class="f">${t('entry.stones')}<input id="suSt" type="number" inputmode="numeric" min="2" max="60" value="${s?.st ?? ''}"></label>
      <label class="f">${t('entry.pounds')}<input id="suLb" type="number" inputmode="decimal" min="0" max="13.9" step="0.1" value="${s ? s.lb.toFixed(1) : ''}"></label></div>`;
  }
  return `<label class="f">${t('setup.weightToday', { unit: u })}<input id="suW" type="number" inputmode="decimal" step="0.1" min="20" value="${kg != null ? disp(kg, u).toFixed(1) : ''}"></label>`;
}

function body(): string {
  const u = draft.unit, s = app.data.settings;
  if (step === 1) {
    return `<p class="flush">${t(firstRun ? 'setup.welcomeText' : 'setup.newText')}</p>
      <div class="fields">
        <label class="f">${t('profile.name')}<input id="suName" maxlength="40" autocomplete="given-name" value="${esc(draft.name)}" placeholder="${esc(t('profile.defaultName'))}"></label>
        ${firstRun ? `<label class="f">${t('settings.language')}<select id="suLang">
          ${(['auto', 'en', 'cs'] as Lang[]).map(l => `<option value="${l}" ${s.lang === l ? 'selected' : ''}>${l === 'auto' ? t('setup.langAuto') : l === 'en' ? 'English' : 'Čeština'}</option>`).join('')}</select></label>` : ''}
      </div>
      ${firstRun ? `<div class="f"><span>${t('header.units')}</span><div class="seg" role="group" aria-label="${esc(t('header.units'))}">
        ${(['kg', 'lb', 'st'] as Unit[]).map(x => `<button type="button" data-su-unit="${x}" aria-pressed="${u === x}">${x}</button>`).join('')}</div></div>` : ''}`;
  }
  if (step === 2) {
    const hIn = draft.heightCm ? draft.heightCm / CM_IN : null;
    return `<p class="flush">${t('setup.aboutText')}</p>
      <div class="fields">
        <label class="f">${t('common.sex')}<select id="suSex"><option value="f" ${draft.sex === 'f' ? 'selected' : ''}>${t('common.female')}</option><option value="m" ${draft.sex === 'm' ? 'selected' : ''}>${t('common.male')}</option></select></label>
        <label class="f">${t('profile.birthYear')}<input id="suYear" type="number" inputmode="numeric" min="1900" max="${new Date().getFullYear()}" value="${draft.birthYear ?? ''}"></label>
        ${isMetric(u)
          ? `<label class="f">${t('common.heightCm')}<input id="suCm" type="number" inputmode="decimal" min="90" max="250" step="0.5" value="${draft.heightCm ?? ''}"></label>`
          : `<div class="f"><span>${t('common.height')}</span><div class="inline-in"><input id="suFt" type="number" min="3" max="8" aria-label="${esc(t('common.feet'))}" value="${hIn ? Math.floor(hIn / 12) : ''}"><span>ft</span><input id="suIn" type="number" min="0" max="11.9" step="0.1" aria-label="${esc(t('common.inches'))}" value="${hIn ? (hIn % 12).toFixed(1) : ''}"><span>in</span></div></div>`}
      </div>`;
  }
  if (step === 3) {
    return `<p class="flush">${t('setup.weightText')}</p>
      ${weightField()}
      <div class="fields">
        <label class="f">${t('profile.goalWeight', { unit: deltaUnit(u) })}<input id="suGoal" type="number" inputmode="decimal" step="0.1" min="20" value="${draft.goalKg != null ? disp(draft.goalKg, u).toFixed(1) : ''}"></label>
        <label class="f">${t('profile.goalDate')}<input id="suGoalDate" type="date" min="${todayISO()}" value="${draft.goalDate ?? ''}"></label>
      </div>
      <div class="actions start"><button type="button" class="btn" id="suSuggest">${t('profile.suggest')}</button></div>
      <p class="note flush" id="suSuggestNote" hidden></p>`;
  }
  return `<p class="flush">${t('setup.historyText')}</p>
    <div class="actions start"><button type="button" class="btn" id="suImport">${t('backup.csvImport')}</button><button type="button" class="btn" id="suRestore">${t('backup.restore')}</button></div>
    ${app.data.profiles.some(p => !p.sample) ? '' : `<p class="note flush">${t('setup.exampleGoes')}</p>`}`;
}

function draw(): void {
  const d = dialog();
  const titles: Key[] = [firstRun ? 'setup.welcome' : 'setup.new', 'setup.about', 'setup.weight', 'setup.history'];
  d.innerHTML = `<form class="form" id="setupForm" novalidate>
    <div class="card-head flush"><h2 id="setupTitle">${t(titles[step - 1])}</h2><span class="muted small">${t('setup.step', { n: step, of: STEPS })}</span></div>
    ${body()}
    <div class="actions">
      ${step === 1
        ? `<button type="button" class="btn spacer btn-wrap" id="suLater">${t(firstRun ? 'setup.lookAround' : 'common.cancel')}</button>`
        : `<button type="button" class="btn spacer" id="suBack">${t('common.back')}</button>`}
      ${step > 1 && step < STEPS ? `<button type="button" class="btn ghost" id="suSkip">${t('setup.skip')}</button>` : ''}
      <button type="submit" class="btn primary">${t(step < STEPS ? 'setup.next' : 'setup.finish')}</button>
    </div>
  </form>`;
  bind();
  setTimeout(() => d.querySelector<HTMLElement>('input, select')?.focus(), 30);
}

function bind(): void {
  const d = dialog();
  $('#setupForm').addEventListener('submit', ev => {
    ev.preventDefault();
    read();
    if (step < STEPS) { step++; draw(); } else finish('overview');
  });
  $('#suLater')?.addEventListener('click', () => d.close());
  $('#suBack')?.addEventListener('click', () => { read(); step--; draw(); });
  $('#suSkip')?.addEventListener('click', () => { step++; draw(); });
  d.querySelectorAll<HTMLButtonElement>('[data-su-unit]').forEach(b => b.addEventListener('click', () => {
    read();
    draft.unit = b.dataset.suUnit as Unit;
    draw();
  }));
  $('#suLang')?.addEventListener('change', ev => {
    read();
    app.data.settings.lang = (ev.target as HTMLSelectElement).value as Lang;
    app.applyLanguage();
    app.render();
    draw();
  });
  $('#suSuggest')?.addEventListener('click', () => {
    read();
    const note = $('#suSuggestNote');
    note.hidden = false;
    const sg = draft.weightKg != null ? suggestGoal({ ...draft, frame: 'medium' }, draft.weightKg) : null;
    if (!sg) { note.textContent = t('setup.suggestNeed'); return; }
    const date = addDays(todayISO(), sg.weeks * 7);
    $<HTMLInputElement>('#suGoal').value = disp(sg.goalKg, draft.unit).toFixed(1);
    $<HTMLInputElement>('#suGoalDate').value = date;
    note.textContent = t('setup.suggestNote', { weeks: sg.weeks, date: fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' }) });
  });
  // Importing or restoring opens the file picker straight away, while the click still counts as the person's own.
  $('#suImport')?.addEventListener('click', () => { finish('profile'); $<HTMLButtonElement>('#csvImport')?.click(); });
  $('#suRestore')?.addEventListener('click', () => { finish('profile'); $<HTMLButtonElement>('#bkRestore')?.click(); });
}

function finish(then: 'overview' | 'profile'): void {
  const p = blankProfile(draft.name || t(app.data.profiles.some(x => !x.sample) ? 'profile.newName' : 'profile.defaultName'), draft.unit);
  p.sex = draft.sex;
  p.birthYear = draft.birthYear;
  p.heightCm = draft.heightCm;
  p.goalKg = draft.goalKg;
  p.goalDate = draft.goalKg != null ? draft.goalDate : null;
  if (draft.weightKg != null) p.entries.push({ id: newId('e_'), date: todayISO(), kg: draft.weightKg, updatedAt: Date.now() });
  // Your own profile replaces the example, unless you already have real ones.
  if (!app.data.profiles.some(x => !x.sample)) app.data.profiles = [];
  app.data.profiles.push(p);
  app.data.activeId = p.id;
  app.data.unit = draft.unit;
  resetCalories();
  dialog().close();
  go(then);
  commit(t('setup.done', { name: p.name }));
}
